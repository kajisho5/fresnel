/**
 * Editing operations. They mutate the document in place so they work both on
 * plain objects (CLI / MCP) and on Immer drafts (UI store).
 */
import type { Asset, AppearanceKey, GroupNode, IconDocument, LayerNode, NodeRef } from './model';
import { newId } from './model';
import { baseValue, clearOverride, setPropValue } from './prop';
import { normalizeColorInput } from './color';
import type { NodeKind } from './schema';
import { validateAttr, type Fill } from './schema';

export class OpError extends Error {
  override name = 'OpError';
}

export interface CreateOptions {
  /** background: "#RRGGBB", a color string, "system-light", "system-dark", "automatic",
   *  "gradient:#top,#bottom" or { automaticGradient: color } */
  background?: string;
  platforms?: { squares?: 'shared' | string[]; circles?: string[] };
}

export function parseFillInput(input: string): Fill {
  const s = input.trim();
  if (['automatic', 'system-light', 'system-dark', 'none'].includes(s)) return s as Fill;
  if (s.startsWith('gradient:')) {
    const parts = s.slice('gradient:'.length).split(/[,;]\s*(?=#|[a-z-]+:)/i);
    if (parts.length === 1) return { 'automatic-gradient': normalizeColorInput(parts[0]!) };
    return { 'linear-gradient': [normalizeColorInput(parts[0]!), normalizeColorInput(parts[1]!)] };
  }
  if (s.startsWith('auto-gradient:')) return { 'automatic-gradient': normalizeColorInput(s.slice('auto-gradient:'.length)) };
  return { solid: normalizeColorInput(s) };
}

export function createDocument(opts: CreateOptions = {}): IconDocument {
  const doc: IconDocument = { props: {}, order: [], groups: [], assets: {} };
  setPropValue(doc.props, 'fill', opts.background ? parseFillInput(opts.background) : 'automatic');
  if (opts.platforms) setPropValue(doc.props, 'supported-platforms', opts.platforms);
  else setPropValue(doc.props, 'supported-platforms', { circles: ['watchOS'], squares: 'shared' });
  doc.order = ['fill', 'groups', 'supported-platforms'];
  return doc;
}

// ---------------------------------------------------------------- lookup

export function nameOf(n: GroupNode | LayerNode): string {
  const v = baseValue(n.props.name);
  return typeof v === 'string' ? v : '';
}

export function findGroup(doc: IconDocument, id: string): GroupNode | undefined {
  return doc.groups.find((g) => g.id === id);
}

export function findLayer(doc: IconDocument, id: string): { group: GroupNode; layer: LayerNode; index: number } | undefined {
  for (const group of doc.groups) {
    const index = group.layers.findIndex((l) => l.id === id);
    if (index >= 0) return { group, layer: group.layers[index]!, index };
  }
  return undefined;
}

/**
 * Resolves a human path: "document", "<group>", "<group>/<layer>", "#<index>", "#<g>/#<l>".
 * Names are matched case-insensitively; indexes are 0-based (0 = frontmost).
 */
export function resolvePath(doc: IconDocument, path: string): NodeRef {
  const p = path.trim();
  if (p === '' || p === 'document' || p === '/') return { kind: 'document' };
  const [gp, lp, ...rest] = p.split('/');
  if (rest.length) throw new OpError(`Invalid target "${path}". Use "Group" or "Group/Layer".`);
  const pick = <T extends GroupNode | LayerNode>(list: T[], key: string, what: string): T => {
    const k = key.trim();
    if (/^#\d+$/.test(k)) {
      const n = list[Number(k.slice(1))];
      if (!n) throw new OpError(`${what} ${k} not found`);
      return n;
    }
    const byId = list.find((n) => n.id === k);
    if (byId) return byId;
    const matches = list.filter((n) => nameOf(n).toLowerCase() === k.toLowerCase());
    if (matches.length === 0) throw new OpError(`${what} "${k}" not found. Available: ${list.map(nameOf).join(', ') || '(none)'}`);
    if (matches.length > 1) throw new OpError(`${what} name "${k}" is ambiguous; use #index instead`);
    return matches[0]!;
  };
  const g = pick(doc.groups, gp!, 'Group');
  if (lp === undefined) return { kind: 'group', id: g.id };
  const l = pick(g.layers, lp, 'Layer');
  return { kind: 'layer', id: l.id };
}

export function nodeOf(doc: IconDocument, ref: NodeRef): { kind: NodeKind; props: GroupNode['props'] } {
  if (ref.kind === 'document') return { kind: 'document', props: doc.props };
  if (ref.kind === 'group') {
    const g = findGroup(doc, ref.id);
    if (!g) throw new OpError('Group not found');
    return { kind: 'group', props: g.props };
  }
  const f = findLayer(doc, ref.id);
  if (!f) throw new OpError('Layer not found');
  return { kind: 'layer', props: f.layer.props };
}

// ---------------------------------------------------------------- groups & layers

export function uniqueName(existing: string[], wanted: string): string {
  if (!existing.includes(wanted)) return wanted;
  let i = 2;
  while (existing.includes(`${wanted} ${i}`)) i++;
  return `${wanted} ${i}`;
}

export function addGroup(doc: IconDocument, opts: { name?: string; index?: number } = {}): GroupNode {
  const name = uniqueName(doc.groups.map(nameOf), opts.name ?? 'Group');
  const g: GroupNode = { id: newId('g'), props: {}, order: [], layers: [] };
  // Written explicitly: defaults for absent keys are not documented by Apple.
  setPropValue(g.props, 'name', name);
  setPropValue(g.props, 'shadow', { kind: 'neutral', opacity: 0.5 });
  setPropValue(g.props, 'specular', true);
  setPropValue(g.props, 'translucency', { enabled: true, value: 0.5 });
  g.order = ['layers', 'name', 'shadow', 'specular', 'translucency'];
  const i = clampIndex(opts.index ?? 0, doc.groups.length);
  doc.groups.splice(i, 0, g);
  return g;
}

function clampIndex(i: number, len: number) {
  return Math.max(0, Math.min(len, Math.trunc(i)));
}

/** Adds an asset under a unique name and returns the stored name. */
export function addAsset(doc: IconDocument, asset: Asset): string {
  let name = asset.name.replace(/[\\/]/g, '_');
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (doc.assets[name] && !sameBytes(doc.assets[name]!.bytes, asset.bytes)) name = `${stem} ${i++}${ext}`;
  doc.assets[name] = { ...asset, name };
  return name;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface AddLayerOptions {
  name?: string;
  /** index inside the group, 0 = frontmost */
  index?: number;
  props?: Record<string, unknown>;
}

export function addLayer(doc: IconDocument, groupId: string, asset: Asset, opts: AddLayerOptions = {}): LayerNode {
  const g = findGroup(doc, groupId);
  if (!g) throw new OpError('Group not found');
  const imageName = addAsset(doc, asset);
  const base = opts.name ?? imageName.replace(/\.[a-z0-9]+$/i, '');
  const l: LayerNode = { id: newId('l'), props: {}, order: [] };
  setPropValue(l.props, 'image-name', imageName);
  setPropValue(l.props, 'name', uniqueName(g.layers.map(nameOf), base));
  l.order = ['image-name', 'name'];
  for (const [k, v] of Object.entries(opts.props ?? {})) setProp(doc, { kind: 'layer', id: l.id }, k, v, undefined, l);
  g.layers.splice(clampIndex(opts.index ?? 0, g.layers.length), 0, l);
  return l;
}

/**
 * Sets an attribute. `appearance` writes an override for dark / tinted.
 * Values for known attributes are validated; colors given as "#RRGGBB" inside
 * fills are normalized.
 */
export function setProp(
  doc: IconDocument,
  ref: NodeRef,
  key: string,
  value: unknown,
  appearance?: AppearanceKey,
  /** internal: node not yet inserted */
  detached?: LayerNode,
): void {
  const node = detached ? { kind: 'layer' as NodeKind, props: detached.props } : nodeOf(doc, ref);
  if (key === 'layers' || key === 'groups') throw new OpError(`"${key}" can't be set directly`);
  if (key.endsWith('-specializations')) throw new OpError(`Set "${key.replace(/-specializations$/, '')}" with an appearance instead`);
  let v = value;
  if (key === 'fill' && typeof v === 'string') v = parseFillInput(v);
  if (key === 'fill' && v && typeof v === 'object') v = normalizeFillColors(v as Record<string, unknown>);
  // null removes the attribute, except where null itself is meaningful (blur-material: off)
  if (v === null && key !== 'blur-material') v = undefined;
  if (v !== undefined) {
    const r = validateAttr(node.kind, key, v);
    if (!r.ok) throw new OpError(r.error);
  }
  if (v === undefined) {
    if (appearance) clearOverride(node.props, key, appearance);
    else delete node.props[key];
    return;
  }
  setPropValue(node.props, key, v, appearance);
}

function normalizeFillColors(f: Record<string, unknown>): Record<string, unknown> {
  const o = { ...f };
  if (typeof o.solid === 'string') o.solid = normalizeColorInput(o.solid);
  if (typeof o['automatic-gradient'] === 'string') o['automatic-gradient'] = normalizeColorInput(o['automatic-gradient'] as string);
  if (Array.isArray(o['linear-gradient'])) o['linear-gradient'] = (o['linear-gradient'] as string[]).map(normalizeColorInput);
  return o;
}

export function resetOverride(doc: IconDocument, ref: NodeRef, key: string, appearance: AppearanceKey): void {
  clearOverride(nodeOf(doc, ref).props, key, appearance);
}

export function removeNode(doc: IconDocument, ref: NodeRef): void {
  if (ref.kind === 'document') throw new OpError("The document can't be removed");
  if (ref.kind === 'group') {
    const i = doc.groups.findIndex((g) => g.id === ref.id);
    if (i < 0) throw new OpError('Group not found');
    doc.groups.splice(i, 1);
  } else {
    const f = findLayer(doc, ref.id);
    if (!f) throw new OpError('Layer not found');
    f.group.layers.splice(f.index, 1);
  }
  pruneAssets(doc);
}

/** Drops assets no longer referenced by any layer (including specializations). */
export function pruneAssets(doc: IconDocument): void {
  const used = new Set<string>();
  for (const g of doc.groups)
    for (const l of g.layers) {
      const p = l.props['image-name'];
      if (p?.plain && typeof p.plain.value === 'string') used.add(p.plain.value);
      for (const s of p?.specs ?? []) if (typeof s.value === 'string') used.add(s.value);
    }
  for (const k of Object.keys(doc.assets)) if (!used.has(k)) delete doc.assets[k];
}

export function moveNode(doc: IconDocument, ref: NodeRef, index: number, toGroupId?: string): void {
  if (ref.kind === 'document') throw new OpError("The document can't be moved");
  if (ref.kind === 'group') {
    const i = doc.groups.findIndex((g) => g.id === ref.id);
    if (i < 0) throw new OpError('Group not found');
    const [g] = doc.groups.splice(i, 1);
    doc.groups.splice(clampIndex(index, doc.groups.length), 0, g!);
    return;
  }
  const f = findLayer(doc, ref.id);
  if (!f) throw new OpError('Layer not found');
  const target = toGroupId ? findGroup(doc, toGroupId) : f.group;
  if (!target) throw new OpError('Target group not found');
  f.group.layers.splice(f.index, 1);
  target.layers.splice(clampIndex(index, target.layers.length), 0, f.layer);
}

export function duplicateNode(doc: IconDocument, ref: NodeRef): NodeRef {
  if (ref.kind === 'group') {
    const i = doc.groups.findIndex((g) => g.id === ref.id);
    const src = doc.groups[i]!;
    const copy: GroupNode = structuredClone(src);
    copy.id = newId('g');
    copy.layers.forEach((l) => (l.id = newId('l')));
    setPropValue(copy.props, 'name', uniqueName(doc.groups.map(nameOf), `${nameOf(src)} copy`));
    doc.groups.splice(i, 0, copy);
    return { kind: 'group', id: copy.id };
  }
  if (ref.kind === 'layer') {
    const f = findLayer(doc, ref.id)!;
    const copy: LayerNode = structuredClone(f.layer);
    copy.id = newId('l');
    setPropValue(copy.props, 'name', uniqueName(f.group.layers.map(nameOf), `${nameOf(f.layer)} copy`));
    f.group.layers.splice(f.index, 0, copy);
    return { kind: 'layer', id: copy.id };
  }
  throw new OpError("The document can't be duplicated");
}

/** Wraps a layer into a new group placed where the layer's group is. */
export function groupLayer(doc: IconDocument, layerId: string, name?: string): GroupNode {
  const f = findLayer(doc, layerId);
  if (!f) throw new OpError('Layer not found');
  const gi = doc.groups.indexOf(f.group);
  const g = addGroup(doc, { name: name ?? nameOf(f.layer), index: gi });
  f.group.layers.splice(f.index, 1);
  g.layers.push(f.layer);
  return g;
}

export function summarize(doc: IconDocument) {
  return {
    groups: doc.groups.map((g, gi) => ({
      index: gi,
      name: nameOf(g),
      layers: g.layers.map((l, li) => ({ index: li, name: nameOf(l), image: baseValue(l.props['image-name']) })),
    })),
    assets: Object.values(doc.assets).map((a) => ({ name: a.name, kind: a.kind, width: a.width, height: a.height })),
  };
}
