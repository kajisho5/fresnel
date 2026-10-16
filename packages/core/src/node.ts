/** Node-only helpers: read and write `.icon` bundle directories (and .icon.zip). */
import { mkdir, readdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { readBundle, unzipBundle, writeBundle, type FileMap } from './bundle';
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

/**
 * Writes a bundle directory atomically enough for editors: icon.json is written
 * via a temp file + rename, assets that are no longer referenced are removed
 * from Assets/ only. Other files in the bundle are left untouched.
 */
export async function saveIcon(path: string, doc: LoadedIcon | IconDocument): Promise<void> {
  const files = writeBundle(doc, 'extra' in doc ? doc.extra : {});
  await mkdir(join(path, 'Assets'), { recursive: true });
  for (const [rel, bytes] of Object.entries(files)) {
    const target = join(path, ...rel.split('/'));
    if (!target.startsWith(path)) throw new Error(`Refusing to write outside the bundle: ${rel}`);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.fresnel-tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);
  }
  const keep = new Set(Object.keys(doc.assets));
  for (const e of await readdir(join(path, 'Assets'), { withFileTypes: true })) {
    if (e.isFile() && !keep.has(e.name) && e.name !== '.DS_Store') await rm(join(path, 'Assets', e.name));
  }
}

export async function writeFiles(dir: string, files: Record<string, Uint8Array>): Promise<string[]> {
  const written: string[] = [];
  for (const [rel, bytes] of Object.entries(files)) {
    const target = join(dir, ...rel.split('/'));
    if (relative(dir, target).startsWith('..')) throw new Error(`Refusing to write outside ${dir}: ${rel}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    written.push(target);
  }
  return written;
}
