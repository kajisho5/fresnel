/** Generates design/04-multi-select.svg (multi-selection, marquee, Align / Distribute). Run: npx tsx design/src/04-multi-select.mts */
import { writeFileSync } from 'node:fs';
import { loadIcon } from '../../packages/core/src/node';
import { renderSvg } from '../../packages/render/src/index';

const doc = await loadIcon(new URL('../../fixtures/Sample.icon', import.meta.url).pathname);
const T = {
  win: '#1C1C1E', side: '#232326', canvas: '#141415', elev: '#2C2C2F', ctrl: '#3A3A3D', sel: 'rgba(91,140,255,0.22)',
  sep: '#2E2E31', t1: '#F2F2F5', t2: '#A0A0A7', t3: '#6C6C73', acc: '#5B8CFF', ovr: '#C792FF', warn: '#FFB020', hair: 'rgba(255,255,255,0.08)',
};
const F = `font-family="-apple-system, 'SF Pro Text', 'Segoe UI', 'Noto Sans JP', sans-serif"`;
const txt = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string; mono?: boolean } = {}) =>
  `<text x="${x}" y="${y}" ${o.mono ? `font-family="ui-monospace, 'SF Mono', monospace"` : F} font-size="${o.size ?? 12}" fill="${o.fill ?? T.t1}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${s}</text>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const field = (x: number, y: number, w: number, s: string, o: { mono?: boolean; fill?: string; anchor?: 'end' | 'start' } = {}) =>
  rect(x, y, w, 22, T.ctrl, 5) + txt(o.anchor === 'start' ? x + 8 : x + w - 8, y + 15, s, { size: 12, mono: o.mono ?? true, fill: o.fill ?? T.t1, anchor: o.anchor === 'start' ? 'start' : 'end' });
const popup = (x: number, y: number, w: number, s: string, fill = T.t1) =>
  rect(x, y, w, 22, T.ctrl, 5) + txt(x + 10, y + 15, s, { fill }) + `<path d="M${x + w - 16} ${y + 9} l4 4 l4 -4" stroke="${T.t2}" stroke-width="1.4" fill="none"/>`;
const out: string[] = [];
const G = {
  left: '<path d="M1 0v14"/><rect x="3" y="2" width="9" height="4" rx="1"/><rect x="3" y="8" width="6" height="4" rx="1"/>',
  hc: '<path d="M7 0v14"/><rect x="2" y="2" width="10" height="4" rx="1"/><rect x="4" y="8" width="6" height="4" rx="1"/>',
  right: '<path d="M13 0v14"/><rect x="2" y="2" width="9" height="4" rx="1"/><rect x="5" y="8" width="6" height="4" rx="1"/>',
  top: '<path d="M0 1h14"/><rect x="2" y="3" width="4" height="9" rx="1"/><rect x="8" y="3" width="4" height="6" rx="1"/>',
  vc: '<path d="M0 7h14"/><rect x="2" y="2" width="4" height="10" rx="1"/><rect x="8" y="4" width="4" height="6" rx="1"/>',
  bottom: '<path d="M0 13h14"/><rect x="2" y="2" width="4" height="9" rx="1"/><rect x="8" y="5" width="4" height="6" rx="1"/>',
  dh: '<path d="M0 0v14M14 0v14"/><rect x="5" y="3" width="4" height="8" rx="1"/>',
  dv: '<path d="M0 0h14M0 14h14"/><rect x="3" y="5" width="8" height="4" rx="1"/>',
};

const W = 1440, H = 900;

// ---------------------------------------------------------------- window chrome
out.push(rect(0, 0, W, H, T.win));
// toolbar
out.push(rect(0, 0, W, 52, T.win), `<line x1="0" y1="52" x2="${W}" y2="52" stroke="${T.sep}"/>`);
out.push(`<g stroke="${T.t2}" stroke-width="1.6" fill="none"><path d="M18 20h16M18 26h16M18 32h16"/><rect x="52" y="18" width="18" height="16" rx="3"/><path d="M58 18v16"/></g>`);
out.push(txt(88, 31, 'Sample', { size: 14 }), txt(140, 31, '— Edited', { size: 13, fill: T.t3 }));
out.push(`<g stroke="${T.t2}" stroke-width="1.6" fill="none"><path d="M224 26a6 6 0 1 1 2 5M222 20v6h6"/><path d="M262 26a6 6 0 1 0 -2 5M264 20v6h-6"/></g>`);
out.push(rect(1269, 13, 82, 26, T.acc, 6), txt(1310, 31, 'Export…', { anchor: 'middle', size: 13, fill: '#fff' }));
out.push(rect(1364, 13, 30, 26, T.ctrl, 6), `<g stroke="${T.t1}" stroke-width="1.4" fill="none"><path d="M1372 32l8-8 4 4-8 8h-4z"/></g>`, `<g stroke="${T.t2}" stroke-width="1.4" fill="none"><rect x="1409" y="18" width="12" height="16" rx="2"/><path d="M1412 23h6M1412 27h6"/></g>`);

// ---------------------------------------------------------------- sidebar
const SW = 259;
out.push(rect(0, 53, SW, H - 53 - 24, T.side), `<line x1="${SW}" y1="52" x2="${SW}" y2="${H - 24}" stroke="${T.sep}"/>`);
const row = (y: number, level: number, name: string, o: { sel?: boolean; glass?: boolean; folder?: boolean; thumb?: string; bold?: boolean } = {}) => {
  const s: string[] = [];
  if (o.sel) s.push(rect(8, y, SW - 16, 30, T.sel, 7));
  const x = level === 0 ? 38 : level === 1 ? 46 : 64;
  if (o.folder) s.push(`<path d="M${x - 24} ${y + 13} l4 4 l4 -4" stroke="${T.t2}" stroke-width="1.4" fill="none"/>`);
  s.push(rect(x, y + 4, 22, 22, '#0F0F10', 5, `stroke="${T.hair}"`));
  if (o.thumb) s.push(o.thumb.replace(/X/g, String(x)).replace(/Y/g, String(y)));
  s.push(txt(x + 32, y + 20, name, { size: 13, weight: o.bold ? 600 : 400 }));
  if (o.glass) s.push(rect(SW - 66, y + 7, 40, 16, 'rgba(91,140,255,0.18)', 4), txt(SW - 46, y + 19, 'Glass', { size: 10, fill: T.acc, anchor: 'middle' }));
  return s.join('');
};
const wave = `<path d="M${'X'} 0" fill="none"/>`;
void wave;
out.push(row(60, 0, 'Sample', { bold: true }));
out.push(`<line x1="16" y1="96" x2="${SW - 16}" y2="96" stroke="${T.sep}"/>`);
out.push(row(102, 1, 'Waves', { folder: true, glass: true, bold: true }));
out.push(row(134, 2, 'Wave Front', { sel: true }));
out.push(row(166, 2, 'Wave Back', { sel: true }));
out.push(row(198, 1, 'Sun', { folder: true, glass: true, bold: true }));
out.push(row(230, 2, 'Sun', { sel: true }));
// thumbnails (simple glyphs)
out.push(`<path d="M68 152 q6 -6 11 -2 t11 -2 v6 h-22z" fill="#fff"/><path d="M68 186 q6 -5 11 -1 t11 -1 v6 h-22z" fill="#fff" opacity=".7"/><circle cx="75" cy="245" r="6" fill="#FFB347"/>`);
out.push(`<line x1="0" y1="${H - 64}" x2="${SW}" y2="${H - 64}" stroke="${T.sep}"/>`, txt(22, H - 37, '+', { size: 20, fill: T.t2 }), txt(SW - 16, H - 38, '2 groups · 3 layers', { size: 11, fill: T.t3, anchor: 'end' }));
// sidebar annotation
out.push(rect(14, 272, SW - 28, 46, 'rgba(91,140,255,0.08)', 8, `stroke="rgba(91,140,255,0.35)" stroke-dasharray="3 3"`));
out.push(txt(26, 291, '⌘-click: add / remove', { size: 11, fill: T.t2 }), txt(26, 308, '⇧-click: range · ⌘A: all layers', { size: 11, fill: T.t2 }));

// ---------------------------------------------------------------- canvas toolbar
const CX0 = SW + 1, CX1 = 1141;
out.push(rect(CX0, 53, CX1 - CX0, 44, T.win), `<line x1="${CX0}" y1="97" x2="${CX1}" y2="97" stroke="${T.sep}"/>`);
out.push(rect(CX0 + 12, 64, 22, 22, T.canvas, 5, `stroke="${T.hair}"`), popup(CX0 + 42, 64, 132, 'Gradient'), popup(CX0 + 224, 64, 94, 'Grid: Light'));
out.push(popup(CX1 - 390, 64, 80, 'Fit'), popup(CX1 - 302, 64, 70, '100%'), txt(CX1 - 214, 80, 'Effects', { size: 12, fill: T.t2 }));
out.push(rect(CX1 - 166, 66, 30, 18, T.acc, 9), `<circle cx="${CX1 - 145}" cy="75" r="7" fill="#fff"/>`, rect(CX1 - 118, 64, 104, 22, T.ctrl, 5), txt(CX1 - 66, 80, 'Compare', { anchor: 'middle' }));

// ---------------------------------------------------------------- canvas + icon
out.push(rect(CX0, 98, CX1 - CX0, 730, T.canvas));
const S = 624; // icon size on the stage
const IX = Math.round((CX0 + CX1) / 2 - S / 2), IY = 98 + Math.round((730 - S) / 2);
const icon = renderSvg(doc, { size: S, idPrefix: 'ms_' }).replace('<svg ', `<svg x="${IX}" y="${IY}" `);
out.push(icon);
const k = S / 1024;
const box = (x: number, y: number, w: number, h: number, dashed = false) =>
  `<rect x="${IX + x * k}" y="${IY + y * k}" width="${w * k}" height="${h * k}" fill="none" stroke="${T.acc}" stroke-width="${dashed ? 1.5 : 1}"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
