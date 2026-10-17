/** Editing commands shared by menus, context menus and keyboard shortcuts. */
import { findGroup, findLayer, hasVariant, nameOf, resolveProp, type Idiom, type NodeRef, type Position, type PropMap, type Variant } from '@fresnel/core';
import { useDoc } from './store/doc';
import { currentAppearance, currentAppearanceKey, useUI } from './store/ui';
import { t } from './i18n';
import { create } from 'zustand';
import { editIdiom } from './lib/idiom';

export const useRename = create<{ id: string | null; set(id: string | null): void }>()((set) => ({ id: null, set: (id) => set({ id }) }));

const sel = () => useUI.getState().selection;

export function labelOf(ref: NodeRef): string {
  const doc = useDoc.getState().doc;
  if (ref.kind === 'group') return nameOf(findGroup(doc, ref.id) ?? { id: '', props: {}, order: [], layers: [] });
  if (ref.kind === 'layer') return findLayer(doc, ref.id) ? nameOf(findLayer(doc, ref.id)!.layer) : '';
  return useDoc.getState().name;
}

export function deleteSelection(confirmFirst = false) {
  const s = sel();
  if (s.kind === 'document') return;
  if (confirmFirst && !window.confirm(t('deleteConfirm', { name: labelOf(s) }))) return;
  const doc = useDoc.getState().doc;
  // select a neighbour so the inspector stays useful
  let next: NodeRef = { kind: 'document' };
  if (s.kind === 'layer') {
    const f = findLayer(doc, s.id);
    if (f) {
      const sib = f.group.layers[f.index + 1] ?? f.group.layers[f.index - 1];
      next = sib ? { kind: 'layer', id: sib.id } : { kind: 'group', id: f.group.id };
    }
  }
  useDoc.getState().remove(s);
  useUI.getState().select(next);
}

export function duplicateSelection() {
  const s = sel();
  if (s.kind === 'document') return;
  const r = useDoc.getState().duplicate(s);
  if (r) useUI.getState().select(r);
}

/** Moves the selection one step toward the front (dir = -1) or back (dir = +1). */
export function arrange(dir: -1 | 1) {
  const s = sel();
  const doc = useDoc.getState().doc;
  if (s.kind === 'group') {
    const i = doc.groups.findIndex((g) => g.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.groups.length) return;
    useDoc.getState().move(s, j);
  } else if (s.kind === 'layer') {
    const f = findLayer(doc, s.id);
    if (!f) return;
    const j = f.index + dir;
    if (j < 0 || j >= f.group.layers.length) return;
    useDoc.getState().move(s, j);
  }
}

export function groupSelection() {
  const s = sel();
  if (s.kind === 'layer') {
    const id = useDoc.getState().groupLayer(s.id);
    if (id) useUI.getState().select({ kind: 'group', id });
  }
}

/** Moves a group's layers into the group above it (or a new neighbour) and removes the group. */
export function ungroupSelection() {
  const s = sel();
  if (s.kind !== 'group') return;
  const doc = useDoc.getState().doc;
  const gi = doc.groups.findIndex((g) => g.id === s.id);
  const target = doc.groups[gi - 1] ?? doc.groups[gi + 1];
  if (!target) return;
  const layers = doc.groups[gi]!.layers.map((l) => l.id);
  useDoc.getState().mutate((d) => {
    const from = d.groups.find((g) => g.id === s.id)!;
    const to = d.groups.find((g) => g.id === target.id)!;
    const moved = from.layers.filter((l) => layers.includes(l.id));
    if (gi - 1 >= 0) to.layers.push(...moved);
    else to.layers.unshift(...moved);
    d.groups.splice(d.groups.indexOf(from), 1);
  });
  useUI.getState().select({ kind: 'group', id: target.id });
}

export function toggleVisible(ref: NodeRef = sel()) {
  if (ref.kind === 'document') return;
  const doc = useDoc.getState().doc;
  const node = ref.kind === 'group' ? findGroup(doc, ref.id) : findLayer(doc, ref.id)?.layer;
  if (!node) return;
  const ui = useUI.getState();
  const prop = node.props.hidden;
  const hidden = resolveProp<boolean>(prop, { appearance: currentAppearance(ui), idiom: ui.platform }, false);
  // write where the shown value comes from: the most specific matching variant, else the base
  const key = currentAppearanceKey(ui);
  const idiom = ui.platform as Idiom;
  const candidates: Variant[] = [
    ...(key ? [{ appearance: key, idiom }, { appearance: key }] : []),
    { idiom },
    ...(idiom !== 'watchOS' ? [{ idiom: 'square' as Idiom }] : []),
  ];
  const from = ui.sectionScope.composition === 'variant' ? { idiom: editIdiom(ui) } : candidates.find((v) => hasVariant(prop, v));
  useDoc.getState().setProp(ref, 'hidden', from ? !hidden : hidden ? null : true, from);
}

/** Arrow-key nudge in points. */
export function nudge(dx: number, dy: number) {
  const s = sel();
  if (s.kind === 'document') return;
  const doc = useDoc.getState().doc;
  const node = s.kind === 'group' ? findGroup(doc, s.id) : findLayer(doc, s.id)?.layer;
  if (!node) return;
  const ui = useUI.getState();
  const ctx = { appearance: currentAppearance(ui), idiom: ui.platform };
  const p = resolveProp<Position>(node.props.position, ctx, { scale: 1, 'translation-in-points': [0, 0] }) ?? { scale: 1, 'translation-in-points': [0, 0] };
  const [x, y] = p['translation-in-points'];
  useDoc.getState().setProp(s, 'position', { ...p, 'translation-in-points': [x + dx, y + dy] }, ui.sectionScope.composition === 'variant' ? { idiom: editIdiom(ui) } : undefined);
}

// ---------------------------------------------------------------- copy / paste style

const STYLE_EXCLUDE = new Set(['name', 'image-name']);
let styleClipboard: { kind: 'group' | 'layer'; props: PropMap } | null = null;

export function copyStyle() {
  const s = sel();
  if (s.kind === 'document') return;
  const doc = useDoc.getState().doc;
  const node = s.kind === 'group' ? findGroup(doc, s.id) : findLayer(doc, s.id)?.layer;
  if (!node) return;
  styleClipboard = { kind: s.kind, props: structuredClone(Object.fromEntries(Object.entries(node.props).filter(([k]) => !STYLE_EXCLUDE.has(k)))) };
  useUI.getState().toast('info', t('styleCopied'));
}

export function canPasteStyle() {
  const s = sel();
  return !!styleClipboard && s.kind === styleClipboard.kind;
}

export function pasteStyle() {
  const s = sel();
  if (!styleClipboard || s.kind !== styleClipboard.kind) return;
  const clip = styleClipboard;
  useDoc.getState().mutate((d) => {
    const node = s.kind === 'group' ? d.groups.find((g) => g.id === s.id) : d.groups.flatMap((g) => g.layers).find((l) => l.id === s.id);
    if (!node) return;
    for (const k of Object.keys(node.props)) if (!STYLE_EXCLUDE.has(k)) delete node.props[k];
    Object.assign(node.props, structuredClone(clip.props));
  });
}
