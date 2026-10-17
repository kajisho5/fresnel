/**
 * SVG compositor. Builds a self-contained SVG that approximates how the system
 * renders a layered Liquid Glass icon. The same SVG is rasterized by the browser
 * (UI) and by resvg (CLI / MCP), so every surface shows the same picture.
 *
 * [推測] Apple's renderer is private. Everything here is an approximation
 * tuned to look plausible; see docs/DESIGN.md §7.
 */
import {
  BLEND_MODES,
  CANVAS,
  FRONT_FIRST,
  idiomsFor,
  normalizeColorInput,
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
  type RGBA,
  type ResolveCtx,
  type Shadow,
  type Translucency,
} from '@fresnel/core';
import { maskPath, type MaskShape } from './mask';
import { contentBoxOf } from './content';
import { assetLuma, fillLuma } from './luma';

export interface RenderOptions {
  appearance?: Appearance;
  /** output pixel size (width = height). Default 1024 */
  size?: number;
  mask?: MaskShape;
  /** light direction in degrees: 0 = from top (default, Icon Composer's current generation), -45 = from top-left */
  lightAngle?: number;
  /** tint color for tinted appearances, "#RRGGBB". Default #3FA7A0 */
  tint?: string;
  /** draw the outer rim highlight. Default true */
  rim?: boolean;
  /** prefix for element ids (needed when several icons are inlined in one document) */
  idPrefix?: string;
  /** platform being previewed (resolves platform variants). Default iOS */
  idiom?: 'iOS' | 'macOS' | 'watchOS';
  /** false = no Liquid Glass effects (Icon Composer's "Effects" toggle). Default true */
  effects?: boolean;
  /** false = leave out the background (transparent) */
  background?: boolean;
  /** transparent margin around the icon, in points of the 1024 pt output, with a drop shadow (classic macOS template: 100 → an 824 pt body) */
  inset?: number;
}

/** Maps export raster options (@fresnel/core RasterOptions) onto render options. */
export function rasterRenderOptions(ro?: {
  mask?: MaskShape;
  tint?: string;
  idiom?: 'iOS' | 'macOS' | 'watchOS';
  background?: boolean;
  inset?: number;
}): RenderOptions {
  if (!ro) return {};
  return {
    ...(ro.mask ? { mask: ro.mask, rim: ro.mask !== 'none' } : {}),
    ...(ro.tint ? { tint: ro.tint } : {}),
    ...(ro.idiom ? { idiom: ro.idiom } : {}),
    ...(ro.background === false ? { background: false } : {}),
    ...(ro.inset ? { inset: ro.inset } : {}),
  };
}

const C = CANVAS;
/** Margin around the canvas for filter and mask regions: covers the watchOS pad and the macOS inset, and keeps blur buffers small (a region in % of an element far off the canvas crashed resvg). */
const PAD = C / 4;
const H = C / 2;

const b64Cache = new WeakMap<Uint8Array, string>();
const b64 = (bytes: Uint8Array): string => {
  const hit = b64Cache.get(bytes);
  if (hit) return hit;
  let out: string;
  const NodeBuffer = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: 'base64'): string } } }).Buffer;
  if (NodeBuffer) out = NodeBuffer.from(bytes).toString('base64');
  else {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out = btoa(s);
  }
  b64Cache.set(bytes, out);
  return out;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const n = (x: number) => +x.toFixed(3);

const DEFAULT_TINT: RGBA = { r: 0.25, g: 0.65, b: 0.63, a: 1 };

/** Tint color: #RGB, #RRGGBB, #RRGGBBAA or a color string ("srgb:…", "display-p3:…"). Anything else → the default tint. */
function tintToRGBA(input: string): RGBA {
  try {
    const c = parseColor(normalizeColorInput(input));
    return c ? { ...toRGBA(c), a: 1 } : DEFAULT_TINT;
  } catch {
    return DEFAULT_TINT;
  }
}

/** A finite number, else the fallback (icon.json values aren't validated before rendering). */
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Position with a positive finite scale and a finite [x, y] translation. */
function safePosition(p: unknown): { scale: number; tx: number; ty: number } | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as { scale?: unknown; 'translation-in-points'?: unknown };
  const t = Array.isArray(o['translation-in-points']) ? o['translation-in-points'] : [];
  const scale = num(o.scale, 1);
  return { scale: scale > 0 ? scale : 1, tx: num(t[0], 0), ty: num(t[1], 0) };
}

