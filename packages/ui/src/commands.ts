/** Editing commands shared by menus, context menus and keyboard shortcuts. */
import {
  alignNodes,
  distributeNodes,
  duplicateNode,
  findGroup,
  findLayer,
  groupLayers,
  hasVariant,
  moveBy,
  moveNode,
  nameOf,
  removeNode,
  resolveProp,
  setProp,
  type AlignBasis,
  type AlignHow,
  type Idiom,
  type NodeRef,
  type PropMap,
  type Variant,
} from '@fresnel/core';
import { useDoc } from './store/doc';
import { currentAppearance, currentAppearanceKey, selectedRefs, selectionOf, useUI, type ItemRef, type Selection } from './store/ui';
import { t } from './i18n';
import { create } from 'zustand';
import { editIdiom } from './lib/idiom';

export const useRename = create<{ id: string | null; set(id: string | null): void }>()((set) => ({ id: null, set: (id) => set({ id }) }));

const sel = () => useUI.getState().selection;
/** The selected items, in pick order (empty for the document). */
const refs = (): ItemRef[] => selectedRefs(sel());
const ctxNow = () => {
  const ui = useUI.getState();
  return { appearance: currentAppearance(ui), idiom: ui.platform as Idiom };
};
/** Composition writes go to the platform variant when that section is scoped to it. */
const compositionVariant = () => (useUI.getState().sectionScope.composition === 'variant' ? { idiom: editIdiom() } : undefined);

export function labelOf(ref: NodeRef | ItemRef): string {
  const doc = useDoc.getState().doc;
  if (ref.kind === 'group') return nameOf(findGroup(doc, ref.id) ?? { id: '', props: {}, order: [], layers: [] });
  if (ref.kind === 'layer') return findLayer(doc, ref.id) ? nameOf(findLayer(doc, ref.id)!.layer) : '';
  return useDoc.getState().name;
}

export function deleteSelection(confirmFirst = false) {
  const items = refs();
  if (!items.length) return;
  if (confirmFirst && !window.confirm(t('deleteConfirm', { name: items.length === 1 ? labelOf(items[0]!) : t('itemsCount', { n: items.length }) }))) return;
  const doc = useDoc.getState().doc;
  // select a neighbour of a single deleted layer so the inspector stays useful
  let next: Selection = { kind: 'document' };
  if (items.length === 1 && items[0]!.kind === 'layer') {
    const f = findLayer(doc, items[0]!.id);
    if (f) {
      const sib = f.group.layers[f.index + 1] ?? f.group.layers[f.index - 1];
      next = sib ? { kind: 'layer', id: sib.id } : { kind: 'group', id: f.group.id };
    }
  }
  useDoc.getState().mutate((d) => {
    for (const r of items) if (r.kind === 'group' ? findGroup(d, r.id) : findLayer(d, r.id)) removeNode(d, r);
  });
  useUI.getState().select(next);
}

export function duplicateSelection() {
  const items = refs();
  if (!items.length) return;
  const copies = useDoc.getState().mutate((d) => items.map((r) => duplicateNode(d, r) as ItemRef));
  if (copies) useUI.getState().select(selectionOf(copies));
}

/** Moves each selected item one step toward the front (dir = -1) or back (dir = +1). */
export function arrange(dir: -1 | 1) {
  const items = refs();
  if (!items.length) return;
  useDoc.getState().mutate((d) => {
    // move the item nearest the edge first so items don't swap with each other
    const pos = (r: ItemRef) => (r.kind === 'group' ? d.groups.findIndex((g) => g.id === r.id) : (findLayer(d, r.id)?.index ?? -1));
    const sorted = [...items].sort((a, b) => (pos(a) - pos(b)) * -dir);
    for (const r of sorted) {
      if (r.kind === 'group') {
        const i = d.groups.findIndex((g) => g.id === r.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.groups.length || items.some((x) => x.id === d.groups[j]!.id)) continue;
        moveNode(d, r, j);
      } else {
        const f = findLayer(d, r.id);
        if (!f) continue;
        const j = f.index + dir;
        if (j < 0 || j >= f.group.layers.length || items.some((x) => x.id === f.group.layers[j]!.id)) continue;
        moveNode(d, r, j);
      }
    }
  });
}

/** ⌘G: wraps the selected layers in one new group. */
export function groupSelection() {
  const items = refs().filter((r) => r.kind === 'layer');
  if (!items.length) return;
  const id = useDoc.getState().mutate((d) => groupLayers(d, items.map((r) => r.id), items.length === 1 ? labelOf(items[0]!) : undefined).id);
  if (id) useUI.getState().select({ kind: 'group', id });
}

