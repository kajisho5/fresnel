import type { Appearance, IconDocument, RasterOptions, Rasterize } from '@fresnel/core';
import { alphaBounds, rasterRenderOptions, renderSvg, setContentBox, svgAssetsNeedingBounds, type RenderOptions } from '@fresnel/render';

export function svgUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render the icon preview'));
    img.src = url;
  });
}

export async function svgToPngBytes(svg: string, size: number): Promise<Uint8Array> {
  const url = svgUrl(svg);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Measures the drawn bounds of SVG layers that use gradient fills (gradients are measured against them). */
export async function ensureContentBoxes(doc: IconDocument): Promise<boolean> {
  const todo = svgAssetsNeedingBounds(doc);
  for (const a of todo) {
    const url = URL.createObjectURL(new Blob([(a.display ?? a.bytes) as unknown as ArrayBuffer], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(url);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, 256, 256);
      const d = g.getImageData(0, 0, 256, 256);
      setContentBox(a, alphaBounds(256, 256, d.data));
    } catch {
      setContentBox(a, null);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return todo.length > 0;
}

export function browserRasterizer(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> = {}): Rasterize {
  return async (appearance: Appearance, size: number, ro?: RasterOptions) => {
    await ensureContentBoxes(doc);
    return svgToPngBytes(renderSvg(doc, { ...opts, appearance, size, ...rasterRenderOptions(ro) }), size);
  };
}
