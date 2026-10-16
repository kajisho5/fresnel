/**
 * SVG compositor. Builds a self-contained SVG that approximates how the system
 * renders a layered Liquid Glass icon. The same SVG is rasterized by the browser
 * (UI) and by resvg (CLI / MCP), so every surface shows the same picture.
 *
 * [推測] Apple's renderer is private. Everything here is an approximation
 * tuned to look plausible; see docs/DESIGN.md §7.
 */
import {
  CANVAS,
  FRONT_FIRST,
  isDarkAppearance,
  mimeOf,
  parseColor,
  resolveProp,
  rgbaToCss,
  shade,
  toRGBA,
  type Appearance,
  type Asset,
  type Fill,
  type GroupNode,
  type IconDocument,
  type LayerNode,
  type Position,
  type RGBA,
  type ResolveCtx,
  type Shadow,
  type Translucency,
} from '@fresnel/core';
import { maskPath, type MaskShape } from './mask';

export interface RenderOptions {
  appearance?: Appearance;
  /** output pixel size (width = height). Default 1024 */
  size?: number;
  mask?: MaskShape;
  /** light direction in degrees: 0 = from top, -45 = from top-left (default) */
  lightAngle?: number;
  /** tint color for tinted appearances, "#RRGGBB". Default #3FA7A0 */
  tint?: string;
  /** draw the outer rim highlight. Default true */
  rim?: boolean;
  /** prefix for element ids (needed when several icons are inlined in one document) */
  idPrefix?: string;
}

const C = CANVAS;
const H = C / 2;

const b64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const n = (x: number) => +x.toFixed(3);

function hexToRGBA(hex: string): RGBA {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.25, g: 0.65, b: 0.63, a: 1 };
  const v = parseInt(m[1]!, 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255, a: 1 };
}

const colorOf = (s: unknown): RGBA => {
  const c = typeof s === 'string' ? parseColor(s) : null;
  return c ? toRGBA(c) : { r: 0, g: 0, b: 0, a: 1 };
};

class Defs {
  private items: string[] = [];
  private i = 0;
  constructor(private readonly ns = '') {}
  id(prefix: string) {
    this.i += 1;
    return `${this.ns}${prefix}${this.i}`;
  }
  add(s: string) {
    this.items.push(s);
  }
  toString() {
    return this.items.join('\n');
  }
}

/** Gradient / color paint for a fill inside a bounding box. Returns null for "no fill". */
function paintFor(fill: unknown, defs: Defs, box: { x: number; y: number; w: number; h: number }, darkSystem: boolean): string | null {
  if (fill === null || fill === undefined || fill === 'none') return null;
  const lin = (c1: RGBA, c2: RGBA, start = { x: 0.5, y: 0 }, stop = { x: 0.5, y: 1 }) => {
    const id = defs.id('lg');
    defs.add(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(box.x + start.x * box.w)}" y1="${n(box.y + start.y * box.h)}" ` +
        `x2="${n(box.x + stop.x * box.w)}" y2="${n(box.y + stop.y * box.h)}">` +
        `<stop offset="0" stop-color="${rgbaToCss({ ...c1, a: 1 })}" stop-opacity="${n(c1.a)}"/>` +
        `<stop offset="1" stop-color="${rgbaToCss({ ...c2, a: 1 })}" stop-opacity="${n(c2.a)}"/></linearGradient>`,
    );
    return `url(#${id})`;
  };
  if (fill === 'automatic' || fill === 'system-light' || fill === 'system-dark') {
    const dark = fill === 'system-dark' || (fill === 'automatic' && darkSystem);
    return dark
      ? lin({ r: 0.235, g: 0.235, b: 0.25, a: 1 }, { r: 0.11, g: 0.11, b: 0.118, a: 1 })
      : lin({ r: 1, g: 1, b: 1, a: 1 }, { r: 0.89, g: 0.89, b: 0.91, a: 1 });
  }
  if (typeof fill !== 'object') return null;
  const f = fill as Record<string, unknown>;
  if (typeof f.solid === 'string') {
    const c = colorOf(f.solid);
    return rgbaToCss(c);
  }
  if (typeof f['automatic-gradient'] === 'string') {
    const c = colorOf(f['automatic-gradient']);
    return lin(shade(c, 0.22), shade(c, -0.08));
  }
  if (Array.isArray(f['linear-gradient'])) {
    const [a, b] = f['linear-gradient'] as string[];
    const o = f.orientation as { start: { x: number; y: number }; stop: { x: number; y: number } } | undefined;
    return lin(colorOf(a), colorOf(b), o?.start, o?.stop);
  }
  return null;
}