// per-item outlines (wave layers are full width; sun ~ 400pt centered at (512, 340))
out.push(box(0, 470, 1024, 554), box(0, 560, 1024, 464), box(312, 140, 400, 400));
// union bounds with corner handles
out.push(box(0, 140, 1024, 884, true));
for (const [hx, hy] of [[0, 140], [1024, 140], [0, 1024], [1024, 1024]]) out.push(`<rect x="${IX + hx * k - 4}" y="${IY + hy * k - 4}" width="8" height="8" rx="1.5" fill="#fff" stroke="${T.acc}"/>`);
out.push(rect(IX + S / 2 - 54, IY + 140 * k - 30, 108, 20, 'rgba(91,140,255,0.92)', 10), txt(IX + S / 2, IY + 140 * k - 16, '3 layers selected', { size: 11, fill: '#fff', anchor: 'middle' }));

// inset: marquee drag
const MX = CX0 + 20, MY = 600;
out.push(rect(MX, MY, 196, 132, T.elev, 10, `stroke="${T.hair}"`), txt(MX + 12, MY + 20, 'Drag on empty canvas', { size: 11, fill: T.t2 }));
out.push(rect(MX + 40, MY + 44, 46, 46, '#FFB347', 23), rect(MX + 110, MY + 60, 60, 40, '#B9C8FF', 6));
out.push(rect(MX + 26, MY + 34, 112, 72, 'rgba(91,140,255,0.10)', 1, `stroke="${T.acc}" stroke-width="1"`));
out.push(`<path d="M${MX + 138} ${MY + 106} l10 4 l-4 2 l3 5 l-2 1 l-3 -5 l-3 3z" fill="#fff" stroke="#000" stroke-width=".6"/>`);
out.push(txt(MX + 12, MY + 124, 'selects every layer it touches', { size: 10, fill: T.t3 }));

