import { unzlibSync, zlibSync } from 'fflate';
import type { Asset } from './model';

const td = new TextDecoder();
const te = new TextEncoder();

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function sniffKind(name: string, bytes: Uint8Array): Asset['kind'] {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  const head = td.decode(bytes.subarray(0, Math.min(bytes.length, 2048))).trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--') || /<svg[\s>]/.test(head)) return 'svg';
  const e = extOf(name);
  if (e === 'svg') return 'svg';
  return 'other';
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*([0-9.]+)\s*(px|pt)?\s*$/.exec(v);
  return m ? Number(m[1]) : null;
}

/** Natural size of an SVG in points: width/height attributes, else viewBox. */
export function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const attr = (n: string) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const w = num(attr('width'));
  const h = num(attr('height'));
  const vb = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (w && h) return { width: w, height: h };
  if (vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) {
    if (w) return { width: w, height: (w * vb[3]!) / vb[2]! };
    if (h) return { width: (h * vb[2]!) / vb[3]!, height: h };
    return { width: vb[2]!, height: vb[3]! };
  }
  return { width: 1024, height: 1024 };
}

export function pngSize(b: Uint8Array): { width: number; height: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

export function jpgSize(b: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

/**
 * Removes active content from SVG text. Defense in depth only: fresnel never puts
 * imported SVG into the DOM; it renders it through <img>/resvg where scripts don't run.
 */
export function sanitizeSvg(svg: string): string {
  let s = svg;
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '').replace(/<foreignObject\b[^>]*\/>/gi, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // external references: keep only fragment (#id) and data: URLs
  s = s.replace(/\s(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr: string, _q, d1?: string, d2?: string) => {
    const v = (d1 ?? d2 ?? '').trim();
    return v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v) ? m : '';
  });
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/@import[^;]+;/gi, '');
  return s;
}

export interface SvgFacts {
  hasText: boolean;
  hasFilter: boolean;
  minStrokeWidth: number | null;
}

export function svgFacts(svg: string): SvgFacts {
  const widths = [...svg.matchAll(/stroke-width\s*[:=]\s*["']?\s*([0-9.]+)/gi)].map((m) => Number(m[1])).filter((n) => n > 0);
  return {
    hasText: /<text[\s>]/i.test(svg),
    hasFilter: /<filter[\s>]/i.test(svg),
    minStrokeWidth: widths.length ? Math.min(...widths) : null,
  };
}

/** Builds an Asset from a file. SVG is sanitized. */
export function makeAsset(name: string, bytes: Uint8Array): Asset {
  const kind = sniffKind(name, bytes);
  if (kind === 'svg') {
    const text = sanitizeSvg(td.decode(bytes));
    return { name, kind, bytes: te.encode(text), ...svgSize(text) };
  }
  if (kind === 'png') return { name, kind, bytes, ...pngSize(bytes) };
  if (kind === 'jpg') return { name, kind, bytes, ...jpgSize(bytes) };
  return { name, kind, bytes, width: 1024, height: 1024 };
}

export function assetText(a: Asset): string {
  return td.decode(a.bytes);
}

export function mimeOf(a: Asset): string {
  return a.kind === 'svg' ? 'image/svg+xml' : a.kind === 'png' ? 'image/png' : a.kind === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
}

// ---------------------------------------------------------------- minimal PNG decoder (8-bit, non-interlaced)

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA 8-bit */
  data: Uint8Array;
}

export function decodePng(b: Uint8Array): Bitmap | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let ctype = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  while (off + 8 <= b.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(b[off + 4]!, b[off + 5]!, b[off + 6]!, b[off + 7]!);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(off + 8);
      height = dv.getUint32(off + 12);
      depth = data[8]!;
      ctype = data[9]!;
      interlace = data[12]!;
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) return null;
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
  if (!ch) return null;
  const total = idat.reduce((a, x) => a + x.length, 0);
  const joined = new Uint8Array(total);
  let p = 0;
  for (const x of idat) {
    joined.set(x, p);
    p += x.length;
  }
  const raw = unzlibSync(joined);
  const stride = width * ch;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let r = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[r++]!;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch]! : 0;
      const up = prev[x]!;
      const c = x >= ch ? prev[x - ch]! : 0;
      let v = raw[r++]!;
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - up);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * ch;
      if (ctype === 6) out.set(cur.subarray(i, i + 4), o);
      else if (ctype === 2) {
        out[o] = cur[i]!;
        out[o + 1] = cur[i + 1]!;
        out[o + 2] = cur[i + 2]!;
        out[o + 3] = 255;
      } else if (ctype === 0) {
        out[o] = out[o + 1] = out[o + 2] = cur[i]!;
        out[o + 3] = 255;
      } else if (ctype === 4) {
        out[o] = out[o + 1] = out[o + 2] = cur[i]!;
        out[o + 3] = cur[i + 1]!;
      } else if (ctype === 3 && palette) {
        const k = cur[i]!;
        out[o] = palette[k * 3]!;
        out[o + 1] = palette[k * 3 + 1]!;
        out[o + 2] = palette[k * 3 + 2]!;
        out[o + 3] = trns && k < trns.length ? trns[k]! : 255;
      }
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------- minimal PNG encoder

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  const t = new TextEncoder().encode(type);
  out.set(t, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

/** Encodes RGB (no alpha) PNG. `rgba` is composited over `bg` (default black). */
export function encodePngRgb(width: number, height: number, rgba: Uint8Array, bg: [number, number, number] = [0, 0, 0]): Uint8Array {
  const raw = new Uint8Array(height * (width * 3 + 1));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3]! / 255;
      raw[o++] = Math.round(rgba[i]! * a + bg[0] * (1 - a));
      raw[o++] = Math.round(rgba[i + 1]! * a + bg[1] * (1 - a));
      raw[o++] = Math.round(rgba[i + 2]! * a + bg[2] * (1 - a));
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Removes the alpha channel from a PNG (App Store icons must be opaque, without alpha). */
export function flattenPng(png: Uint8Array, bg: [number, number, number] = [0, 0, 0]): Uint8Array {
  const bmp = decodePng(png);
  return bmp ? encodePngRgb(bmp.width, bmp.height, bmp.data, bg) : png;
}
