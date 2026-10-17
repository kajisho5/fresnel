import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  addGroup,
  addLayer,
  createDocument,
  duplicateNode,
  groupLayer,
  moveNode,
  removeNode,
  resetOverride,
  setProp,
  type VariantArg,
  type Asset,
  type IconDocument,
  type NodeRef,
} from '@fresnel/core';

import { useUI } from './ui';
import { t } from '../i18n';

export type FileMap = Record<string, Uint8Array>;

/** Structural equality of the editable tree (assets are immutable and keyed by name). */
function sameTree(a: IconDocument, b: IconDocument): boolean {
  if (a === b) return true;
  if (Object.keys(a.assets).join('\n') !== Object.keys(b.assets).join('\n')) return false;
  return JSON.stringify([a.props, a.order, a.groups]) === JSON.stringify([b.props, b.order, b.groups]);
}

/** The document as last loaded or saved; `dirty` means the current doc differs from it. */
let savedDoc: IconDocument | null = null;
const isDirty = (doc: IconDocument) => !savedDoc || !sameTree(doc, savedDoc);

/** Copies the editable tree; asset bytes are immutable and shared between history snapshots. */
export function cloneDoc(d: IconDocument): IconDocument {
  return {
    props: structuredClone(d.props),
    order: [...d.order],
    groups: structuredClone(d.groups),
    assets: { ...d.assets },
  };
}

export interface DocState {
  doc: IconDocument;
  extra: FileMap;
  name: string;
  /** platform-specific location (file path on desktop, null on the web) */
  location: string | null;
  dirty: boolean;
  /** bumps on load so views can reset */
  generation: number;

  load(doc: IconDocument, opts: { name: string; location?: string | null; extra?: FileMap }): void;
  newDocument(): void;
  markSaved(location?: string | null, name?: string): void;
  /**
   * Generic mutation helper; returns the op's result, or undefined when the op
   * failed (the error is shown as a toast and the document is left unchanged).
   * Mutations that change nothing don't touch the document or the undo history.
   */
  mutate<T>(fn: (d: IconDocument) => T): T | undefined;

  setProp(ref: NodeRef, key: string, value: unknown, variant?: VariantArg): void;
  resetOverride(ref: NodeRef, key: string, variant: VariantArg): void;
  addGroup(name?: string, index?: number): string | undefined;
  addLayers(groupId: string | null, assets: Asset[]): string[] | undefined;
  remove(ref: NodeRef): void;
  move(ref: NodeRef, index: number, toGroupId?: string): void;
  duplicate(ref: NodeRef): NodeRef | undefined;
  groupLayer(layerId: string): string | undefined;
  rename(ref: NodeRef, name: string): void;
}

export const useDoc = create<DocState>()(
  temporal(
    (set, get) => ({
      doc: createDocument(),
      extra: {},
      name: 'Untitled',
      location: null,
      dirty: false,
      generation: 0,

      load(doc, { name, location = null, extra = {} }) {
        savedDoc = doc;
        set({ doc, name, location, extra, dirty: false, generation: get().generation + 1 });
        useDoc.temporal.getState().clear();
      },
      newDocument() {
        get().load(createDocument({ background: 'automatic' }), { name: 'Untitled' });
      },
      markSaved(location, name) {
        savedDoc = get().doc;
        set({ dirty: false, ...(location !== undefined ? { location } : {}), ...(name ? { name } : {}) });
      },
      mutate(fn) {
        const cur = get().doc;
        const next = cloneDoc(cur);
        let r;
        try {
          r = fn(next);
        } catch (e) {
          const msg = (e as Error).message || String(e);
          useUI.getState().toast('error', /up to \d+ groups/.test(msg) ? t('groupLimit') : msg);
          return undefined;
        }
        if (sameTree(cur, next)) return r;
        set({ doc: next, dirty: isDirty(next) });
        return r;
      },

      setProp(ref, key, value, appearance) {
        get().mutate((d) => setProp(d, ref, key, value, appearance));
      },
      resetOverride(ref, key, appearance) {
        get().mutate((d) => resetOverride(d, ref, key, appearance));
      },
      addGroup(name, index) {
        return get().mutate((d) => addGroup(d, { ...(name ? { name } : {}), ...(index !== undefined ? { index } : {}) }).id);
      },
      addLayers(groupId, assets) {
        return get().mutate((d) => {
          const gid = groupId && d.groups.some((g) => g.id === groupId) ? groupId : (d.groups[0]?.id ?? addGroup(d).id);
          // add in reverse so the first file ends up frontmost; return ids front to back
          return [...assets]
            .reverse()
            .map((a) => addLayer(d, gid, a).id)
            .reverse();
        });
      },
      remove(ref) {
        get().mutate((d) => removeNode(d, ref));
      },
      move(ref, index, toGroupId) {
        get().mutate((d) => moveNode(d, ref, index, toGroupId));
      },
      duplicate(ref) {
        return get().mutate((d) => duplicateNode(d, ref));
      },
      groupLayer(layerId) {
        return get().mutate((d) => groupLayer(d, layerId).id);
      },
      rename(ref, name) {
        get().mutate((d) => setProp(d, ref, 'name', name));
      },
    }),
    {
      partialize: (s) => ({ doc: s.doc }),
      limit: 300,
      equality: (a, b) => a.doc === b.doc,
      onSave: () => undefined,
    },
  ),
);

export const undo = () => {
  const t = useDoc.temporal.getState();
  if (!t.pastStates.length) return;
  t.undo();
  useDoc.setState({ dirty: isDirty(useDoc.getState().doc) });
};
export const redo = () => {
  const t = useDoc.temporal.getState();
  if (!t.futureStates.length) return;
  t.redo();
  useDoc.setState({ dirty: isDirty(useDoc.getState().doc) });
};
/** Groups continuous edits (slider drags) into one undo step. */
let gestureStart: IconDocument | null = null;
export const beginGesture = () => {
  if (gestureStart) return;
  gestureStart = useDoc.getState().doc;
  useDoc.temporal.getState().pause();
};
export const endGesture = () => {
  if (!gestureStart) return;
  const start = gestureStart;
  gestureStart = null;
  const t = useDoc.temporal;
  t.getState().resume();
  if (!sameTree(useDoc.getState().doc, start)) {
    t.setState((s) => ({ pastStates: [...s.pastStates, { doc: start }].slice(-300), futureStates: [] }));
  }
};