// ---------------------------------------------------------------- canvas bottom bar
out.push(rect(CX0, 828, CX1 - CX0, 48, T.canvas), `<line x1="${CX0}" y1="828" x2="${CX1}" y2="828" stroke="${T.sep}"/>`);
out.push(rect(CX0 + 12, 840, 190, 26, T.ctrl, 7), rect(CX0 + 14, 842, 110, 22, T.elev, 6), txt(CX0 + 69, 857, 'iOS, macOS', { anchor: 'middle' }), txt(CX0 + 163, 857, 'watchOS', { anchor: 'middle', fill: T.t2 }));
out.push(txt((CX0 + CX1) / 2, 857, '• Approximate preview', { size: 11, fill: T.t3, anchor: 'middle' }));
out.push(rect(CX1 - 300, 840, 196, 26, T.ctrl, 7), rect(CX1 - 298, 842, 64, 22, T.elev, 6), txt(CX1 - 266, 857, 'Default', { anchor: 'middle' }), txt(CX1 - 202, 857, 'Dark', { anchor: 'middle', fill: T.t2 }), txt(CX1 - 138, 857, 'Mono', { anchor: 'middle', fill: T.t2 }));
out.push(rect(CX1 - 92, 840, 80, 26, T.ctrl, 7), txt(CX1 - 52, 857, 'Options', { anchor: 'middle', fill: T.t3 }));

