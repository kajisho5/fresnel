import { strToU8 } from 'fflate';
import type { Appearance } from './model';

/** Rasterizes the icon for an appearance at a pixel size and returns PNG bytes. */
export type Rasterize = (appearance: Appearance, size: number) => Promise<Uint8Array>;

/**
 * ICNS element types with PNG payloads.
 * https://en.wikipedia.org/wiki/Apple_Icon_Image_format (ic07–ic14 hold PNG / JPEG 2000)
 */
const ICNS_TYPES: [type: string, px: number][] = [
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
  for (const s of ICNS_SIZES) pngs[s] = await rasterize(appearance, s);
  return encodeIcns(pngs);
}

/**
 * AppIcon.appiconset: single-size iOS icon (1024) with Dark and Tinted variants,
 * plus the classic macOS size set. Format follows Xcode's asset catalog
 * Contents.json ("luminosity" appearances for dark / tinted).
 */
export async function buildAppIconSet(rasterize: Rasterize): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const images: Record<string, unknown>[] = [];
  files['AppIcon.png'] = await rasterize('default', 1024);
  files['AppIcon-Dark.png'] = await rasterize('dark', 1024);
  files['AppIcon-Tinted.png'] = await rasterize('tinted-light', 1024);
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
      files[name] = px === 1024 ? files['AppIcon.png']! : await rasterize('default', px);
      images.push({ filename: name, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
    }
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
  for (const a of appearances) for (const s of sizes) files[`${a}/icon-${s}.png`] = await rasterize(a, s);
  return files;
}
