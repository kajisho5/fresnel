/** Node-only helpers: read and write `.icon` bundle directories (and .icon.zip). */
import { lstat, mkdir, readdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isSafeBundlePath, readBundle, unzipBundle, writeBundle, type FileMap } from './bundle';
import type { IconDocument } from './model';

export type LoadedIcon = IconDocument & { extra: FileMap };

async function walk(root: string, dir = root, out: FileMap = {}): Promise<FileMap> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(root, p, out);
    else if (e.isFile()) out[relative(root, p).split(sep).join('/')] = new Uint8Array(await readFile(p));
  }
  return out;
}

export async function loadIcon(path: string): Promise<LoadedIcon> {
  const st = await stat(path);
  if (st.isDirectory()) return readBundle(await walk(path));
  const bytes = new Uint8Array(await readFile(path));
  if (path.endsWith('.zip')) return unzipBundle(bytes);
  if (path.endsWith('icon.json')) return loadIcon(dirname(path));
  throw new Error(`${path} is not an .icon bundle (folder) or .icon.zip`);
}

/** Throws if `p` (or any existing directory between `root` and `p`) is a symlink. */
async function assertNoSymlink(root: string, p: string): Promise<void> {
  const rel = relative(root, p);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Refusing to write outside the bundle: ${p}`);
  let cur = root;
  for (const part of rel ? rel.split(sep) : []) {
    cur = join(cur, part);
    try {
      if ((await lstat(cur)).isSymbolicLink()) throw new Error(`Refusing to follow a symbolic link inside the bundle: ${relative(root, cur)}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
  }
}

/**
 * Writes a bundle directory atomically enough for editors: icon.json is written
 * via a temp file + rename, assets that are no longer referenced are removed
 * from Assets/ only. Other files in the bundle are left untouched.
 * Symbolic links inside the bundle are never followed (so a crafted bundle
 * can't make fresnel write or delete files elsewhere).
 */
/** Returns the paths written. */
export async function saveIcon(path: string, doc: LoadedIcon | IconDocument): Promise<string[]> {
  const root = resolve(path);
  if ((await lstat(root).catch(() => null))?.isSymbolicLink()) throw new Error(`Refusing to save through a symbolic link: ${path}`);
  const files = writeBundle(doc, 'extra' in doc ? doc.extra : {});
  const assetsDir = join(root, 'Assets');
  await assertNoSymlink(root, assetsDir);
  await mkdir(assetsDir, { recursive: true });
  const written: string[] = [];
  for (const [rel, bytes] of Object.entries(files)) {
    const target = resolve(root, ...rel.split('/'));
    await assertNoSymlink(root, target);
    await mkdir(dirname(target), { recursive: true });
    await assertNoSymlink(root, target);
    const tmp = `${target}.fresnel-tmp`;
    await rm(tmp, { force: true });
    await writeFile(tmp, bytes, { flag: 'wx' });
    await rename(tmp, target);
    written.push(target);
  }
  const keep = new Set(Object.keys(doc.assets));
  await assertNoSymlink(root, assetsDir);
  for (const e of await readdir(assetsDir, { withFileTypes: true })) {
    // Dirent.isFile() is false for symlinks, so links are never removed through. Only files fresnel could
    // have read are removed: hidden files and names it skips when reading (e.g. "a:b.svg") are left alone.
    if (!e.isFile() || keep.has(e.name)) continue;
    if (e.name.endsWith('.fresnel-tmp') || (isSafeBundlePath(`Assets/${e.name}`) && !e.name.startsWith('.'))) await rm(join(assetsDir, e.name));
  }
  return written;
}

export async function writeFiles(dir: string, files: Record<string, Uint8Array>): Promise<string[]> {
  const written: string[] = [];
  const root = resolve(dir);
  if ((await lstat(root).catch(() => null))?.isSymbolicLink()) throw new Error(`Refusing to write through a symbolic link: ${dir}`);
  for (const [rel, bytes] of Object.entries(files)) {
    const target = resolve(root, ...rel.split('/'));
    const r = relative(root, target);
    if (r.startsWith('..') || isAbsolute(r)) throw new Error(`Refusing to write outside ${dir}: ${rel}`);
    await assertNoSymlink(root, target);
    await mkdir(dirname(target), { recursive: true });
    await assertNoSymlink(root, target);
    await writeFile(target, bytes);
    written.push(target);
  }
  return written;
}