interface Placed {
  layer: LayerNode;
  asset: Asset;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function renderSvg(doc: IconDocument, opts: RenderOptions = {}): string {
  const appearance = opts.appearance ?? 'default';
  const size = opts.size ?? 1024;
  const mask = opts.mask ?? 'squircle';
  const ctx: ResolveCtx = { appearance };
  const dark = isDarkAppearance(appearance);
  const isClear = appearance === 'clear-light' || appearance === 'clear-dark';
  const isTinted = appearance === 'tinted-light' || appearance === 'tinted-dark';
  const tint = hexToRGBA(opts.tint ?? '#3FA7A0');
  const angle = ((opts.lightAngle ?? -45) * Math.PI) / 180;
  const toLight = { x: Math.sin(angle), y: -Math.cos(angle) };
  const defs = new Defs(opts.idPrefix ?? '');
  const body: string[] = [];

  // ------------------------------------------------------------ background
  const fillProp = doc.props.fill;
  let bgFill = resolveProp<unknown>(fillProp, ctx, 'automatic');
  const darkOverridden = !!fillProp?.specs?.some((s) => s.appearance === 'dark');
  let darken = 0;
  if (dark && !darkOverridden && bgFill !== 'automatic' && bgFill !== 'system-dark' && bgFill !== 'none') darken = 0.62; // system-generated dark
  let bgPaint: string | null;
  const full = { x: 0, y: 0, w: C, h: C };
  if (isClear) {
    bgPaint = dark
      ? paintFor({ 'linear-gradient': ['srgb:0.24,0.25,0.28,0.92', 'srgb:0.11,0.12,0.13,0.92'] }, defs, full, true)
      : paintFor({ 'linear-gradient': ['srgb:0.97,0.98,0.99,0.86', 'srgb:0.84,0.87,0.91,0.86'] }, defs, full, false);
  } else if (isTinted) {
    const top = dark ? shade(tint, -0.86) : shade(tint, 0.86);
    const bot = dark ? shade(tint, -0.93) : shade(tint, 0.74);
    bgPaint = paintFor(
      { 'linear-gradient': [`srgb:${top.r},${top.g},${top.b},1`, `srgb:${bot.r},${bot.g},${bot.b},1`] },
      defs,
      full,
      dark,
    );
  } else {
    if (bgFill === undefined) bgFill = 'automatic';
    bgPaint = paintFor(bgFill, defs, full, dark);
  }

  // ------------------------------------------------------------ groups (back to front)
  const groups = FRONT_FIRST ? [...doc.groups].reverse() : [...doc.groups];
  let stackId = defs.id('s');
  const bgStackId = stackId;
  const contentIds: string[] = [];
  defs.add(
    `<g id="${stackId}">${bgPaint ? `<rect width="${C}" height="${C}" fill="${bgPaint}"/>` : ''}` +
      (darken ? `<rect width="${C}" height="${C}" fill="#000" opacity="${darken}"/>` : '') +
      `</g>`,
  );

  for (const g of groups) {
    if (resolveProp(g.props.hidden, ctx, false)) continue;
    const drawn = drawGroup(g);
    if (!drawn) continue;
    const next = defs.id('s');
    defs.add(`<g id="${next}"><use href="#${stackId}"/>${drawn}</g>`);
    stackId = next;
  }

  function drawGroup(g: GroupNode): string | null {
    const gpos = resolveProp<Position | null>(g.props.position, ctx, null);
    const layers = FRONT_FIRST ? [...g.layers].reverse() : [...g.layers];
    const placed: Placed[] = [];
    for (const l of layers) {
      if (resolveProp(l.props.hidden, ctx, false)) continue;
      const name = resolveProp<string>(l.props['image-name'], ctx, '');
      const asset = doc.assets[name];
      if (!asset || asset.kind === 'pdf' || asset.kind === 'other') continue;
      const pos = resolveProp<Position | null>(l.props.position, ctx, null);
      const s = pos?.scale ?? 1;
      const [tx, ty] = pos?.['translation-in-points'] ?? [0, 0];
      const w = asset.width * s;
      const h = asset.height * s;
      placed.push({ layer: l, asset, x: H + tx - w / 2, y: H + ty - h / 2, w, h });
    }
    if (!placed.length) return null;

    const imgId = new Map<string, string>();
    const layerEls: string[] = [];
    const glassEls: string[] = [];
    for (const p of placed) {
      let iid = imgId.get(p.asset.name);
      if (!iid) {
        iid = defs.id('img');
        imgId.set(p.asset.name, iid);
        // natural-size image symbol; placed via <use> with transform
        defs.add(
          `<image id="${iid}" width="${n(p.asset.width)}" height="${n(p.asset.height)}" preserveAspectRatio="none" href="data:${mimeOf(p.asset)};base64,${b64(p.asset.bytes)}"/>`,
        );
      }
      const s = p.w / p.asset.width;
      const place = `transform="translate(${n(p.x)} ${n(p.y)}) scale(${n(s)})"`;
      const fill = resolveProp<Fill | null>(p.layer.props.fill, ctx, null);
      const opacity = resolveProp<number>(p.layer.props.opacity, ctx, 1);
      const blend = cssBlend(resolveProp<string>(p.layer.props['blend-mode'], ctx, 'normal'));
      const paint = fill && fill !== 'automatic' ? paintFor(fill, defs, { x: p.x, y: p.y, w: p.w, h: p.h }, dark) : null;
      let el: string;
      if (paint) {
        const mid = defs.id('lm');
        defs.add(`<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-${C}" y="-${C}" width="${3 * C}" height="${3 * C}"><use href="#${iid}" ${place}/></mask>`);
        el = `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${paint}" mask="url(#${mid})"/>`;
      } else {
        el = `<use href="#${iid}" ${place}/>`;
      }
      const wrapped = `<g${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}${blend ? ` style="mix-blend-mode:${blend}"` : ''}>${el}</g>`;
      layerEls.push(wrapped);
      if (resolveProp(p.layer.props.glass, ctx, false)) glassEls.push(`<use href="#${iid}" ${place}/>`);
    }

    const gTransform = gpos
      ? ` transform="translate(${n(H + (gpos['translation-in-points']?.[0] ?? 0))} ${n(H + (gpos['translation-in-points']?.[1] ?? 0))}) scale(${n(gpos.scale ?? 1)}) translate(${-H} ${-H})"`
      : '';
    const contentId = defs.id('gc');
    defs.add(`<g id="${contentId}"${gTransform}>${layerEls.join('')}</g>`);
    contentIds.push(contentId);
    const out: string[] = [];

    // shadow
    const shadow = resolveProp<Shadow | null>(g.props.shadow, ctx, { kind: 'neutral', opacity: 0.5 });
    if (shadow && shadow.kind !== 'none' && shadow.opacity > 0) {
      const fid = defs.id('sh');
      if (shadow.kind === 'neutral') {
        defs.add(
          `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="16"/>` +
            `<feOffset dy="14" result="b"/><feFlood flood-color="#000" flood-opacity="0.45"/><feComposite in2="b" operator="in"/></filter>`,
        );
      } else {
        defs.add(
          `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceGraphic" stdDeviation="18"/>` +
            `<feOffset dy="16"/><feColorMatrix type="matrix" values="0.75 0 0 0 0  0 0.75 0 0 0  0 0 0.75 0 0  0 0 0 0.8 0"/></filter>`,
        );
      }
      out.push(`<use href="#${contentId}" filter="url(#${fid})" opacity="${n(shadow.opacity)}"/>`);
    }

    // translucency: frosted, slightly magnified backdrop seen through the group's shape
    const tr = resolveProp<Translucency | null>(g.props.translucency, ctx, { enabled: true, value: 0.5 });
    const blurMat = resolveProp<number | null>(g.props['blur-material'], ctx, null);
    const translucent = !!tr?.enabled && tr.value > 0;
    if (translucent) {
      const mid = defs.id('gm');
      defs.add(`<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="${C}" height="${C}"><use href="#${contentId}"/></mask>`);
      const fid = defs.id('bk');
      defs.add(`<filter id="${fid}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${n(6 + (blurMat ?? 0.2) * 40)}"/></filter>`);
      out.push(
        `<g mask="url(#${mid})"><use href="#${stackId}" filter="url(#${fid})" transform="translate(${H} ${H}) scale(1.035) translate(${-H} ${-H})"/></g>`,
      );
    }

    // content
    const gOpacity = resolveProp<number>(g.props.opacity, ctx, 1) * (translucent ? 1 - tr!.value * 0.55 : 1);
    const gBlend = cssBlend(resolveProp<string>(g.props['blend-mode'], ctx, 'normal'));
    out.push(`<use href="#${contentId}"${gOpacity < 1 ? ` opacity="${n(gOpacity)}"` : ''}${gBlend ? ` style="mix-blend-mode:${gBlend}"` : ''}/>`);

    // specular highlight on glass layers
    const specular = resolveProp<boolean>(g.props.specular, ctx, true);
    if (specular && glassEls.length) {
      const k = 7;
      const dx = n(-toLight.x * k);
      const dy = n(-toLight.y * k);
      const individual = resolveProp<string>(g.props.lighting, ctx, 'combined') === 'individual';
      const fid = defs.id('sp');
      defs.add(
        `<filter id="${fid}" x="-5%" y="-5%" width="110%" height="110%">` +
          `<feOffset in="SourceAlpha" dx="${dx}" dy="${dy}" result="sh"/>` +
          `<feComposite in="SourceAlpha" in2="sh" operator="out" result="edge"/>` +
          `<feGaussianBlur in="edge" stdDeviation="1.6" result="soft"/>` +
          `<feFlood flood-color="#fff" flood-opacity="0.85"/><feComposite in2="soft" operator="in" result="hi"/>` +
          `<feOffset in="SourceAlpha" dx="${n(-dx)}" dy="${n(-dy)}" result="sh2"/>` +
          `<feComposite in="SourceAlpha" in2="sh2" operator="out" result="edge2"/>` +
          `<feGaussianBlur in="edge2" stdDeviation="2" result="soft2"/>` +
          `<feFlood flood-color="#fff" flood-opacity="0.28"/><feComposite in2="soft2" operator="in" result="lo"/>` +
          `<feMerge><feMergeNode in="hi"/><feMergeNode in="lo"/></feMerge></filter>`,
      );
      const glass = individual
        ? glassEls.map((e) => `<g filter="url(#${fid})">${e}</g>`).join('')
        : `<g filter="url(#${fid})">${glassEls.join('')}</g>`;
      out.push(`<g${gTransform}>${glass}</g>`);
    }
    return out.join('');
  }

  // ------------------------------------------------------------ appearance transform of the foreground
  let top = `<use href="#${stackId}"/>`;
  if ((isClear || isTinted) && contentIds.length) {
    const fid = defs.id('ap');
    if (isClear) {
      const a = dark ? 0.82 : 0.95;
      const base = dark ? 0.86 : 1;
      defs.add(
        `<filter id="${fid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="` +
          `0 0 0 0 ${base}  0 0 0 0 ${base}  0 0 0 0 ${base}  ${n(0.2126 * 0.5 * a)} ${n(0.7152 * 0.5 * a)} ${n(0.0722 * 0.5 * a)} ${n(0.5 * a)} 0"/></filter>`,
      );
    } else {
      const t = dark ? shade(tint, 0.15) : shade(tint, -0.2);
      const gain = dark ? 1.1 : 0.95;
      const lift = dark ? 0.25 : 0.1;
      const row = (c: number) => `${n(c * gain * 0.2126)} ${n(c * gain * 0.7152)} ${n(c * gain * 0.0722)} 0 ${n(c * lift)}`;
      defs.add(
        `<filter id="${fid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${row(t.r)}  ${row(t.g)}  ${row(t.b)}  0 0 0 1 0"/></filter>`,
      );
    }
    // foreground = final stack masked by the union of all group shapes
    const mid = defs.id('fm');
    defs.add(
      `<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="${C}" height="${C}">` +
        contentIds.map((id) => `<use href="#${id}"/>`).join('') +
        `</mask>`,
    );
    top = `<use href="#${bgStackId}"/><g filter="url(#${fid})"><use href="#${stackId}" mask="url(#${mid})"/></g>`;
  }

  // ------------------------------------------------------------ mask + rim
  const clipId = defs.id('clip');
  const shape = maskPath(mask);
  defs.add(`<clipPath id="${clipId}"><path d="${shape}"/></clipPath>`);
  body.push(`<g clip-path="url(#${clipId})">${top}</g>`);
  if (opts.rim !== false && mask !== 'none') {
    const rid = defs.id('rim');
    const lx = H + toLight.x * H;
    const ly = H + toLight.y * H;
    defs.add(
      `<linearGradient id="${rid}" gradientUnits="userSpaceOnUse" x1="${n(lx)}" y1="${n(ly)}" x2="${n(C - lx)}" y2="${n(C - ly)}">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.55 : 0.85}"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/>` +
        `<stop offset="0.7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="${dark ? 0.2 : 0.3}"/></linearGradient>`,
    );
    body.push(`<g clip-path="url(#${clipId})"><path d="${shape}" fill="none" stroke="url(#${rid})" stroke-width="10"/></g>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${C} ${C}">` +
    `<title>${esc(appearance)}</title><defs>${defs.toString()}</defs>${body.join('')}</svg>`
  );
}

function cssBlend(mode: string): string | null {
  if (!mode || mode === 'normal') return null;
  if (mode === 'plus-lighter') return 'screen';
  if (mode === 'plus-darker') return 'multiply';
  return mode;
}
