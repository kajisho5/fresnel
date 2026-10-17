/**
 * Editing operations. They mutate the document in place so they work both on
 * plain objects (CLI / MCP) and on Immer drafts (UI store).
 */
import type { Asset, GroupNode, IconDocument, LayerNode, NodeRef } from './model';
import { newId } from './model';
import { baseValue, clearOverride, setPropValue, toVariant, type VariantArg } from './prop';
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
  // a group whose name itself contains "/" (written by another tool)
  const whole = doc.groups.filter((g) => nameOf(g).toLowerCase() === p.toLowerCase());
  const [gp, lp, ...rest] = p.split('/');
  if (whole.length === 1) {
    // "A/B" could also be layer B in group A
    const g = lp !== undefined && !rest.length ? doc.groups.find((x) => nameOf(x).toLowerCase() === gp!.trim().toLowerCase()) : undefined;
    if (g?.layers.some((l) => nameOf(l).toLowerCase() === lp!.trim().toLowerCase()))
      throw new OpError(`"${path}" matches both a group and a layer; use #index (e.g. "#${doc.groups.indexOf(whole[0]!)}")`);
    return { kind: 'group', id: whole[0]!.id };
  }
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

/** Normalizes supported-platforms.squares: "shared", a list, or {platforms: [...]} → "shared" or a list. */
export function squarePlatforms(squares: unknown): 'shared' | string[] {
  if (squares === 'shared') return 'shared';
  if (Array.isArray(squares)) return squares.filter((x): x is string => typeof x === 'string');
  const p = (squares as { platforms?: unknown } | null | undefined)?.platforms;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
}

/** Names are addressed as "Group/Layer", so "/" is replaced in names fresnel writes. */
export function cleanName(name: string): string {
  return name.replace(/[\/\u0000-\u001f]/g, '-').trim();
}

/** Names are compared case-insensitively, like resolvePath matches them. */
export function uniqueName(existing: string[], wanted0: string): string {
  const wanted = cleanName(wanted0) || 'Untitled';
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  let i = 2;
  while (taken.has(`${wanted} ${i}`.toLowerCase())) i++;
  return `${wanted} ${i}`;
}

/**
 * Apple recommends at most 4 groups, and some actool versions reject icons with more visible groups,
 * but Icon Composer itself can write more. fresnel warns (V-09) instead of refusing.
 */
export const MAX_GROUPS = 4;

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
  // no path separators, control characters or leading dots (hidden files are skipped when a bundle is read)
  let name = asset.name.replace(/[\\/\u0000-\u001f:]/g, '_').replace(/^[.\s]+/, '').trim() || 'image';
  const dot = name.lastIndexOf('.');
  // file systems allow 255 bytes per name; keep room for " 99" and the extension
  const ext = dot > 0 ? name.slice(dot, dot + 16) : '';
  let stem = dot > 0 ? name.slice(0, dot) : name;
  while (new TextEncoder().encode(stem).length > 200) stem = stem.slice(0, -1);
  name = stem + ext;
  // case-insensitive file systems (APFS, NTFS) would merge "Logo.svg" and "logo.svg"
  const clash = (n: string) => Object.values(doc.assets).find((a) => a.name.toLowerCase() === n.toLowerCase());
  let i = 2;
  for (let c = clash(name); c && !sameBytes(c.bytes, asset.bytes); c = clash(name)) name = `${stem} ${i++}${ext}`;
  const same = clash(name);
  if (same) return same.name;
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
  // Icon Composer applies Liquid Glass to imported layers automatically
  setPropValue(l.props, 'glass', true);
  l.order = ['glass', 'image-name', 'name'];
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
  appearance?: VariantArg,
  /** internal: node not yet inserted */
  detached?: LayerNode,
): void {
  // replacing a layer's image drops the old one from Assets/ if nothing else uses it
  const old = key === 'image-name' && !detached && ref.kind === 'layer' ? imagesOf([findLayer(doc, ref.id)?.layer].filter((l): l is LayerNode => !!l)) : null;
  setPropRaw(doc, ref, key, value, appearance, detached);
  if (old?.size) pruneAssets(doc, old);
}