// ---------------------------------------------------------------- inspector
const IX0 = CX1 + 1, IW = W - IX0;
out.push(rect(IX0, 53, IW, H - 53 - 24, T.side), `<line x1="${CX1}" y1="52" x2="${CX1}" y2="${H - 24}" stroke="${T.sep}"/>`);
out.push(rect(IX0 + 16, 62, IW - 32, 28, T.ctrl, 7), rect(IX0 + 18, 64, (IW - 36) / 2, 24, T.elev, 6), txt(IX0 + 18 + (IW - 36) / 4, 81, 'Style', { anchor: 'middle' }), txt(IX0 + 18 + ((IW - 36) * 3) / 4, 81, 'Document', { anchor: 'middle', fill: T.t2 }));
out.push(`<line x1="${IX0}" y1="100" x2="${W}" y2="100" stroke="${T.sep}"/>`);
out.push(txt(IX0 + 16, 122, 'SELECTION', { size: 10, fill: T.t3 }), txt(IX0 + 16, 141, '3 Layers', { size: 13, weight: 600 }), txt(W - 16, 141, 'Wave Front, Wave Back, Sun', { size: 11, fill: T.t3, anchor: 'end' }));
out.push(`<line x1="${IX0}" y1="156" x2="${W}" y2="156" stroke="${T.sep}"/>`);
const L = IX0 + 16, R = W - 16;
const section = (y: number, title: string) => txt(L, y, title, { size: 13, weight: 600 }) + popup(R - 64, y - 15, 64, 'All');
const label = (y: number, s: string) => txt(L, y, s, { size: 12, fill: T.t2 });
// Color
out.push(section(182, 'Color'));
out.push(label(214, 'Fill'), popup(L + 104, 199, R - L - 104, 'Mixed', T.t3));
out.push(label(248, 'Blend mode'), popup(L + 104, 233, R - L - 104, 'Normal'));
out.push(label(282, 'Opacity'), rect(L + 104, 273, 100, 4, T.ctrl, 2), field(R - 56, 267, 56, '—', { fill: T.t3 }));
out.push(txt(L + 104, 300, 'Values differ: editing sets all three', { size: 10, fill: T.t3 }));
out.push(`<line x1="${IX0}" y1="314" x2="${W}" y2="314" stroke="${T.sep}"/>`);
// Liquid Glass
out.push(section(340, 'Liquid Glass'));
out.push(label(372, 'Effects'), rect(R - 34, 362, 34, 20, T.acc, 10), `<circle cx="${R - 10}" cy="372" r="8" fill="#fff"/>`);
out.push(`<line x1="${IX0}" y1="394" x2="${W}" y2="394" stroke="${T.sep}"/>`);
// Composition
out.push(section(420, 'Composition'));
out.push(label(452, 'Visible'), rect(R - 34, 442, 34, 20, T.acc, 10), `<circle cx="${R - 10}" cy="452" r="8" fill="#fff"/>`);
out.push(label(486, 'Layout'));
const cw = (R - L - 12) / 3;
out.push(field(L, 496, cw, '—', { fill: T.t3 }), txt(L + 8, 511, 'X', { size: 11, fill: T.t3 }), field(L + cw + 6, 496, cw, '—', { fill: T.t3 }), txt(L + cw + 14, 511, 'Y', { size: 11, fill: T.t3 }), field(L + 2 * (cw + 6), 496, cw, '100%'));
// Align row (new)
out.push(label(546, 'Align'), popup(R - 112, 531, 112, 'To Selection'));
const btn = (x: number, y: number, g: string, active = false, disabled = false) =>
  rect(x, y, 26, 24, active ? 'rgba(91,140,255,0.22)' : T.ctrl, 6) + `<g transform="translate(${x + 6} ${y + 5})" stroke="${disabled ? T.t3 : active ? T.acc : T.t1}" stroke-width="1.4" fill="none">${g}</g>`;
