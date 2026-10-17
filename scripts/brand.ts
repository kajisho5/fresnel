/**
 * Builds every brand asset from brand/AppIcon.icon (fresnel's own icon, made with fresnel)
 * and the outlined wordmark (brand/src/wordmark.json).
 *
 *   pnpm brand
 *
 * Outputs
 *   brand/logo/*.svg                  logo lockups, wordmark, mark
 *   brand/png/*.png                   app icon renders
 *   apps/web/public/*                 favicon.svg / favicon.ico / apple-touch-icon / PWA icons / manifest / og-image
 *   brand/social/*.png                Open Graph (1200×630) and GitHub social preview (1280×640)
 *   design/app-icon.svg               app icon used in the README
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flattenPng } from '@fresnel/core';
import { loadIcon } from '@fresnel/core/node';
import { renderSvg } from '@fresnel/render';
import { renderPng, svgToPng } from '@fresnel/render/node';

const root = new URL('..', import.meta.url).pathname;
const out = (...p: string[]) => {
  const f = join(root, ...p);
  mkdirSync(join(f, '..'), { recursive: true });
  return f;
};

const doc = await loadIcon(join(root, 'brand/AppIcon.icon'));
const wm = JSON.parse(readFileSync(join(root, 'brand/src/wordmark.json'), 'utf8')) as { d: string; bbox: [number, number, number, number] };

// ---------------------------------------------------------------- wordmark helpers
const [wx0, wy0, wx1, wy1] = wm.bbox;
const wmW = wx1 - wx0;
const wmH = wy1 - wy0;
/** wordmark path group scaled to a cap height-ish box `h` px tall, top-left at (x, y) */
function wordmark(x: number, y: number, h: number, fill: string) {
  const s = h / wmH;
  return `<path fill="${fill}" transform="translate(${x} ${y}) scale(${s}) translate(${-wx0} ${-wy0})" d="${wm.d}"/>`;
}
const wordmarkWidth = (h: number) => (wmW * h) / wmH;

/** icon SVG inlined as a nested <svg> (own id namespace) */
function iconInline(x: number, y: number, size: number, prefix: string, appearance: 'default' | 'dark' = 'default') {
  const svg = renderSvg(doc, { size, appearance, idPrefix: prefix });
  return svg.replace('<svg ', `<svg x="${x}" y="${y}" `);
}

