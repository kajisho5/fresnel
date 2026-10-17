import { create } from 'zustand';
import type { Appearance, AppearanceKey, Idiom } from '@fresnel/core';

export type Selection = { kind: 'document' } | { kind: 'group'; id: string } | { kind: 'layer'; id: string };
export type Platform = 'iOS' | 'macOS' | 'watchOS';
/** Icon Composer's appearance buttons under the canvas */
export type AppearanceMode = 'default' | 'dark' | 'mono';
export type SectionKey = 'color' | 'glass' | 'composition';
/** "all" edits base values; "variant" edits the current appearance (Color, Liquid Glass) or platform (Composition) */
export type SectionScope = 'all' | 'variant';
export type BackgroundImage = 'none' | 'gradient' | 'sunset' | 'ocean' | 'night' | 'custom';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface UIState {
  selection: Selection;
  mode: 'edit' | 'compare';
  platform: Platform;
  appearanceMode: AppearanceMode;
  monoDark: boolean;
  monoTinted: boolean;
  /** hue 0–360 and intensity 0–1 of the mono tint */
  tintHue: number;
  tintIntensity: number;
  sectionScope: Record<SectionKey, SectionScope>;
  /** canvas toolbar (simulation only; doesn't edit the icon) */
  bgColor: string;
  bgImage: BackgroundImage;
  bgCustomUrl: string | null;
  bgUseImage: boolean;
  grid: 'light' | 'dark';
  showGrid: boolean;
  previewSize: 'fit' | number;
  zoom: number;
  effects: boolean;
  lightAngle: number;
  compareSizes: number[];
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  inspectorTab: 'style' | 'document';
  exportOpen: boolean;
  issuesOpen: boolean;
  monoOptionsOpen: boolean;
  toasts: Toast[];
  set(p: Partial<UIState>): void;
  select(s: Selection): void;
  toast(kind: Toast['kind'], text: string): void;
  dismiss(id: number): void;
}

const PERSIST: (keyof UIState)[] = [
  'platform',
  'monoDark',
  'monoTinted',
  'tintHue',
  'tintIntensity',
  'bgColor',
  'bgImage',
  'bgUseImage',
  'grid',
  'showGrid',
  'effects',
  'lightAngle',
  'compareSizes',
];

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('fresnel.ui.v2') ?? '{}') as Partial<UIState>;
  } catch {
    return {};
  }
})();

let toastSeq = 0;

export const useUI = create<UIState>()((set, get) => ({
  selection: { kind: 'document' },
  mode: 'edit',
  platform: prefs.platform ?? 'iOS',
  appearanceMode: 'default',
  monoDark: prefs.monoDark ?? false,
  monoTinted: prefs.monoTinted ?? false,
  tintHue: prefs.tintHue ?? 176,
  tintIntensity: prefs.tintIntensity ?? 0.45,
  sectionScope: { color: 'all', glass: 'all', composition: 'all' },
  bgColor: prefs.bgColor ?? '#1E1E20',
  bgImage: prefs.bgImage === 'custom' ? 'gradient' : (prefs.bgImage ?? 'gradient'),
  bgCustomUrl: null,
  bgUseImage: prefs.bgUseImage ?? false,
  grid: prefs.grid ?? 'light',
  showGrid: prefs.showGrid ?? false,
  previewSize: 'fit',
  zoom: 1,
  effects: prefs.effects ?? true,
  lightAngle: prefs.lightAngle ?? -45,
  compareSizes: prefs.compareSizes ?? [1024, 128, 64, 32, 16],
  sidebarOpen: true,
  inspectorOpen: true,
  inspectorTab: 'style',
  exportOpen: false,
  issuesOpen: false,
  monoOptionsOpen: false,
  toasts: [],
  set(p) {
    set(p);
    const s = get();
    try {
      localStorage.setItem('fresnel.ui.v2', JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, s[k]]))));
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

// ---------------------------------------------------------------- derived values

/** The rendered appearance for the current canvas selection. */
export function currentAppearance(s: Pick<UIState, 'appearanceMode' | 'monoDark' | 'monoTinted'>): Appearance {
  if (s.appearanceMode === 'default') return 'default';
  if (s.appearanceMode === 'dark') return 'dark';
  return `${s.monoTinted ? 'tinted' : 'clear'}-${s.monoDark ? 'dark' : 'light'}` as Appearance;
}

/** icon.json appearance key edited for the current appearance (Mono is stored as "tinted"). */
export function currentAppearanceKey(s: Pick<UIState, 'appearanceMode'>): AppearanceKey | undefined {
  return s.appearanceMode === 'dark' ? 'dark' : s.appearanceMode === 'mono' ? 'tinted' : undefined;
}

export function currentIdiom(s: Pick<UIState, 'platform'>): Idiom {
  return s.platform;
}

export function hslToHex(h: number, sat: number, l: number): string {
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export function tintHex(s: Pick<UIState, 'tintHue' | 'tintIntensity'>): string {
  return hslToHex(s.tintHue, Math.max(0.15, s.tintIntensity), 0.45);
}

export const APPEARANCE_MODE_LABEL: Record<AppearanceMode, string> = { default: 'Default', dark: 'Dark', mono: 'Mono' };
export const VARIANT_LABEL = (v: { appearance?: string; idiom?: string }) =>
  [v.appearance === 'tinted' ? 'Mono' : v.appearance === 'dark' ? 'Dark' : v.appearance === 'light' ? 'Light' : null, v.idiom === 'square' ? 'iOS & macOS' : v.idiom]
    .filter(Boolean)
    .join(' · ');
