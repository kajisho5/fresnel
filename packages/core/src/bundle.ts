import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { makeAsset } from './image';
import type { Asset, GroupNode, IconDocument, LayerNode } from './model';
import { newId } from './model';
import { baseValue, readProps, setPropValue, writeProps } from './prop';
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

/** A relative path inside a bundle that is safe to write anywhere: no "..", no absolute or drive paths, no backslashes, control characters or hidden segments. */
export function isSafeBundlePath(rel: string): boolean {
  if (!rel || rel.length > 512 || rel.startsWith('/') || /[\\\u0000-\u001f:]/.test(rel)) return false;
  return rel.split('/').every((p) => p !== '' && p !== '.' && p !== '..' && !p.startsWith('.') && p.length <= 255);
}

export function readBundle(files: FileMap): IconDocument & { extra: FileMap } {
  // the shallowest icon.json is the bundle's own (a nested Backup/icon.json must not win)
  const jsonKey = Object.keys(files)
    .filter((k) => k === 'icon.json' || k.endsWith('/icon.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0];
  if (!jsonKey) throw new IconFormatError('icon.json not found in the bundle');
  const prefix = jsonKey.slice(0, -'icon.json'.length);
  const base = parseIconJson(strFromU8(files[jsonKey]!));
  const assets: Record<string, Asset> = {};
  const extra: FileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (!k.startsWith(prefix) || k === jsonKey || k.endsWith('/')) continue;
    const rel = k.slice(prefix.length);
    // never carry unsafe paths (zip-slip), hidden files or folders (.git, .env) into saves and exports
    if (!isSafeBundlePath(rel) || rel.endsWith('.fresnel-tmp')) continue;
    if (rel.startsWith('Assets/') && rel.split('/').length === 2) {
      const name = rel.slice('Assets/'.length);
      if (name) assets[name] = makeAsset(name, v);
    } else if (!rel.split('/').some((p) => p === '__MACOSX')) {
      extra[rel] = v;
    }
  }
  return { ...base, assets, extra };
}

/**
 * Keeps the top-level "features" list in sync with what the document uses.
 * [推測] Based on kylebshr/decant: Icon Composer lists "specular-location" when a
 * group uses inside/outside specular placement and "refractivity" when refraction is on.
 * Unknown feature strings are preserved.
 */
export function syncFeatures(doc: Pick<IconDocument, 'props' | 'groups'>): void {
  const managed = ['refractivity', 'specular-location'];
  let usesRefraction = false;
  let usesSpecularLocation = false;
  for (const g of doc.groups) {
    const r = g.props.refractivity;
    for (const v of [r?.plain?.value, ...(r?.specs ?? []).map((e) => e.value)]) {
      if (v && typeof v === 'object' && (v as { enabled?: boolean }).enabled) usesRefraction = true;
    }
    const sp = g.props.specular;
    for (const v of [sp?.plain?.value, ...(sp?.specs ?? []).map((e) => e.value)]) {
      if (v === 'inside' || v === 'outside') usesSpecularLocation = true;
    }
  }
  const current = (baseValue(doc.props.features) as string[] | undefined) ?? [];
  const next = [...current.filter((f) => !managed.includes(f))];
  if (usesRefraction) next.push('refractivity');
  if (usesSpecularLocation) next.push('specular-location');
  const same = next.length === current.length && next.every((f) => current.includes(f));
  if (same) return;
  if (next.length) setPropValue(doc.props, 'features', next.sort());
  else delete doc.props.features;
}

export function writeBundle(doc: IconDocument, extra: FileMap = {}): FileMap {
  // never mutate the caller's document (the UI shares it with undo history)
  const synced = { props: { ...doc.props }, groups: doc.groups };
  if (synced.props.features) synced.props.features = structuredClone(synced.props.features);
  syncFeatures(synced);
  const files: FileMap = { ...extra };
  for (const a of Object.values(doc.assets)) files[`Assets/${a.name}`] = a.bytes;
  // icon.json last: a writer that stops halfway leaves the old icon.json, never one pointing at missing assets
  delete files['icon.json'];
  files['icon.json'] = strToU8(serializeIconJson({ ...doc, props: synced.props }));
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
