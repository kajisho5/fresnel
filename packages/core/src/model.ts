/**
 * In-memory model of an Icon Composer `.icon` bundle.
 *
 * Every attribute can appear in icon.json either as a plain key ("shadow") or as
 * "<key>-specializations" (an array of {appearance?, idiom?, value}). We keep both
 * forms exactly as written so a load/save round trip doesn't rewrite the file,
 * and we keep unknown keys verbatim.
 */

export type AppearanceKey = 'light' | 'dark' | 'tinted';
export type Idiom = 'square' | 'macOS' | 'iOS' | 'watchOS' | 'visionOS';

/** The six appearances the system shows (iOS / iPadOS / macOS). */
export type Appearance = 'default' | 'dark' | 'clear-light' | 'clear-dark' | 'tinted-light' | 'tinted-dark';
export const APPEARANCES: Appearance[] = ['default', 'dark', 'clear-light', 'clear-dark', 'tinted-light', 'tinted-dark'];
export const APPEARANCE_LABEL: Record<Appearance, string> = {
  default: 'Default',
  dark: 'Dark',
  'clear-light': 'Clear light',
  'clear-dark': 'Clear dark',
  'tinted-light': 'Tinted light',
  'tinted-dark': 'Tinted dark',
};

/** Which specialization key each visible appearance resolves through, in priority order. */
export function appearanceKeys(a: Appearance): AppearanceKey[] {
  switch (a) {
    case 'dark':
      return ['dark'];
    // Clear and Tinted (light and dark) are all rendered from Icon Composer's Mono, written as "tinted".
    // Apple: "For mono, you can preview clear and tinted variants"; Assets.car keeps only light / dark /
    // tintable renditions. A dark value does not carry over to Clear dark [推測: strong].
    case 'clear-light':
    case 'clear-dark':
    case 'tinted-light':
    case 'tinted-dark':
      return ['tinted'];
    case 'default':
      // Icon Composer writes "appearance": "light" specializations for the Default appearance
      return ['light'];
    default:
      return [];
  }
}

export function isDarkAppearance(a: Appearance): boolean {
  return a === 'dark' || a === 'clear-dark' || a === 'tinted-dark';
}

/** One entry of a "-specializations" array, kept as written (extra keys preserved). */
export type SpecEntry = { value: unknown; appearance?: string; idiom?: string } & Record<string, unknown>;

export interface Prop {
  /** present when the plain key exists in the file */
  plain?: { value: unknown };
  /** present when "<key>-specializations" exists in the file */
  specs?: SpecEntry[];
}

export type PropMap = Record<string, Prop>;

export interface Asset {
  name: string;
  kind: 'svg' | 'png' | 'jpg' | 'pdf' | 'other';
  /** the file exactly as imported or read; this is what gets saved and exported in the bundle */
  bytes: Uint8Array;
  /** SVG only: sanitized copy used for previews and raster exports (when it differs from bytes) */
  display?: Uint8Array;
  width: number;
  height: number;
}

export interface LayerNode {
  id: string;
  props: PropMap;
  /** raw key order as read from the file */
  order: string[];
}

export interface GroupNode {
  id: string;
  props: PropMap;
  order: string[];
  /** index 0 = frontmost (see FRONT_FIRST) */
  layers: LayerNode[];
}

export interface IconDocument {
  props: PropMap;
  order: string[];
  /** index 0 = frontmost (see FRONT_FIRST) */
  groups: GroupNode[];
  assets: Record<string, Asset>;
}

/**
 * [推測] icon.json lists groups and layers front-to-back (index 0 is on top).
 * Based on kylebshr/decant's calibration against real Icon Composer sources.
 * Flip this single constant if that turns out to be wrong.
 */
export const FRONT_FIRST = true;

/** Icon authoring canvas size in points (decant / Apple HIG: 1024). */
export const CANVAS = 1024;

let seq = 0;
export function newId(prefix = 'n'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type NodeRef = { kind: 'document' } | { kind: 'group'; id: string } | { kind: 'layer'; id: string };
