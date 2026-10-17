/** Node rasterizer (CLI / MCP) using resvg. */
import type { Appearance, IconDocument, RasterOptions, Rasterize } from '@fresnel/core';
import { renderSvg, type RenderOptions } from './compose';
import { renderSheetSvg } from './sheet';

type ResvgModule = typeof import('@resvg/resvg-js');
let mod: ResvgModule | null = null;

async function resvg(): Promise<ResvgModule> {
  if (mod) return mod;
  try {
    mod = await import('@resvg/resvg-js');
    return mod;
  } catch (e) {
    throw new Error(`PNG rendering needs @resvg/resvg-js, which isn't available on this platform: ${(e as Error).message}`);
  }
}

export async function svgToPng(svg: string, width: number): Promise<Uint8Array> {
  const { Resvg } = await resvg();
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width) }, font: { loadSystemFonts: true } });
  return new Uint8Array(r.render().asPng());
}

export async function renderPng(doc: IconDocument, opts: RenderOptions = {}): Promise<Uint8Array> {
  const size = opts.size ?? 1024;
  return svgToPng(renderSvg(doc, { ...opts, size }), size);
}

export async function renderSheetPng(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> & { cell?: number } = {}): Promise<Uint8Array> {
  const cell = opts.cell ?? 320;
  return svgToPng(renderSheetSvg(doc, opts), cell * 3);
}

export function nodeRasterizer(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> = {}): Rasterize {
  return (appearance: Appearance, size: number, ro?: RasterOptions) =>
    renderPng(doc, { ...opts, appearance, size, ...(ro?.mask ? { mask: ro.mask, rim: ro.mask !== 'none' } : {}), ...(ro?.tint ? { tint: ro.tint } : {}) });
}
