import { strToU8 } from 'fflate';
import type { Appearance, IconDocument } from './model';
import { baseValue } from './prop';
import { flattenPng, tagSrgb } from './image';

export interface RasterOptions {
  /** "none" = full-bleed square (what Xcode / App Store expect for iOS); default squircle */
  mask?: 'squircle' | 'circle' | 'none';
  /** tint color for tinted appearances */
  tint?: string;
  /** platform whose variants are used. Default iOS */
  idiom?: 'iOS' | 'macOS' | 'watchOS';
  /** false = leave the background out (transparent), e.g. the dark iOS icon */
  background?: boolean;
  /** transparent margin in points around the 1024 pt icon, with a drop shadow (classic macOS icon template) */
  inset?: number;
}

/** True when the document targets watchOS (supported-platforms.circles). */
export function targetsWatch(doc: IconDocument): boolean {
  const sp = baseValue(doc.props['supported-platforms']) as { circles?: unknown } | undefined;
  return Array.isArray(sp?.circles) && sp.circles.includes('watchOS');
}

/** Visible layers whose image can't be rendered (missing or unsupported): raster exports would silently drop them. */
export function unrenderableLayers(doc: IconDocument): string[] {
  const out: string[] = [];
  for (const g of doc.groups) {
    if (baseValue(g.props.hidden) === true) continue;
    for (const l of g.layers) {
      if (baseValue(l.props.hidden) === true) continue;
      const name = baseValue(l.props['image-name']);
      const a = typeof name === 'string' ? doc.assets[name] : undefined;
      if (!a || a.kind === 'pdf' || a.kind === 'other') out.push(`${baseValue(g.props.name) ?? 'Group'}/${baseValue(l.props.name) ?? name ?? 'Layer'}`);
    }
  }
  return out;
}

/** Classic macOS icon template: an 824 pt body on a 1024 pt canvas, so 100 pt of margin. */
export const MAC_INSET = 100;

/** Rasterizes the icon for an appearance at a pixel size and returns PNG bytes. */
export type Rasterize = (appearance: Appearance, size: number, opts?: RasterOptions) => Promise<Uint8Array>;

/**
 * ICNS element types with PNG payloads.
 * https://en.wikipedia.org/wiki/Apple_Icon_Image_format (ic07–ic14 hold PNG / JPEG 2000)
 */
const ICNS_TYPES: [type: string, px: number][] = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic13', 256], // 128@2x
  ['ic08', 256],
  ['ic14', 512], // 256@2x
  ['ic09', 512],
  ['ic10', 1024], // 512@2x
];

export const ICNS_SIZES = [...new Set(ICNS_TYPES.map(([, px]) => px))];

export function encodeIcns(pngBySize: Record<number, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [type, px] of ICNS_TYPES) {
    const png = pngBySize[px];
    if (!png) continue;
    const head = new Uint8Array(8);
    head.set(strToU8(type), 0);
    new DataView(head.buffer).setUint32(4, png.length + 8);
    parts.push(head, png);
  }
  const body = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(8 + body);
  out.set(strToU8('icns'), 0);
  new DataView(out.buffer).setUint32(4, out.length);
  let o = 8;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function buildIcns(rasterize: Rasterize, appearance: Appearance = 'default'): Promise<Uint8Array> {
  const pngs: Record<number, Uint8Array> = {};
  // classic macOS shape: inset body with a shadow, macOS variants
  for (const s of ICNS_SIZES) pngs[s] = tagSrgb(await rasterize(appearance, s, { mask: 'squircle', idiom: 'macOS', inset: MAC_INSET }));
  return encodeIcns(pngs);
}

/**
 * AppIcon.appiconset: single-size iOS icon (1024) with Dark and Tinted variants,
 * plus the classic macOS size set. Format follows Xcode's asset catalog
 * Contents.json ("luminosity" appearances for dark / tinted).
 */
export async function buildAppIconSet(rasterize: Rasterize, opts: { watch?: boolean } = {}): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const images: Record<string, unknown>[] = [];
  // iOS: full-bleed squares (the system applies the mask; App Store icons must not be pre-masked).
  // Dark: transparent background so the system background shows through; tinted: grayscale.
  // https://developer.apple.com/documentation/xcode/configuring-your-app-icon
  files['AppIcon.png'] = flattenPng(await rasterize('default', 1024, { mask: 'none', idiom: 'iOS' }));
  files['AppIcon-Dark.png'] = tagSrgb(await rasterize('dark', 1024, { mask: 'none', idiom: 'iOS', background: false }));
  files['AppIcon-Tinted.png'] = flattenPng(await rasterize('tinted-dark', 1024, { mask: 'none', idiom: 'iOS', tint: '#FFFFFF' }));
  images.push({ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' });
  images.push({
    appearances: [{ appearance: 'luminosity', value: 'dark' }],
    filename: 'AppIcon-Dark.png',
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  });
  images.push({
    appearances: [{ appearance: 'luminosity', value: 'tinted' }],
    filename: 'AppIcon-Tinted.png',
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  });
  for (const pt of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = pt * scale;
      const name = `mac-${pt}@${scale}x.png`;
      // classic macOS icons carry their own shape, margin and shadow
      files[name] = tagSrgb(await rasterize('default', px, { mask: 'squircle', idiom: 'macOS', inset: MAC_INSET }));
      images.push({ filename: name, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
    }
  }
  if (opts.watch) {
    // watchOS single size: the whole 1088 pt watch canvas (Icon Composer's) scaled to 1024 px, opaque and unmasked;
    // the system applies the circle [推測: inscribed in the image, as for pre-Liquid-Glass watch icons]
    files['AppIcon-Watch.png'] = flattenPng(await rasterize('default', 1024, { mask: 'none', idiom: 'watchOS' }));
    images.push({ filename: 'AppIcon-Watch.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' });
  }
  files['Contents.json'] = strToU8(JSON.stringify({ images, info: { author: 'fresnel', version: 1 } }, null, 2) + '\n');
  return files;
}

export async function buildPngSet(
  rasterize: Rasterize,
  appearances: Appearance[],
  sizes: number[],
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const a of appearances) for (const s of sizes) files[`${a}/icon-${s}.png`] = tagSrgb(await rasterize(a, s, { mask: 'squircle' }));
  return files;
}