/** Moves each selected group's layers into the group above it (or below) and removes the group. */
export function ungroupSelection() {
  const groups = refs().filter((r) => r.kind === 'group');
  if (!groups.length) return;
  let last: string | undefined;
  useDoc.getState().mutate((d) => {
    for (const r of groups) {
      const gi = d.groups.findIndex((g) => g.id === r.id);
      if (gi < 0) continue;
      const target = d.groups[gi - 1] ?? d.groups[gi + 1];
      if (!target) continue;
      const from = d.groups[gi]!;
      if (gi - 1 >= 0) target.layers.push(...from.layers);
      else target.layers.unshift(...from.layers);
      d.groups.splice(gi, 1);
      last = target.id;
    }
  });
  if (last) useUI.getState().select({ kind: 'group', id: last });
}

/** Shows or hides the selection; with several items, all follow the first one's new state. */
export function toggleVisible(ref?: ItemRef) {
  const items = ref ? [ref] : refs();
  if (!items.length) return;
  const doc = useDoc.getState().doc;
  const ui = useUI.getState();
  const nodeOf = (r: ItemRef) => (r.kind === 'group' ? findGroup(doc, r.id) : findLayer(doc, r.id)?.layer);
  const first = nodeOf(items[0]!);
  if (!first) return;
  const hideAll = !resolveProp<boolean>(first.props.hidden, { appearance: currentAppearance(ui), idiom: ui.platform }, false);
  const key = currentAppearanceKey(ui);
  const idiom = ui.platform as Idiom;
  const candidates: Variant[] = [...(key ? [{ appearance: key, idiom }, { appearance: key }] : []), { idiom }, ...(idiom !== 'watchOS' ? [{ idiom: 'square' as Idiom }] : [])];
  useDoc.getState().mutate((d) => {
    for (const r of items) {
      const node = r.kind === 'group' ? findGroup(d, r.id) : findLayer(d, r.id)?.layer;
      if (!node) continue;
      // write where the shown value comes from: the most specific matching variant, else the base
      const from = ui.sectionScope.composition === 'variant' ? { idiom: editIdiom(ui) } : candidates.find((v) => hasVariant(node.props.hidden, v));
      setProp(d, r, 'hidden', from ? hideAll : hideAll ? true : null, from);
    }
  });
}

/** Arrow-key nudge in canvas points. */
export function nudge(dx: number, dy: number) {
  const items = refs();
  if (!items.length) return;
  const ctx = ctxNow();
  useDoc.getState().mutate((d) => {
    for (const r of items) moveBy(d, r, dx, dy, ctx, compositionVariant());
  });
}

/** Align basis: "selection" (default) uses the selection's bounds; one item always aligns to the canvas. */
export function alignSelection(how: AlignHow, basis: AlignBasis = useUI.getState().alignBasis) {
  const items = refs();
  if (!items.length) return;
  useDoc.getState().mutate((d) => alignNodes(d, items, how, ctxNow(), { basis, variant: compositionVariant() }));
}

export function distributeSelection(axis: 'horizontal' | 'vertical') {
  const items = refs();
  if (items.length < 3) return;
  useDoc.getState().mutate((d) => distributeNodes(d, items, axis, ctxNow(), { variant: compositionVariant() }));
}

/** Every layer in the document (⌘A). */
export function selectAllLayers() {
  const doc = useDoc.getState().doc;
  useUI.getState().select(selectionOf(doc.groups.flatMap((g) => g.layers.map((l) => ({ kind: 'layer', id: l.id }) as ItemRef))));
}

// ---------------------------------------------------------------- copy / paste style

/** Not part of an item's style: identity, artwork, where it is and whether it's shown. */
const STYLE_EXCLUDE = new Set(['name', 'image-name', 'position', 'hidden']);
let styleClipboard: { kind: 'group' | 'layer'; props: PropMap } | null = null;

export function copyStyle() {
  const s0 = sel();
  if (s0.kind === 'document') return;
  // with several items, copy from the one picked last
  const s: ItemRef = s0.kind === 'multi' ? ({ kind: s0.of, id: s0.primary } as ItemRef) : s0;
  const doc = useDoc.getState().doc;
  const node = s.kind === 'group' ? findGroup(doc, s.id) : findLayer(doc, s.id)?.layer;
  if (!node) return;
  styleClipboard = { kind: s.kind, props: structuredClone(Object.fromEntries(Object.entries(node.props).filter(([k]) => !STYLE_EXCLUDE.has(k)))) };
  useUI.getState().toast('info', t('styleCopied'));
}

export function canPasteStyle() {
  const items = refs();
  return !!styleClipboard && items.length > 0 && items.every((r) => r.kind === styleClipboard!.kind);
}

export function pasteStyle() {
  if (!canPasteStyle()) return;
  const items = refs();
  const clip = styleClipboard!;
  useDoc.getState().mutate((d) => {
    for (const s of items) {
      const node = s.kind === 'group' ? d.groups.find((g) => g.id === s.id) : d.groups.flatMap((g) => g.layers).find((l) => l.id === s.id);
      if (!node) continue;
      for (const k of Object.keys(node.props)) if (!STYLE_EXCLUDE.has(k)) delete node.props[k];
      Object.assign(node.props, structuredClone(clip.props));
    }
  });
}
