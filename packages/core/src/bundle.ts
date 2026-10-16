import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { makeAsset } from './image';
import type { Asset, GroupNode, IconDocument, LayerNode } from './model';
import { newId } from './model';
import { readProps, writeProps } from './prop';
import { IconJsonSchema } from './schema';

/** A bundle as a flat file map: "icon.json", "Assets/<name>", plus any other files (kept verbatim). */
export type FileMap = Record<string, Uint8Array>;

export class IconFormatError extends Error {
  override name = 'IconFormatError';
}

export function parseIconJson(text: string): Omit<IconDocument, 'assets'> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IconFormatError(`icon.json is not valid JSON: ${(e as Error).message}`);
  }
  const shape = IconJsonSchema.safeParse(raw);
  if (!shape.success) {
    throw new IconFormatError(`icon.json has an unexpected shape: ${shape.error.issues[0]?.path.join('.')} ${shape.error.issues[0]?.message}`);
  }
  const obj = raw as Record<string, unknown>;
  const groupsRaw = (obj.groups as Record<string, unknown>[]) ?? [];
  const groups: GroupNode[] = groupsRaw.map((g) => {
    const layersRaw = (g.layers as Record<string, unknown>[]) ?? [];
    const layers: LayerNode[] = layersRaw.map((l) => ({ id: newId('l'), ...readProps(l) }));
    return { id: newId('g'), ...readProps(g), layers };
  });
  return { ...readProps(obj), groups };
}

export function serializeIconJson(doc: Pick<IconDocument, 'props' | 'order' | 'groups'>): string {
  const groups = doc.groups.map((g) =>
    writeProps(g.props, g.order, {
      layers: g.layers.map((l) => writeProps(l.props, l.order)),
    }),
  );
  const json = writeProps(doc.props, doc.order, { groups });
  // Icon Composer writes "key" : value with 2-space indent
  return JSON.stringify(json, null, 2).replace(/^(\s*"[^"]*"):/gm, '$1 :') + '\n';
}

export function readBundle(files: FileMap): IconDocument & { extra: FileMap } {
  const jsonKey = Object.keys(files).find((k) => k === 'icon.json' || k.endsWith('/icon.json'));
  if (!jsonKey) throw new IconFormatError('icon.json not found in the bundle');
  const prefix = jsonKey.slice(0, -'icon.json'.length);
  const base = parseIconJson(strFromU8(files[jsonKey]!));
  const assets: Record<string, Asset> = {};
  const extra: FileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (!k.startsWith(prefix) || k === jsonKey || k.endsWith('/')) continue;
    const rel = k.slice(prefix.length);
    if (rel.startsWith('Assets/') && rel.split('/').length === 2) {
      const name = rel.slice('Assets/'.length);
      if (name && !name.startsWith('.')) assets[name] = makeAsset(name, v);
    } else if (!rel.split('/').some((p) => p === '__MACOSX' || p === '.DS_Store')) {
      extra[rel] = v;
    }
  }
  return { ...base, assets, extra };
}

export function writeBundle(doc: IconDocument, extra: FileMap = {}): FileMap {
  const files: FileMap = { ...extra };
  files['icon.json'] = strToU8(serializeIconJson(doc));
  for (const a of Object.values(doc.assets)) files[`Assets/${a.name}`] = a.bytes;
  return files;
}

/** `.icon.zip` (used by the web app, where folders can't be read or written). */
export function zipBundle(doc: IconDocument, folderName: string, extra: FileMap = {}): Uint8Array {
  const files = writeBundle(doc, extra);
  const z: Record<string, Uint8Array> = {};
  const root = folderName.endsWith('.icon') ? folderName : `${folderName}.icon`;
  for (const [k, v] of Object.entries(files)) z[`${root}/${k}`] = v;
  return zipSync(z, { level: 6 });
}

export function unzipBundle(zip: Uint8Array): IconDocument & { extra: FileMap } {
  const files = unzipSync(zip);
  return readBundle(files);
}

export function zipFiles(files: FileMap): Uint8Array {
  return zipSync(files, { level: 6 });
}