// ---------------------------------------------------------------- logos (vector)
function lockup(dark: boolean) {
  const h = 120; // icon size
  const textH = 64;
  const gap = 36;
  const W = h + gap + wordmarkWidth(textH) + 8;
  const fill = dark ? '#F5F5F7' : '#1D1D1F';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(W)}" height="${h}" viewBox="0 0 ${Math.ceil(W)} ${h}">` +
    `<title>fresnel</title>${iconInline(0, 0, h, 'lk_')}${wordmark(h + gap, (h - textH) / 2 + 4, textH, fill)}</svg>\n`
  );
}
writeFileSync(out('brand/logo/fresnel-logo-dark.svg'), lockup(true));
writeFileSync(out('brand/logo/fresnel-logo-light.svg'), lockup(false));
for (const [name, fill] of [
  ['fresnel-wordmark-white.svg', '#F5F5F7'],
  ['fresnel-wordmark-black.svg', '#1D1D1F'],
] as const) {
  const h = 96;
  const w = Math.ceil(wordmarkWidth(h)) + 4;
  writeFileSync(out('brand/logo', name), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>fresnel</title>${wordmark(2, 0, h, fill)}</svg>\n`);
}
const markSvg = renderSvg(doc, { size: 1024 });
writeFileSync(out('brand/logo/fresnel-mark.svg'), markSvg);
writeFileSync(out('design/app-icon.svg'), markSvg);

// ---------------------------------------------------------------- app icon PNGs
writeFileSync(out('brand/png/AppIcon-1024.png'), await renderPng(doc, { size: 1024 }));
writeFileSync(out('brand/png/AppIcon-dark-1024.png'), await renderPng(doc, { size: 1024, appearance: 'dark' }));
writeFileSync(out('brand/png/AppIcon-fullbleed-1024.png'), flattenPng(await renderPng(doc, { size: 1024, mask: 'none', rim: false })));
writeFileSync(out('apps/desktop/src-tauri/app-icon.png'), await renderPng(doc, { size: 1024 }));

// ---------------------------------------------------------------- favicons & PWA (apps/web/public)
const pub = (f: string) => out('apps/web/public', f);
writeFileSync(pub('favicon.svg'), renderSvg(doc, { size: 64 }));
const ico = [16, 32, 48];
const icoPngs = await Promise.all(ico.map((s) => renderPng(doc, { size: s, rim: s >= 32 })));
writeFileSync(pub('favicon.ico'), encodeIco(ico.map((s, i) => ({ size: s, png: icoPngs[i]! }))));
// Apple touch icon: opaque full-bleed square, iOS applies its own mask (Apple HIG / Safari web clips)
writeFileSync(pub('apple-touch-icon.png'), flattenPng(await renderPng(doc, { size: 180, mask: 'none', rim: false })));
writeFileSync(pub('icon-192.png'), await renderPng(doc, { size: 192 }));
writeFileSync(pub('icon-512.png'), await renderPng(doc, { size: 512 }));
writeFileSync(pub('icon-maskable-512.png'), flattenPng(await renderPng(doc, { size: 512, mask: 'none', rim: false })));
writeFileSync(
  pub('site.webmanifest'),
  JSON.stringify(
    {
      name: 'fresnel — Liquid Glass icon composer',
      short_name: 'fresnel',
      description: 'Open-source editor for layered Liquid Glass app icons.',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#1C1C1E',
      theme_color: '#1C1C1E',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ) + '\n',
);

// ---------------------------------------------------------------- social images
const FONT = "Inter, 'SF Pro Display', -apple-system, 'Helvetica Neue', Arial, sans-serif";
function social(W: number, Hh: number) {
  const icon = Math.round(Hh * 0.46);
  const ix = Math.round(W * 0.1);
  const iy = Math.round((Hh - icon) / 2);
  const tx = ix + icon + Math.round(W * 0.055);
  const textH = Math.round(Hh * 0.15);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">` +
    `<defs><radialGradient id="g1" cx="0.22" cy="0.3" r="0.6"><stop offset="0" stop-color="#5B8CFF" stop-opacity="0.38"/><stop offset="1" stop-color="#5B8CFF" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="g2" cx="0.85" cy="0.9" r="0.6"><stop offset="0" stop-color="#FF7AB6" stop-opacity="0.28"/><stop offset="1" stop-color="#FF7AB6" stop-opacity="0"/></radialGradient>` +
    `<filter id="sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="${icon * 0.06}" stdDeviation="${icon * 0.07}" flood-color="#000" flood-opacity="0.55"/></filter></defs>` +
    `<rect width="${W}" height="${Hh}" fill="#0B0C14"/><rect width="${W}" height="${Hh}" fill="url(#g1)"/><rect width="${W}" height="${Hh}" fill="url(#g2)"/>` +
    `<g filter="url(#sh)">${iconInline(ix, iy, icon, 'so_')}</g>` +
    wordmark(tx, Math.round(Hh * 0.3), textH, '#F5F5F7') +
    `<text x="${tx}" y="${Math.round(Hh * 0.6)}" font-family="${FONT}" font-size="${Math.round(Hh * 0.062)}" font-weight="600" fill="#F5F5F7">Liquid Glass icon composer</text>` +
    `<text x="${tx}" y="${Math.round(Hh * 0.69)}" font-family="${FONT}" font-size="${Math.round(Hh * 0.04)}" fill="#A1A1A6">Open source · Web · macOS · Windows · Linux · MCP</text>` +
    `</svg>`
  );
}
const og = await svgToPng(social(1200, 630), 1200);
writeFileSync(out('brand/social/og-image.png'), og);
writeFileSync(pub('og-image.png'), og);
writeFileSync(out('brand/social/github-social-preview.png'), await svgToPng(social(1280, 640), 1280));

console.log('brand assets written');

// ---------------------------------------------------------------- ICO (PNG entries)
function encodeIco(entries: { size: number; png: Uint8Array }[]): Uint8Array {
  const head = 6 + entries.length * 16;
  const total = head + entries.reduce((s, e) => s + e.png.length, 0);
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, entries.length, true);
  let off = head;
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    buf[p] = e.size >= 256 ? 0 : e.size;
    buf[p + 1] = e.size >= 256 ? 0 : e.size;
    dv.setUint16(p + 4, 1, true);
    dv.setUint16(p + 6, 32, true);
    dv.setUint32(p + 8, e.png.length, true);
    dv.setUint32(p + 12, off, true);
    buf.set(e.png, off);
    off += e.png.length;
  });
  return buf;
}
