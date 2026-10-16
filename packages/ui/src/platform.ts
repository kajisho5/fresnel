import { readBundle, writeBundle, zipBundle, zipFiles, unzipBundle, type IconDocument } from '@fresnel/core';
import type { FileMap } from './store/doc';

export interface Opened {
  doc: IconDocument;
  extra: FileMap;
  name: string;
  location: string | null;
}

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Everything that touches the file system goes through a Platform so the same UI
 * runs in the browser and in the Tauri desktop app.
 */
export interface Platform {
  kind: 'web' | 'desktop';
  /** "Save" writes back to the opened location (desktop, or browsers with the File System Access API) */
  canSaveInPlace(location: string | null): boolean;
  open(): Promise<Opened | null>;
  save(doc: IconDocument, extra: FileMap, name: string, location: string | null): Promise<{ location: string | null; name: string } | null>;
  saveAs(doc: IconDocument, extra: FileMap, name: string): Promise<{ location: string | null; name: string } | null>;
  pickImages(): Promise<PickedFile[]>;
  /** Writes exported files. Returns a human-readable destination or null if cancelled. */
  writeExport(files: FileMap, suggestedName: string): Promise<string | null>;
  /** Assets.car via Apple's actool (macOS desktop only) */
  actoolAvailable(): Promise<boolean>;
  /** Compiles <bundlePath> into <outDir>/Assets.car. Only where actoolAvailable() is true. */
  compileCar?(bundlePath: string, outDir: string): Promise<string>;
  /** Watches the opened bundle for external changes (e.g. edits made through MCP). */
  watch?(location: string, onChange: () => void): () => void;
  reload?(location: string): Promise<Opened>;
}

// ---------------------------------------------------------------- web implementation

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
};

const handles = new Map<string, DirHandle>();
let handleSeq = 0;

async function readDir(dir: DirHandle, prefix = '', out: FileMap = {}): Promise<FileMap> {
  for await (const entry of dir.values()) {
    if (entry.name === '.DS_Store') continue;
    if (entry.kind === 'directory') await readDir(entry as DirHandle, `${prefix}${entry.name}/`, out);
    else out[`${prefix}${entry.name}`] = new Uint8Array(await (await (entry as FileSystemFileHandle).getFile()).arrayBuffer());
  }
  return out;
}

async function writeDir(dir: DirHandle, files: FileMap, keepAssets: Set<string>) {
  for (const [rel, bytes] of Object.entries(files)) {
    const parts = rel.split('/');
    let d: FileSystemDirectoryHandle = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts.at(-1)!, { create: true });
    const w = await fh.createWritable();
    await w.write(bytes as unknown as ArrayBuffer);
    await w.close();
  }
  const assets = (await dir.getDirectoryHandle('Assets', { create: true })) as DirHandle;
  for await (const e of assets.values()) if (e.kind === 'file' && !keepAssets.has(e.name) && e.name !== '.DS_Store') await assets.removeEntry(e.name);
}

function pickFiles(accept: string, opts: { multiple?: boolean; directory?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = !!opts.multiple;
    if (opts.directory) (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export function download(bytes: Uint8Array, filename: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const stripIcon = (n: string) => n.replace(/\.icon(\.zip)?$/i, '').replace(/\.zip$/i, '');

/** Reads dropped / picked files: a .zip, a folder (webkitRelativePath) or loose files. */
export async function bundleFromFiles(files: File[]): Promise<Opened | null> {
  const zip = files.find((f) => /\.zip$/i.test(f.name));
  if (zip) {
    const b = unzipBundle(new Uint8Array(await zip.arrayBuffer()));
    return { doc: b, extra: b.extra, name: stripIcon(zip.name), location: null };
  }
  const map: FileMap = {};
  let root = '';
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    map[rel] = new Uint8Array(await f.arrayBuffer());
    if (rel.endsWith('icon.json')) root = rel.slice(0, -'icon.json'.length);
  }
  if (!Object.keys(map).some((k) => k.endsWith('icon.json'))) return null;
  const b = readBundle(map);
  const name = stripIcon(root.split('/').filter(Boolean).at(-1) ?? 'Untitled');
  return { doc: b, extra: b.extra, name, location: null };
}

export const webPlatform: Platform = {
  kind: 'web',
  canSaveInPlace: (location) => !!location && handles.has(location),

  async open() {
    const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> };
    if (w.showDirectoryPicker) {
      try {
        const dir = await w.showDirectoryPicker({ id: 'fresnel-icon', mode: 'readwrite' });
        const b = readBundle(await readDir(dir));
        const key = `fsa:${++handleSeq}`;
        handles.set(key, dir);
        return { doc: b, extra: b.extra, name: stripIcon(dir.name), location: key };
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return null;
        throw e;
      }
    }
    const files = await pickFiles('.zip,application/zip');
    return files.length ? bundleFromFiles(files) : null;
  },

  async save(doc, extra, name, location) {
    const dir = location ? handles.get(location) : undefined;
    if (dir) {
      await writeDir(dir, writeBundle(doc, extra), new Set(Object.keys(doc.assets)));
      return { location, name };
    }
    return this.saveAs(doc, extra, name);
  },

  async saveAs(doc, extra, name) {
    download(zipBundle(doc, name, extra), `${name}.icon.zip`, 'application/zip');
    return { location: null, name };
  },

  async pickImages() {
    const files = await pickFiles('.svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg', { multiple: true });
    return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  },

  async writeExport(files, suggestedName) {
    const filename = `${suggestedName}-export.zip`;
    download(zipFiles(files), filename, 'application/zip');
    return filename;
  },

  async actoolAvailable() {
    return false;
  },
};
