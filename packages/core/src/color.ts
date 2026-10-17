/**
 * Icon Composer color strings: "<space>:c1,c2,c3,c4"
 *   srgb / extended-srgb / display-p3 -> r,g,b,a (0..1, extended may exceed)
 *   gray / extended-gray              -> luminance,alpha
 */
export type ColorSpace = 'srgb' | 'extended-srgb' | 'display-p3' | 'gray' | 'extended-gray';

export interface Color {
  space: ColorSpace;
  /** raw components as written */
  c: number[];
}

/** Display-referred sRGB, each 0..1 */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const SPACES: ColorSpace[] = ['srgb', 'extended-srgb', 'display-p3', 'gray', 'extended-gray'];

export function isColorString(v: unknown): v is string {
  return typeof v === 'string' && parseColor(v) !== null;
}

export function parseColor(s: string): Color | null {
  const i = s.indexOf(':');
  if (i < 0) return null;
  const space = s.slice(0, i).trim() as ColorSpace;
  if (!SPACES.includes(space)) return null;
  const c = s
    .slice(i + 1)
    .split(',')
    .map((x) => Number(x.trim()));
  if (c.some((x) => !Number.isFinite(x))) return null;
  const gray = space === 'gray' || space === 'extended-gray';
  if (gray ? c.length < 1 || c.length > 2 : c.length < 3 || c.length > 4) return null;
  return { space, c };
}

export function formatColor(col: Color): string {
  return `${col.space}:${col.c.map((x) => x.toFixed(5)).join(',')}`;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toLinear = (v: number) => {
  const s = Math.sign(v);
  const a = Math.abs(v);
  return s * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4);
};
const fromLinear = (v: number) => {
  const s = Math.sign(v);
  const a = Math.abs(v);
  return s * (a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055);
};

/** Converts any supported color to display sRGB (clamped). P3 is gamut-mapped by clipping. */
export function toRGBA(col: Color): RGBA {
  if (col.space === 'gray' || col.space === 'extended-gray') {
    const l = col.c[0] ?? 0;
    // Gray Gamma 2.2 -> linear -> sRGB transfer
    const lin = Math.sign(l) * Math.abs(l) ** 2.2;
    const v = clamp01(fromLinear(lin));
    return { r: v, g: v, b: v, a: clamp01(col.c[1] ?? 1) };
  }
  const [r = 0, g = 0, b = 0, a = 1] = col.c;
  if (col.space === 'display-p3') {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const sr = 1.2249401 * lr - 0.2249404 * lg;
    const sg = -0.0420569 * lr + 1.0420571 * lg;
    const sb = -0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb;
    return { r: clamp01(fromLinear(sr)), g: clamp01(fromLinear(sg)), b: clamp01(fromLinear(sb)), a: clamp01(a) };
  }
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

export function rgbaToCss({ r, g, b, a }: RGBA): string {
  const f = (x: number) => Math.round(x * 255);
  return a >= 1 ? `rgb(${f(r)},${f(g)},${f(b)})` : `rgba(${f(r)},${f(g)},${f(b)},${+a.toFixed(4)})`;
}

export function rgbaToHex({ r, g, b }: RGBA): string {
  const h = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function colorToCss(s: string): string {
  const c = parseColor(s);
  return c ? rgbaToCss(toRGBA(c)) : 'rgb(0,0,0)';
}

/**
 * Accepts "#RGB", "#RRGGBB", "#RRGGBBAA" or an Icon Composer color string and
 * returns an Icon Composer color string. Hex input is written as srgb.
 */
export function normalizeColorInput(input: string): string {
  const s = input.trim();
  if (parseColor(s)) return formatColor(parseColor(s)!);
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (!m) throw new Error(`Invalid color "${input}". Use #RRGGBB or "display-p3:r,g,b,a".`);
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return formatColor({ space: 'srgb', c: [n(0), n(2), n(4), hex.length === 8 ? n(6) : 1] });
}

/** Relative luminance (WCAG) of an sRGB color */
export function luminance({ r, g, b }: RGBA): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t };
}

/** Lighten (t>0) or darken (t<0) in a perceptual-ish way by mixing with white/black */
export function shade(c: RGBA, t: number): RGBA {
  return t >= 0 ? mix(c, { r: 1, g: 1, b: 1, a: c.a }, t) : mix(c, { r: 0, g: 0, b: 0, a: c.a }, -t);
}

/**
 * Applies a color picked as sRGB hex to an existing color string, keeping its
 * color space (Display P3 stays P3) and its alpha.
 */
export function recolor(original: unknown, hex: string, alpha?: number): string {
  const orig = typeof original === 'string' ? parseColor(original) : null;
  const picked = parseColor(normalizeColorInput(hex))!;
  const [r, g, b] = picked.c as [number, number, number];
  const a = alpha ?? (orig ? (orig.space === 'gray' || orig.space === 'extended-gray' ? orig.c[1] ?? 1 : orig.c[3] ?? 1) : 1);
  if (orig?.space === 'display-p3') {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const pr = 0.8224621 * lr + 0.177538 * lg;
    const pg = 0.0331941 * lr + 0.9668058 * lg;
    const pb = 0.0170827 * lr + 0.0723974 * lg + 0.9105199 * lb;
    return formatColor({ space: 'display-p3', c: [clamp01(fromLinear(pr)), clamp01(fromLinear(pg)), clamp01(fromLinear(pb)), a] });
  }
  return formatColor({ space: 'srgb', c: [r, g, b, a] });
}

/** Changes only the alpha of a color string; the color components are kept exactly. */
export function withAlpha(original: unknown, alpha: number): string {
  const orig = typeof original === 'string' ? parseColor(original) : null;
  if (!orig) return formatColor({ space: 'srgb', c: [1, 1, 1, alpha] });
  const gray = orig.space === 'gray' || orig.space === 'extended-gray';
  const c = gray ? [orig.c[0] ?? 0, alpha] : [orig.c[0] ?? 0, orig.c[1] ?? 0, orig.c[2] ?? 0, alpha];
  return formatColor({ space: orig.space, c });
}
