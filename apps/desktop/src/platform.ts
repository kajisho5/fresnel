/** Desktop (Tauri v2) implementation of the fresnel Platform. */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readBundle, writeBundle, type IconDocument } from '@fresnel/core';
import type { Opened, Platform } from '@fresnel/ui';

type B64Map = Record<string, string>;
type FileMap = Record<string, Uint8Array>;

const isMac = navigator.userAgent.includes('Mac');

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const encodeMap = (m: FileMap): B64Map => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, toB64(v)]));
const decodeMap = (m: B64Map): FileMap => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fromB64(v)]));
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Untitled';
const stripIcon = (n: string) => n.replace(/\.icon$/i, '');

async function load(path: string): Promise<Opened> {
  const files = decodeMap(await invoke<B64Map>('read_bundle', { path }));
  const b = readBundle(files);
  return { doc: b, extra: b.extra, name: stripIcon(baseName(path)), location: path };
}

async function write(path: string, doc: IconDocument, extra: FileMap) {
  await invoke('write_bundle', { path, files: encodeMap(writeBundle(doc, extra)), keepAssets: Object.keys(doc.assets) });
}

export const desktopPlatform: Platform & { compileCar(bundlePath: string, outDir: string): Promise<string> } = {
  kind: 'desktop',
  canSaveInPlace: (location) => !!location,

  async open() {
    // On macOS .icon bundles are packages (Info.plist imports the type as com.apple.package) and show up
    // as files; elsewhere they are folders. If the system still treats it as a folder, offer a folder picker.
    let picked = isMac
      ? await openDialog({ title: 'Open .icon', multiple: false, filters: [{ name: 'Icon Composer icon', extensions: ['icon'] }] })
      : await openDialog({ title: 'Open .icon folder', multiple: false, directory: true });
    if (!picked && isMac && window.confirm('Choose the .icon as a folder instead?')) {
      picked = await openDialog({ title: 'Open .icon folder', multiple: false, directory: true });
    }
    if (!picked || Array.isArray(picked)) return null;
    return load(picked);
  },

  async reload(location) {
    return load(location);
  },

  async save(doc, extra, name, location) {
    if (!location) return this.saveAs(doc, extra, name);
    await write(location, doc, extra);
    return { location, name };
  },

  async saveAs(doc, extra, name) {
    let path = await saveDialog({ title: 'Save .icon', defaultPath: `${name}.icon`, filters: [{ name: 'Icon Composer icon', extensions: ['icon'] }] });
    if (!path) return null;
    if (!path.toLowerCase().endsWith('.icon')) path += '.icon';
    await write(path, doc, extra);
    return { location: path, name: stripIcon(baseName(path)) };
  },

  async pickImages() {
    // the dialog runs in Rust, which reads only what the user picked
    const picked = await invoke<[string, string][]>('pick_images');
    return picked.map(([name, b64]) => ({ name, bytes: fromB64(b64) }));
  },

  async writeExport(files) {
    const dir = await openDialog({ title: 'Choose an export folder', directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return null;
    await invoke('write_files', { dir, files: encodeMap(files) });
    return dir;
  },

  async compileCar(bundlePath, outDir) {
    return invoke<string>('compile_car', { iconPath: bundlePath, outDir });
  },

  async actoolAvailable() {
    return invoke<boolean>('actool_available');
  },

  watch(location, onChange) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    let stopped = false;
    invoke('watch_bundle', { path: location }).catch(() => undefined);
    listen<string>('bundle-changed', (e) => {
      if (e.payload !== location) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 300);
    }).then((u) => (stopped ? u() : (unlisten = u)));
    return () => {
      stopped = true;
      clearTimeout(timer);
      unlisten?.();
      invoke('unwatch_bundle', { path: location }).catch(() => undefined);
    };
  },
};