/** Gradient orientation with numeric start/stop points, else undefined (top to bottom). */
function safeOrientation(o: unknown): { start: { x: number; y: number }; stop: { x: number; y: number } } | undefined {
  const pt = (v: unknown) => {
    const q = v as { x?: unknown; y?: unknown } | null;
    return q && typeof q === 'object' && Number.isFinite(q.x) && Number.isFinite(q.y) ? { x: q.x as number, y: q.y as number } : null;
  };
  const r = o as { start?: unknown; stop?: unknown } | null;
  const start = r && typeof r === 'object' ? pt(r.start) : null;
  const stop = r && typeof r === 'object' ? pt(r.stop) : null;
  return start && stop ? { start, stop } : undefined;
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
  if (Array.isArray(f['linear-gradient']) && f['linear-gradient'].length) {
    const [a, b] = f['linear-gradient'] as unknown[];
    const o = safeOrientation(f.orientation);
    // a single color is a flat gradient of that color
    return lin(colorOf(a), colorOf(b ?? a), o?.start, o?.stop);
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
  const ctx: ResolveCtx = { appearance, idiom: opts.idiom ?? 'iOS' };
  const effects = opts.effects !== false;
  const dark = isDarkAppearance(appearance);
  const isClear = appearance === 'clear-light' || appearance === 'clear-dark';
  const isTinted = appearance === 'tinted-light' || appearance === 'tinted-dark';
  const tint = opts.tint ? tintToRGBA(opts.tint) : DEFAULT_TINT;
  const idioms = idiomsFor(ctx.idiom);
  /** A variant entry that applies to the platform being rendered. */
  const forPlatform = (s: { idiom?: string }) => s.idiom === undefined || (idioms as string[]).includes(s.idiom);
  // Icon Composer's current generation lights icons from straight above (developer.apple.com/icon-composer)
  const angle = ((opts.lightAngle ?? 0) * Math.PI) / 180;
  const toLight = { x: Math.sin(angle), y: -Math.cos(angle) };
  const defs = new Defs(opts.idPrefix ?? '');
  const body: string[] = [];

  // ------------------------------------------------------------ background
  const fillProp = doc.props.fill;
  let bgFill = resolveProp<unknown>(fillProp, ctx, 'automatic');
  // only a dark variant that applies to this platform turns off the system-generated darkening
  const darkOverridden = !!fillProp?.specs?.some((s) => s.appearance === 'dark' && forPlatform(s));
  let darken = 0;
  if (dark && !darkOverridden && bgFill !== 'automatic' && bgFill !== 'system-dark' && bgFill !== 'none') darken = 0.62; // system-generated dark
  let bgPaint: string | null;
  // watchOS: the canvas is 1088 pt, 32 pt larger on each side than the shared 1024 artwork.
  // Sources: HIG App icons (watchOS layout size 1088×1088), WWDC25 #220 ("the 1088 pixel canvas overshoots
  // our rounded rectangle"), Xcode "Creating your app icon using Icon Composer" (1088 × 1088 for Apple Watch).
  // (a squircle or circle preview of the watch keeps its usual size; only the unmasked export uses the whole watch canvas)
  const P = mask === 'circle' || (mask === 'none' && ctx.idiom === 'watchOS') ? 32 : 0;
  const full = { x: -P, y: -P, w: C + 2 * P, h: C + 2 * P };
  // an explicit Mono ("tinted") fill override replaces the system-generated clear / tinted background [推測]
  // (Clear and Tinted are both "Mono" in Icon Composer, so the "tinted" variant is used for both)
  const monoOverride = (isClear || isTinted) && !!fillProp?.specs?.some((s) => s.appearance === 'tinted' && forPlatform(s));
  if (monoOverride) {
    const mono = resolveProp<unknown>(fillProp, { appearance: dark ? 'tinted-dark' : 'tinted-light', idiom: ctx.idiom }, 'automatic');
    bgPaint = paintFor(mono ?? 'automatic', defs, full, dark);
  } else if (isClear) {
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
  if (opts.background === false) {
    bgPaint = null;
    darken = 0;
  }
  const backdropLuma = (fillLuma(isClear || isTinted ? (dark ? 'system-dark' : 'system-light') : bgFill, dark) ?? 0.9) * (1 - darken);

  // ------------------------------------------------------------ groups (back to front)
  const groups = FRONT_FIRST ? [...doc.groups].reverse() : [...doc.groups];
  let stackId = defs.id('s');
  const bgStackId = stackId;
  const contentIds: string[] = [];
  defs.add(
    `<g id="${stackId}">${bgPaint ? `<rect x="${-P}" y="${-P}" width="${C + 2 * P}" height="${C + 2 * P}" fill="${bgPaint}"/>` : ''}` +
      (darken ? `<rect x="${-P}" y="${-P}" width="${C + 2 * P}" height="${C + 2 * P}" fill="#000" opacity="${darken}"/>` : '') +
      `</g>`,
  );

  // Backdrops (translucency / refraction) sample `plainId`: background plus the plain content of the
  // groups behind, without their own backdrop effects. Sampling the full stack instead would make
  // every level reference the previous one twice, and render time would grow as 2^groups.
  let plainId = bgStackId;
  for (const g of groups) {
    if (resolveProp(g.props.hidden, ctx, false)) continue;
    const drawn = drawGroup(g, plainId);
    if (!drawn) continue;
    const next = defs.id('s');
    defs.add(`<g id="${next}"><use href="#${stackId}"/>${drawn}</g>`);
    stackId = next;
    const plain = defs.id('p');
    defs.add(`<g id="${plain}"><use href="#${plainId}"/><use href="#${contentIds[contentIds.length - 1]}"/></g>`);
    plainId = plain;
  }

  function drawGroup(g: GroupNode, backdropId: string): string | null {
    const gp = safePosition(resolveProp<unknown>(g.props.position, ctx, null));
    const gs = gp?.scale ?? 1;
    const gtx = gp?.tx ?? 0;
    const gty = gp?.ty ?? 0;
    // the canvas ±PAD region expressed inside the group's transform (layer masks and specular filters live there)
    const gx0 = H + (-PAD - H - gtx) / gs;
    const gy0 = H + (-PAD - H - gty) / gs;
    const gw = (C + 2 * PAD) / gs;
    const localRegion = `x="${n(gx0)}" y="${n(gy0)}" width="${n(gw)}" height="${n(gw)}"`;
    const layers = FRONT_FIRST ? [...g.layers].reverse() : [...g.layers];
    const placed: Placed[] = [];
    for (const l of layers) {
      if (resolveProp(l.props.hidden, ctx, false)) continue;
      const name = resolveProp<string>(l.props['image-name'], ctx, '');
      const asset = doc.assets[name];
      if (!asset || asset.kind === 'pdf' || asset.kind === 'other') continue;
      // images whose size couldn't be read (0×0, corrupt header) have nothing to draw
      if (!(asset.width > 0 && asset.height > 0 && Number.isFinite(asset.width) && Number.isFinite(asset.height))) continue;
      const pos = safePosition(resolveProp<unknown>(l.props.position, ctx, null));
      const s = pos?.scale ?? 1;
      const w = asset.width * s;
      const h = asset.height * s;
      const x = H + (pos?.tx ?? 0) - w / 2;
      const y = H + (pos?.ty ?? 0) - h / 2;
      // layers entirely off the canvas are skipped (they're clipped anyway, and huge offsets upset resvg)
      const cx0 = H + gtx + (x - H) * gs;
      const cy0 = H + gty + (y - H) * gs;
      const cx1 = cx0 + w * gs;
      const cy1 = cy0 + h * gs;
      if (cx1 < -P || cy1 < -P || cx0 > C + P || cy0 > C + P) continue;
      placed.push({ layer: l, asset, x, y, w, h });
    }
    if (!placed.length) return null;
    // group opacity applies to everything the group draws (shadow, frosted backdrop, content, highlights)
    const groupOpacity = Math.min(1, Math.max(0, num(resolveProp<unknown>(g.props.opacity, ctx, 1), 1)));
    if (groupOpacity <= 0) return null;

    const imgId = new Map<string, string>();
    const layerEls: string[] = [];
    const glassEls: string[] = [];
    const glassLumas: number[] = [];
    for (const p of placed) {
      let iid = imgId.get(p.asset.name);
      if (!iid) {
        iid = defs.id('img');
        imgId.set(p.asset.name, iid);
        // natural-size image symbol; placed via <use> with transform
        defs.add(
          `<image id="${iid}" width="${n(p.asset.width)}" height="${n(p.asset.height)}" preserveAspectRatio="none" href="data:${mimeOf(p.asset)};base64,${b64(p.asset.display ?? p.asset.bytes)}"/>`,
        );
      }
      const s = p.w / p.asset.width;
      const place = `transform="translate(${n(p.x)} ${n(p.y)}) scale(${n(s)})"`;
      const fill = resolveProp<Fill | null>(p.layer.props.fill, ctx, null);
      const opacity = Math.min(1, Math.max(0, num(resolveProp<unknown>(p.layer.props.opacity, ctx, 1), 1)));
      const blend = cssBlend(resolveProp<unknown>(p.layer.props['blend-mode'], ctx, 'normal'));
      // gradients are measured against the drawn shape's bounds, not the whole image
      const cb = contentBoxOf(p.asset);
      const fbox = cb ? { x: p.x + cb.x * p.w, y: p.y + cb.y * p.h, w: cb.w * p.w, h: cb.h * p.h } : { x: p.x, y: p.y, w: p.w, h: p.h };
      const paint = fill && fill !== 'automatic' ? paintFor(fill, defs, fbox, dark) : null;
      let el: string;
      if (paint) {
        const mid = defs.id('lm');
        defs.add(`<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" ${localRegion}><use href="#${iid}" ${place}/></mask>`);
        el = `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${paint}" mask="url(#${mid})"/>`;
      } else {
        el = `<use href="#${iid}" ${place}/>`;
      }
      const wrapped = `<g${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}${blend ? ` style="mix-blend-mode:${blend}"` : ''}>${el}</g>`;
      layerEls.push(wrapped);
      if (resolveProp(p.layer.props.glass, ctx, false)) {
        glassEls.push(`<use href="#${iid}" ${place}/>`);
        // the layer's own fill wins over the image's colors
        glassLumas.push(fill && fill !== 'automatic' ? (fillLuma(fill, dark) ?? assetLuma(p.asset)) : assetLuma(p.asset));
      }
    }

    const gTransform = gp ? ` transform="translate(${n(H + gtx)} ${n(H + gty)}) scale(${n(gs)}) translate(${-H} ${-H})"` : '';
    // Filter regions are fixed in user space (canvas ±1024 pt), never relative to an element's bounds:
    // resvg panics on huge relative regions (items far off the canvas), and this also caps memory.
    const canvasRegion = `filterUnits="userSpaceOnUse" x="${-PAD}" y="${-PAD}" width="${C + 2 * PAD}" height="${C + 2 * PAD}"`;
    const groupRegion = `filterUnits="userSpaceOnUse" ${localRegion}`;
    const contentId = defs.id('gc');
    defs.add(`<g id="${contentId}"${gTransform}>${layerEls.join('')}</g>`);
    contentIds.push(contentId);
    const out: string[] = [];

    // shadow
    const shadow0 = resolveProp<Shadow | null>(g.props.shadow, ctx, { kind: 'neutral', opacity: 0.5 });
    const shadow = shadow0 && typeof shadow0 === 'object' ? { kind: shadow0.kind, opacity: Math.min(1, Math.max(0, num(shadow0.opacity, 0.5))) } : null;
    if (effects && shadow && shadow.kind !== 'none' && shadow.opacity > 0) {
      const fid = defs.id('sh');
      if (shadow.kind === 'neutral') {
        defs.add(
          `<filter id="${fid}" ${canvasRegion}><feGaussianBlur in="SourceAlpha" stdDeviation="16"/>` +
            `<feOffset dy="14" result="b"/><feFlood flood-color="#000" flood-opacity="0.45"/><feComposite in2="b" operator="in"/></filter>`,
        );
      } else {
        defs.add(
          `<filter id="${fid}" ${canvasRegion}><feGaussianBlur in="SourceGraphic" stdDeviation="18"/>` +
            `<feOffset dy="16"/><feColorMatrix type="matrix" values="0.75 0 0 0 0  0 0.75 0 0 0  0 0 0.75 0 0  0 0 0 0.8 0"/></filter>`,
        );
      }
      out.push(`<use href="#${contentId}" filter="url(#${fid})" opacity="${n(shadow.opacity)}"/>`);
    }

    // translucency: frosted, slightly magnified backdrop seen through the group's shape
    const tr0 = resolveProp<Translucency | null>(g.props.translucency, ctx, { enabled: true, value: 0.5 });
    const tr = tr0 && typeof tr0 === 'object' ? { enabled: !!tr0.enabled, value: num(tr0.value, 0.5) } : null;
    // absent = default amount (0.2); null = blur off (schema: "null = off")
    const blurRaw = resolveProp<unknown>(g.props['blur-material'], ctx, undefined);
    const blurMat = blurRaw === null ? null : num(blurRaw, 0.2);
    const translucent = effects && !!tr?.enabled && tr.value > 0;
    const refr0 = resolveProp<{ enabled?: boolean; strength?: number; depth?: number } | null>(g.props.refractivity, ctx, null);
    const refr = refr0 && typeof refr0 === 'object' ? { enabled: !!refr0.enabled, strength: num(refr0.strength, 0), depth: num(refr0.depth, 0) } : null;
    const refracts = effects && !!refr?.enabled && glassEls.length > 0;
    if (translucent || refracts) {
      // refraction only applies to glass layers; translucency to the whole group
      const maskSrc = translucent ? `<use href="#${contentId}"/>` : `<g${gTransform}>${glassEls.join('')}</g>`;
      const mid = defs.id('gm');
      defs.add(`<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${-PAD}" y="${-PAD}" width="${C + 2 * PAD}" height="${C + 2 * PAD}">${maskSrc}</mask>`);
      const blurPx = Math.max(0, (blurMat === null ? 0 : 4 + blurMat * 40) + (refracts ? refr!.depth * 10 : 0));
      let filterAttr = '';
      if (blurPx > 0) {
        const fid = defs.id('bk');
        defs.add(`<filter id="${fid}" ${canvasRegion}><feGaussianBlur stdDeviation="${n(blurPx)}"/></filter>`);
        filterAttr = ` filter="url(#${fid})"`;
      }
      const zoom = 1.02 + (refracts ? refr!.strength * 0.12 : 0.015);
      out.push(
        `<g mask="url(#${mid})"><use href="#${backdropId}"${filterAttr} transform="translate(${H} ${H}) scale(${n(zoom)}) translate(${-H} ${-H})"/></g>`,
      );
    }

    // content
    // (group opacity itself is applied to the whole group below)
    const gOpacity = refracts && !translucent ? 1 - Math.min(1, Math.max(0, refr!.strength)) * 0.3 : 1;
    // translucency keeps color at the top of the shape and lets more of the background through toward the bottom
    let fadeMask = '';
    if (translucent) {
      const v = Math.min(1, Math.max(0, tr!.value));
      const gid = defs.id('tg');
      const mid = defs.id('tm');
      defs.add(
        `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${n(1 - v * 0.2)}"/>` +
          `<stop offset="1" stop-color="#fff" stop-opacity="${n(1 - v * 0.85)}"/></linearGradient>` +
          `<mask id="${mid}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">` +
          `<rect width="1" height="1" fill="url(#${gid})"/></mask>`,
      );
      fadeMask = ` mask="url(#${mid})"`;
    }
    const gBlend = cssBlend(resolveProp<unknown>(g.props['blend-mode'], ctx, 'normal'));
    out.push(
      `<g${fadeMask}${gOpacity < 1 ? ` opacity="${n(gOpacity)}"` : ''}${gBlend ? ` style="mix-blend-mode:${gBlend}"` : ''}><use href="#${contentId}"/></g>`,
    );

    // specular highlight on glass layers
    const specularSetting = resolveProp<boolean | 'inside' | 'outside'>(g.props.specular, ctx, true);
    // Automatic: Inside when the glass is darker than the background, Outside when the background is darker
    const fg = glassLumas.length ? glassLumas.reduce((a, b) => a + b, 0) / glassLumas.length : 1;
    const specular = specularSetting === true ? (fg < backdropLuma ? 'inside' : 'outside') : specularSetting;
    if (effects && specular && glassEls.length) {
      const k = 7;
      const dx = n(-toLight.x * k);
      const dy = n(-toLight.y * k);
      const individual = resolveProp<string>(g.props.lighting, ctx, 'combined') === 'individual';
      const fid = defs.id('sp');
      if (specular === 'outside') {
        // highlight band just outside the shape, on the side facing the light
        defs.add(
          `<filter id="${fid}" ${groupRegion}>` +
            `<feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>` +
            `<feComposite in="d" in2="SourceAlpha" operator="out" result="band"/>` +
            `<feOffset in="SourceAlpha" dx="${n(-dx * 1.6)}" dy="${n(-dy * 1.6)}" result="lit"/>` +
            `<feComposite in="band" in2="lit" operator="in" result="edge"/>` +
            `<feGaussianBlur in="edge" stdDeviation="1.6" result="soft"/>` +
            `<feFlood flood-color="#fff" flood-opacity="0.8"/><feComposite in2="soft" operator="in"/></filter>`,
        );
      } else defs.add(
        `<filter id="${fid}" ${groupRegion}>` +
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
    return groupOpacity < 1 ? `<g opacity="${n(groupOpacity)}">${out.join('')}</g>` : out.join('');
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
      `<mask id="${mid}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${-PAD}" y="${-PAD}" width="${C + 2 * PAD}" height="${C + 2 * PAD}">` +
        contentIds.map((id) => `<use href="#${id}"/>`).join('') +
        `</mask>`,
    );
    top = `<use href="#${bgStackId}"/><g filter="url(#${fid})"><use href="#${stackId}" mask="url(#${mid})"/></g>`;
  }

  // ------------------------------------------------------------ mask + rim
  const clipId = defs.id('clip');
  const shape = maskPath(mask, P);
  defs.add(`<clipPath id="${clipId}"><path d="${shape}"/></clipPath>`);
  // inset is measured in the output (1024 pt) image: inset 100 → an 824 pt body. In viewBox units that is
  // inset × C / (C − 2 × inset), because the viewBox grows by the margin on both sides.
  const inset = Math.min(C / 2 - 1, Math.max(0, num(opts.inset, 0)));
  const M = inset > 0 ? (inset * C) / (C - 2 * inset) : 0;
  if (M > 0) {
    // classic macOS template: the body casts a soft shadow onto the transparent margin
    const sid = defs.id('ish');
    defs.add(
      `<filter id="${sid}" filterUnits="userSpaceOnUse" x="${-(M + 64)}" y="${-(M + 64)}" width="${C + 2 * (M + 64)}" height="${C + 2 * (M + 64)}"><feGaussianBlur in="SourceAlpha" stdDeviation="${n(C * 0.012)}"/>` +
        `<feOffset dy="${n(C * 0.012)}" result="b"/><feFlood flood-color="#000" flood-opacity="0.3"/><feComposite in2="b" operator="in" result="s"/>` +
        `<feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    );
    body.push(`<g filter="url(#${sid})"><g clip-path="url(#${clipId})">${top}</g></g>`);
  } else body.push(`<g clip-path="url(#${clipId})">${top}</g>`);
  if (effects && opts.rim !== false && mask !== 'none') {
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
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="${-(P + M)} ${-(P + M)} ${C + 2 * (P + M)} ${C + 2 * (P + M)}">` +
    `<title>${esc(appearance)}</title><defs>${defs.toString()}</defs>${body.join('')}</svg>`
  );
}

const KNOWN_BLEND = new Set<string>(BLEND_MODES);

/** CSS mix-blend-mode for an icon.json blend mode; unknown values (unvalidated files) are ignored. */
function cssBlend(mode: unknown): string | null {
  if (typeof mode !== 'string' || !KNOWN_BLEND.has(mode) || mode === 'normal') return null;
  if (mode === 'plus-lighter') return 'screen';
  if (mode === 'plus-darker') return 'multiply';
  return mode;
}
