import type { Appearance, IconDocument, RasterOptions, Rasterize } from '@fresnel/core';
import { renderSvg, type RenderOptions } from '@fresnel/render';

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

export function browserRasterizer(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> = {}): Rasterize {
  return (appearance: Appearance, size: number, ro?: RasterOptions) =>
    svgToPngBytes(renderSvg(doc, { ...opts, appearance, size, ...(ro?.mask ? { mask: ro.mask, rim: ro.mask !== 'none' } : {}), ...(ro?.tint ? { tint: ro.tint } : {}) }), size);
}
