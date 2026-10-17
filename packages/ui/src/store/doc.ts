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

export type FileMap = Record<string, Uint8Array>;

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
  /** generic mutation helper; returns the op's result */
  mutate<T>(fn: (d: IconDocument) => T): T;

  setProp(ref: NodeRef, key: string, value: unknown, variant?: VariantArg): void;
  resetOverride(ref: NodeRef, key: string, variant: VariantArg): void;
  addGroup(name?: string, index?: number): string;
  addLayers(groupId: string | null, assets: Asset[]): string[];
  remove(ref: NodeRef): void;
  move(ref: NodeRef, index: number, toGroupId?: string): void;
  duplicate(ref: NodeRef): NodeRef;
  groupLayer(layerId: string): string;
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
        set({ doc, name, location, extra, dirty: false, generation: get().generation + 1 });
        useDoc.temporal.getState().clear();
      },
      newDocument() {
        get().load(createDocument({ background: 'automatic' }), { name: 'Untitled' });
      },
      markSaved(location, name) {
        set({ dirty: false, ...(location !== undefined ? { location } : {}), ...(name ? { name } : {}) });
      },
      mutate(fn) {
        const next = cloneDoc(get().doc);
        const r = fn(next);
        set({ doc: next, dirty: true });
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
  useDoc.temporal.getState().undo();
  useDoc.setState({ dirty: true });
};
export const redo = () => {
  useDoc.temporal.getState().redo();
  useDoc.setState({ dirty: true });
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
  if (useDoc.getState().doc !== start) {
    t.setState((s) => ({ pastStates: [...s.pastStates, { doc: start }].slice(-300), futureStates: [] }));
  }
};
