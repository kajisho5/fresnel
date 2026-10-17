/** Node rasterizer (CLI / MCP) using resvg. */
import { decodePng, type Appearance, type IconDocument, type RasterOptions, type Rasterize } from '@fresnel/core';
import { alphaBounds, setContentBox, svgAssetsNeedingBounds } from './content';
import { rasterRenderOptions, renderSvg, type RenderOptions } from './compose';
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

/** Measures the drawn bounds of SVG layers that use gradient fills (see content.ts). */
export async function ensureContentBoxes(doc: IconDocument): Promise<void> {
  const todo = svgAssetsNeedingBounds(doc);
  if (!todo.length) return;
  const { Resvg } = await resvg();
  for (const a of todo) {
    try {
      const svg = new TextDecoder().decode(a.display ?? a.bytes);
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
      const bmp = decodePng(new Uint8Array(png));
      setContentBox(a, bmp ? alphaBounds(bmp.width, bmp.height, bmp.data) : null);
    } catch {
      setContentBox(a, null);
    }
  }
}

export async function renderPng(doc: IconDocument, opts: RenderOptions = {}): Promise<Uint8Array> {
  await ensureContentBoxes(doc);
  const size = opts.size ?? 1024;
  return svgToPng(renderSvg(doc, { ...opts, size }), size);
}

export async function renderSheetPng(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> & { cell?: number } = {}): Promise<Uint8Array> {
  await ensureContentBoxes(doc);
  const cell = opts.cell ?? 320;
  return svgToPng(renderSheetSvg(doc, opts), cell * 3);
}

export function nodeRasterizer(doc: IconDocument, opts: Omit<RenderOptions, 'appearance' | 'size'> = {}): Rasterize {
  return (appearance: Appearance, size: number, ro?: RasterOptions) =>
    renderPng(doc, { ...opts, appearance, size, ...rasterRenderOptions(ro) });
}