function setPropRaw(doc: IconDocument, ref: NodeRef, key: string, value: unknown, appearance?: VariantArg, detached?: LayerNode): void {
  const node = detached ? { kind: 'layer' as NodeKind, props: detached.props } : nodeOf(doc, ref);
  if (key === 'layers' || key === 'groups') throw new OpError(`"${key}" can't be set directly`);
  if (key.endsWith('-specializations')) throw new OpError(`Set "${key.replace(/-specializations$/, '')}" with an appearance instead`);
  let v = value;
  if (key === 'fill' && typeof v === 'string') v = parseFillInput(v);
  if (key === 'fill' && v && typeof v === 'object') v = normalizeFillColors(v as Record<string, unknown>);
  // null removes the attribute, except where null itself is meaningful (blur-material: off)
  if (v === null && key !== 'blur-material') v = undefined;
  if (key === 'name' && typeof v === 'string' && node.kind !== 'document') {
    v = cleanName(v);
    if (!v) throw new OpError('A name is required');
  }
  if (v !== undefined) {
    const r = validateAttr(node.kind, key, v);
    if (!r.ok) throw new OpError(r.error);
  }
  const variant = toVariant(appearance);
  const hasVariant = variant.appearance !== undefined || variant.idiom !== undefined;
  if (v === undefined) {
    if (hasVariant) clearOverride(node.props, key, variant);
    else delete node.props[key];
    return;
  }
  setPropValue(node.props, key, v, variant);
}

function normalizeFillColors(f: Record<string, unknown>): Record<string, unknown> {
  const o = { ...f };
  if (typeof o.solid === 'string') o.solid = normalizeColorInput(o.solid);
  if (typeof o['automatic-gradient'] === 'string') o['automatic-gradient'] = normalizeColorInput(o['automatic-gradient'] as string);
  if (Array.isArray(o['linear-gradient'])) {
    if (!(o['linear-gradient'] as unknown[]).every((c) => typeof c === 'string')) throw new OpError('linear-gradient takes a list of color strings');
    o['linear-gradient'] = (o['linear-gradient'] as string[]).map(normalizeColorInput);
  }
  return o;
}

export function resetOverride(doc: IconDocument, ref: NodeRef, key: string, appearance: VariantArg): void {
  clearOverride(nodeOf(doc, ref).props, key, appearance);
}

export function removeNode(doc: IconDocument, ref: NodeRef): void {
  if (ref.kind === 'document') throw new OpError("The document can't be removed");
  let removedImages: Set<string>;
  if (ref.kind === 'group') {
    const i = doc.groups.findIndex((g) => g.id === ref.id);
    if (i < 0) throw new OpError('Group not found');
    removedImages = imagesOf(doc.groups[i]!.layers);
    doc.groups.splice(i, 1);
  } else {
    const f = findLayer(doc, ref.id);
    if (!f) throw new OpError('Layer not found');
    removedImages = imagesOf([f.layer]);
    f.group.layers.splice(f.index, 1);
  }
  // only the removed items' images go; other bundled files nothing points at are kept
  pruneAssets(doc, removedImages);
}

function imagesOf(layers: LayerNode[]): Set<string> {
  const used = new Set<string>();
  for (const l of layers) {
    const p = l.props['image-name'];
    if (p?.plain && typeof p.plain.value === 'string') used.add(p.plain.value);
    for (const s of p?.specs ?? []) if (typeof s.value === 'string') used.add(s.value);
  }
  return used;
}

/** Drops assets no longer referenced by any layer (including specializations); with `only`, just those names. */
export function pruneAssets(doc: IconDocument, only?: Set<string>): void {
  const used = imagesOf(doc.groups.flatMap((g) => g.layers));
  for (const k of Object.keys(doc.assets)) if (!used.has(k) && (!only || only.has(k))) delete doc.assets[k];
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
    if (i < 0) throw new OpError('Group not found');
      const src = doc.groups[i]!;
    const copy: GroupNode = structuredClone(src);
    copy.id = newId('g');
    copy.layers.forEach((l) => (l.id = newId('l')));
    setPropValue(copy.props, 'name', uniqueName(doc.groups.map(nameOf), `${nameOf(src)} copy`));
    doc.groups.splice(i, 0, copy);
    return { kind: 'group', id: copy.id };
  }
  if (ref.kind === 'layer') {
    const f = findLayer(doc, ref.id);
    if (!f) throw new OpError('Layer not found');
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
  // the layer keeps its place on the canvas: the new group takes over the old group's position
  if (f.group.props.position) g.props.position = structuredClone(f.group.props.position);
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