const bx = L;
const step = 29;
out.push(btn(bx, 558, G.left, true), btn(bx + step, 558, G.hc), btn(bx + 2 * step, 558, G.right));
out.push(btn(bx + 3 * step + 8, 558, G.top), btn(bx + 4 * step + 8, 558, G.vc), btn(bx + 5 * step + 8, 558, G.bottom));
out.push(btn(bx + 6 * step + 16, 558, G.dh), btn(bx + 7 * step + 16, 558, G.dv));
out.push(txt(L, 628, 'Distribute needs 3 or more items.', { size: 10, fill: T.t3 }), txt(L, 642, 'With one item, Align uses the canvas.', { size: 10, fill: T.t3 }));
// tooltip
out.push(rect(bx - 4, 587, 104, 22, '#000', 5, 'opacity=".85"'), txt(bx + 48, 602, 'Align Left Edges', { size: 11, fill: '#fff', anchor: 'middle' }));
out.push(`<line x1="${IX0}" y1="656" x2="${W}" y2="656" stroke="${T.sep}"/>`);

// context menu with Align submenu
const CMX = IX + S - 300, CMY = IY + 214;
const mi = (y: number, label: string, sc = '', o: { hl?: boolean; dis?: boolean; arrow?: boolean } = {}) =>
  (o.hl ? rect(CMX + 5, y - 15, 214, 22, T.acc, 5) : '') +
  txt(CMX + 16, y, label, { size: 13, fill: o.dis ? T.t3 : o.hl ? '#fff' : T.t1 }) +
  (sc ? txt(CMX + 208, y, sc, { size: 12, fill: o.hl ? '#fff' : T.t3, anchor: 'end' }) : '') +
  (o.arrow ? `<path d="M${CMX + 203} ${y - 8} l4 4 l-4 4" stroke="${o.hl ? '#fff' : T.t2}" stroke-width="1.5" fill="none"/>` : '');
out.push(`<g filter="url(#shadow)">${rect(CMX, CMY, 224, 214, T.elev, 9, `stroke="${T.hair}"`)}</g>`);
out.push(
  mi(CMY + 24, 'Duplicate', '⌘D'),
  mi(CMY + 48, 'Group Layers', '⌘G'),
  mi(CMY + 72, 'Show / Hide', '⇧⌘H'),
  `<line x1="${CMX + 10}" y1="${CMY + 84}" x2="${CMX + 214}" y2="${CMY + 84}" stroke="${T.sep}"/>`,
  mi(CMY + 104, 'Align', '', { hl: true, arrow: true }),
  mi(CMY + 128, 'Distribute', '', { arrow: true }),
  `<line x1="${CMX + 10}" y1="${CMY + 140}" x2="${CMX + 214}" y2="${CMY + 140}" stroke="${T.sep}"/>`,
  mi(CMY + 160, 'Copy Style', '⌥⌘C'),
  mi(CMY + 184, 'Paste Style', '⌥⌘V'),
  mi(CMY + 206, 'Remove', '⌫'),
);
const SMX = CMX + 222, SMY = CMY + 82;
out.push(`<g filter="url(#shadow)">${rect(SMX, SMY, 176, 166, T.elev, 9, `stroke="${T.hair}"`)}</g>`);
const smi = (y: number, label: string, glyph: string) => txt(SMX + 40, y, label, { size: 13 }) + `<g transform="translate(${SMX + 14} ${y - 12})" stroke="${T.t2}" stroke-width="1.4" fill="none">${glyph}</g>`;
out.push(
  smi(SMY + 24, 'Left Edges', G.left),
  smi(SMY + 48, 'Horizontal Centers', G.hc),
  smi(SMY + 72, 'Right Edges', G.right),
  `<line x1="${SMX + 10}" y1="${SMY + 84}" x2="${SMX + 166}" y2="${SMY + 84}" stroke="${T.sep}"/>`,
  smi(SMY + 104, 'Top Edges', G.top),
  smi(SMY + 128, 'Vertical Centers', G.vc),
  smi(SMY + 152, 'Bottom Edges', G.bottom),
);

// ---------------------------------------------------------------- status bar
out.push(rect(0, H - 24, W, 24, T.win), `<line x1="0" y1="${H - 24}" x2="${W}" y2="${H - 24}" stroke="${T.sep}"/>`);
out.push(txt(16, H - 8, '1024 × 1024 · Display P3 · Squares: shared · Circles: watchOS', { size: 11, fill: T.t2 }), txt(W - 16, H - 8, '1 issue    actool: not available', { size: 11, fill: T.t2, anchor: 'end' }));

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<title>fresnel — Multiple selection, Align and Distribute (dark)</title>` +
  `<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".5"/></filter></defs>` +
  out.join('\n') +
  `</svg>\n`;
writeFileSync(new URL('../04-multi-select.svg', import.meta.url), svg);
console.log('design/04-multi-select.svg written');
