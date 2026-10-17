/**
 * Content bounds of layer images (the drawn shape, ignoring transparent margins), as fractions 0–1
 * of the image. Icon Composer measures a layer's gradient "orientation" against these bounds, with
 * y pointing down (checked against real Icon Composer files and their exported renders).
 *
 * PNG/JPEG bounds are computed here. SVG bounds need a rasterizer, so the host fills them in first:
 * ensureContentBoxes() in @fresnel/render/node (resvg) or the browser helper in @fresnel/ui.
 */
import { decodePng, type Asset, type IconDocument } from '@fresnel/core';

export interface ContentBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cache = new WeakMap<Uint8Array, ContentBox | null>();

/** Bounds of the opaque pixels of an RGBA bitmap, as fractions of its size (null when fully transparent). */
export function alphaBounds(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, threshold = 8): ContentBox | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3]! > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0 / width, y: y0 / height, w: (x1 - x0 + 1) / width, h: (y1 - y0 + 1) / height };
}

export function setContentBox(asset: Asset, box: ContentBox | null): void {
  cache.set(asset.bytes, box);
}

/** The known content bounds of an image, or undefined (callers then use the whole image). */
export function contentBoxOf(asset: Asset): ContentBox | undefined {
  if (cache.has(asset.bytes)) return cache.get(asset.bytes) ?? undefined;
  if (asset.kind === 'png') {
    const bmp = decodePng(asset.bytes);
    const box = bmp ? alphaBounds(bmp.width, bmp.height, bmp.data) : null;
    cache.set(asset.bytes, box);
    return box ?? undefined;
  }
  if (asset.kind === 'jpg') return { x: 0, y: 0, w: 1, h: 1 };
  return undefined;
}

/** SVG assets drawn with a gradient fill (linear or automatic) whose bounds aren't known yet. */
export function svgAssetsNeedingBounds(doc: IconDocument): Asset[] {
  const out = new Set<Asset>();
  const hasGradient = (p: { plain?: { value: unknown }; specs?: { value: unknown }[] } | undefined) =>
    [p?.plain?.value, ...(p?.specs ?? []).map((s) => s.value)].some((v) => !!v && typeof v === 'object' && ('linear-gradient' in (v as object) || 'automatic-gradient' in (v as object)));
  for (const g of doc.groups)
    for (const l of g.layers) {
      if (!hasGradient(l.props.fill)) continue;
      const names = [l.props['image-name']?.plain?.value, ...(l.props['image-name']?.specs ?? []).map((s) => s.value)];
      for (const n of names) {
        const a = typeof n === 'string' ? doc.assets[n] : undefined;
        if (a && a.kind === 'svg' && !cache.has(a.bytes)) out.add(a);
      }
    }
  return [...out];
}
