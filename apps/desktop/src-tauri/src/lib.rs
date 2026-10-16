//! fresnel desktop shell. All icon logic lives in TypeScript (@fresnel/core);
//! Rust only does file I/O, watching and calling Apple's actool on macOS.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    /// Paths fresnel itself wrote recently; their change events are ignored.
    own_writes: Mutex<HashMap<String, Instant>>,
}

const OWN_WRITE_GRACE: Duration = Duration::from_millis(1500);

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Joins a relative bundle path safely (no absolute paths, no "..").
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() || rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Refusing to write outside the target folder: {rel}"));
    }
    Ok(root.join(rel_path))
}

fn walk(root: &Path, dir: &Path, out: &mut HashMap<String, String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == ".DS_Store" {
            continue;
        }
        let path = entry.path();
        let ft = entry.file_type()?;
        if ft.is_dir() {
            walk(root, &path, out)?;
        } else if ft.is_file() {
            let rel = path.strip_prefix(root).unwrap_or(&path);
            let key = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
            out.insert(key, B64.encode(fs::read(&path)?));
        }
    }
    Ok(())
}

#[tauri::command]
fn read_bundle(path: String) -> Result<HashMap<String, String>, String> {
    let root = PathBuf::from(&path);
    if !root.join("icon.json").is_file() {
        return Err(format!("{path} is not an .icon bundle (icon.json not found)"));
    }
    let mut out = HashMap::new();
    walk(&root, &root, &mut out).map_err(err)?;
    Ok(out)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read(&path).map(|b| B64.encode(b)).map_err(err)
}

fn write_map(root: &Path, files: &HashMap<String, String>) -> Result<usize, String> {
    for (rel, data) in files {
        let target = safe_join(root, rel)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        let bytes = B64.decode(data).map_err(err)?;
        // write via temp file + rename so a watcher never sees a half-written file
        let tmp = target.with_extension("fresnel-tmp");
        fs::write(&tmp, bytes).map_err(err)?;
        fs::rename(&tmp, &target).map_err(err)?;
    }
    Ok(files.len())
}

#[tauri::command]
fn write_bundle(state: State<AppState>, path: String, files: HashMap<String, String>, keep_assets: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(&path);
    state.own_writes.lock().unwrap().insert(path.clone(), Instant::now());
    fs::create_dir_all(root.join("Assets")).map_err(err)?;
    write_map(&root, &files)?;
    for entry in fs::read_dir(root.join("Assets")).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().map_err(err)?.is_file() && name != ".DS_Store" && !keep_assets.contains(&name) {
            fs::remove_file(entry.path()).map_err(err)?;
        }
    }
    state.own_writes.lock().unwrap().insert(path, Instant::now());
    Ok(())
}

#[tauri::command]
fn write_files(dir: String, files: HashMap<String, String>) -> Result<usize, String> {
    write_map(Path::new(&dir), &files)
}

#[tauri::command]
fn watch_bundle(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    if watchers.contains_key(&path) {
        return Ok(());
    }
    let key = path.clone();
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
            return;
        }
        if event.paths.iter().all(|p| p.extension().map(|e| e == "fresnel-tmp").unwrap_or(false)) {
            return;
        }
        let state = handle.state::<AppState>();
        if let Some(t) = state.own_writes.lock().unwrap().get(&key) {
            if t.elapsed() < OWN_WRITE_GRACE {
                return;
            }
        }
        let _ = handle.emit("bundle-changed", key.clone());
    })
    .map_err(err)?;
    watcher.watch(Path::new(&path), RecursiveMode::Recursive).map_err(err)?;
    watchers.insert(path, watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_bundle(state: State<AppState>, path: String) {
    state.watchers.lock().unwrap().remove(&path);
}

#[tauri::command]
fn actool_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("xcrun")
            .args(["--find", "actool"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Compiles an .icon bundle into Assets.car with Apple's actool (macOS + Xcode 26 or later).
#[tauri::command]
fn compile_car(icon_path: String, out_dir: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let name = Path::new(&icon_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "AppIcon".into());
        fs::create_dir_all(&out_dir).map_err(err)?;
        let plist = Path::new(&out_dir).join("partial-info.plist");
        let out = std::process::Command::new("xcrun")
            .arg("actool")
            .arg(&icon_path)
            .args(["--compile", &out_dir, "--app-icon", &name, "--include-all-app-icons"])
            .args(["--platform", "macosx", "--minimum-deployment-target", "26.0"])
            .arg("--output-partial-info-plist")
            .arg(&plist)
            .args(["--errors", "--warnings", "--output-format", "human-readable-text"])
            .output()
            .map_err(err)?;
        let log = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        if out.status.success() && Path::new(&out_dir).join("Assets.car").is_file() {
            Ok(log)
        } else {
            Err(format!("actool failed:\n{log}"))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (icon_path, out_dir);
        Err("Assets.car can only be compiled on macOS with Xcode 26 or later.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            read_bundle,
            read_file,
            write_bundle,
            write_files,
            watch_bundle,
            unwatch_bundle,
            actool_available,
            compile_car
        ])
        .run(tauri::generate_context!())
        .expect("error while running fresnel");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_escapes() {
        let root = Path::new("/tmp/x");
        assert!(safe_join(root, "Assets/a.svg").is_ok());
        assert!(safe_join(root, "../evil").is_err());
        assert!(safe_join(root, "/etc/passwd").is_err());
        assert!(safe_join(root, "Assets/../../evil").is_err());
    }

    #[test]
    fn round_trips_a_bundle() {
        let dir = std::env::temp_dir().join(format!("fresnel-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut files = HashMap::new();
        files.insert("icon.json".to_string(), B64.encode(b"{\"groups\":[]}"));
        files.insert("Assets/a.svg".to_string(), B64.encode(b"<svg/>"));
        write_map(&dir, &files).unwrap();
        fs::write(dir.join("Assets/stale.svg"), b"x").unwrap();
        let read = read_bundle(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.len(), 3);
        assert_eq!(B64.decode(&read["icon.json"]).unwrap(), b"{\"groups\":[]}");
        fs::remove_dir_all(&dir).unwrap();
    }
}
