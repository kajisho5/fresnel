/**
 * Approximate brightness of fills and layer images, used by Specular "Automatic".
 * Apple: Automatic is "aware of the color of your layer [and] the color of the background of the
 * app icon"; Inside "looks great when the foreground is darker than the background", Outside "when
 * the background is darker than the foreground" (WWDC26 lab 8012, developer.apple.com/icon-composer).
 * The exact rule isn't published; this compares relative luminance. [推測]
 */
import { decodePng, luminance, parseColor, toRGBA, type Asset } from '@fresnel/core';

const lumaOf = (c: string): number | null => {
  const p = parseColor(c);
  return p ? luminance(toRGBA(p)) : null;
};

/** Average luminance of a fill value, or null when it doesn't set a color (automatic / none). */
export function fillLuma(fill: unknown, dark: boolean): number | null {
  if (fill === 'system-dark' || (fill === 'automatic' && dark)) return 0.03;
  if (fill === 'system-light' || fill === 'automatic') return 0.9;
  if (!fill || typeof fill !== 'object') return null;
  const f = fill as Record<string, unknown>;
  const colors = [f.solid, f['automatic-gradient'], ...(Array.isArray(f['linear-gradient']) ? f['linear-gradient'] : [])].filter((x): x is string => typeof x === 'string');
  const ls = colors.map(lumaOf).filter((x): x is number => x !== null);
  return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
}

const cache = new WeakMap<Uint8Array, number>();

function hexLuma(hex: string): number | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return luminance({ r: v(0), g: v(2), b: v(4), a: 1 });
}

/** Average luminance of an image's visible pixels (PNG), or of the colors an SVG paints with. Defaults to white. */
export function assetLuma(a: Asset): number {
  const hit = cache.get(a.bytes);
  if (hit !== undefined) return hit;
  let l = 1;
  if (a.kind === 'png') {
    const bmp = decodePng(a.bytes);
    if (bmp) {
      let sum = 0;
      let wsum = 0;
      const step = Math.max(1, Math.floor((bmp.width * bmp.height) / 40000));
      for (let i = 0; i < bmp.width * bmp.height; i += step) {
        const al = bmp.data[i * 4 + 3]! / 255;
        if (al < 0.05) continue;
        sum += luminance({ r: bmp.data[i * 4]! / 255, g: bmp.data[i * 4 + 1]! / 255, b: bmp.data[i * 4 + 2]! / 255, a: 1 }) * al;
        wsum += al;
      }
      if (wsum > 0) l = sum / wsum;
    }
  } else if (a.kind === 'svg') {
    const text = new TextDecoder().decode(a.display ?? a.bytes);
    const found = [...text.matchAll(/(?:fill|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8})\b/gi)].map((m) => hexLuma(m[1]!)).filter((x): x is number => x !== null);
    const named = [...text.matchAll(/(?:fill|stop-color)\s*[:=]\s*["']?\s*(white|black)\b/gi)].map((m) => (m[1]!.toLowerCase() === 'white' ? 1 : 0));
    const all = [...found, ...named];
    if (all.length) l = all.reduce((x, y) => x + y, 0) / all.length;
  }
  cache.set(a.bytes, l);
  return l;
}
