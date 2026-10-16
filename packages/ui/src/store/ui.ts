import { create } from 'zustand';
import type { Appearance } from '@fresnel/core';
import type { MaskShape } from '@fresnel/render';

export type Selection = { kind: 'document' } | { kind: 'group'; id: string } | { kind: 'layer'; id: string };
export type Wallpaper = 'auto' | 'light' | 'dark' | 'photo';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface UIState {
  selection: Selection;
  mode: 'edit' | 'compare';
  appearance: Appearance;
  scope: 'all' | 'current';
  zoom: number | 'fit';
  showGrid: boolean;
  mask: MaskShape;
  lightAngle: number;
  wallpaper: Wallpaper;
  tint: string;
  compareSizes: number[];
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  exportOpen: boolean;
  issuesOpen: boolean;
  toasts: Toast[];
  set(p: Partial<UIState>): void;
  select(s: Selection): void;
  toast(kind: Toast['kind'], text: string): void;
  dismiss(id: number): void;
}

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('fresnel.ui') ?? '{}') as Partial<UIState>;
  } catch {
    return {};
  }
})();

let toastSeq = 0;

export const useUI = create<UIState>()((set, get) => ({
  selection: { kind: 'document' },
  mode: 'edit',
  appearance: 'default',
  scope: 'all',
  zoom: 'fit',
  showGrid: prefs.showGrid ?? true,
  mask: prefs.mask ?? 'squircle',
  lightAngle: prefs.lightAngle ?? -45,
  wallpaper: prefs.wallpaper ?? 'auto',
  tint: prefs.tint ?? '#3FA7A0',
  compareSizes: prefs.compareSizes ?? [1024, 128, 64, 32, 16],
  sidebarOpen: true,
  inspectorOpen: true,
  exportOpen: false,
  issuesOpen: false,
  toasts: [],
  set(p) {
    set(p);
    const s = get();
    try {
      localStorage.setItem(
        'fresnel.ui',
        JSON.stringify({ showGrid: s.showGrid, mask: s.mask, lightAngle: s.lightAngle, wallpaper: s.wallpaper, tint: s.tint, compareSizes: s.compareSizes }),
      );
    } catch {
      /* storage unavailable */
    }
  },
  select(selection) {
    set({ selection });
  },
  toast(kind, text) {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
