import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Grid3x3, ImagePlus, LayoutGrid, Plus, Sparkles, SlidersHorizontal } from 'lucide-react';
import { CANVAS, resolveProp, squarePlatforms, type Position } from '@fresnel/core';
import { renderSvg } from '@fresnel/render';
import { beginGesture, endGesture, useDoc } from '../store/doc';
import { currentAppearance, currentAppearanceKey, tintHex, useUI, type BackgroundImage, type Platform } from '../store/ui';
import { t, useLang } from '../i18n';
import { useIconUrl } from '../lib/useIconUrl';
import { renderOptsFrom } from '../lib/renderOpts';
import { svgToPngBytes } from '../lib/raster';
import { hitTest, layout, type NodeBox } from '../lib/geometry';
import { importLayers, openIcon, openSample } from '../actions';
import { Button, Segmented, Slider, Toggle, cx } from './controls';
import { editIdiom } from '../lib/idiom';

export const WALLPAPERS: Record<Exclude<BackgroundImage, 'none' | 'custom'>, string> = {
  gradient: 'linear-gradient(135deg,#5B8CFF 0%,#9B6BFF 50%,#FF7AB6 100%)',
  sunset: 'linear-gradient(160deg,#FFB86B 0%,#FF6B6B 45%,#6B4BCC 100%)',
  ocean: 'linear-gradient(160deg,#7FE3D9 0%,#2E8BC0 55%,#0B3C5D 100%)',
  night: 'radial-gradient(120% 90% at 30% 20%,#3A3F73 0%,#141633 55%,#05060F 100%)',
};

export function stageBackground(s: { bgUseImage: boolean; bgImage: BackgroundImage; bgCustomUrl: string | null; bgColor: string }): string {
  if (!s.bgUseImage || s.bgImage === 'none') return s.bgColor;
  if (s.bgImage === 'custom') return s.bgCustomUrl ? `center / cover no-repeat url("${s.bgCustomUrl}")` : s.bgColor;
  return WALLPAPERS[s.bgImage];
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const SIZES = [1024, 512, 256, 128, 64, 32, 16];
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/** Canvas toolbar: simulated device background, grid, preview size, zoom and effects. */
function CanvasTopBar() {
  useLang();
  const ui = useUI();
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-sep bg-canvas px-3 text-xs">
      <label className="relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] border border-hairline" style={{ background: ui.bgColor }} title={t('bgColor')}>
        <input type="color" aria-label={t('bgColor')} value={ui.bgColor} onChange={(e) => ui.set({ bgColor: e.target.value.toUpperCase(), bgUseImage: false })} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <select
        aria-label={t('bgImage')}
        title={t('bgImage')}
        value={ui.bgImage}
        onChange={(e) => {
          if (e.target.value === '__add') {
            fileInput.current?.click();
            return;
          }
          ui.set({ bgImage: e.target.value as BackgroundImage, bgUseImage: e.target.value !== 'none' });
        }}
        className="h-[22px] rounded-[5px] bg-control px-2 text-xs outline-none"
      >
        <option value="none">{t('none')}</option>
        <option value="gradient">Gradient</option>
        <option value="sunset">Sunset</option>
        <option value="ocean">Ocean</option>
        <option value="night">Night</option>
        {ui.bgCustomUrl && <option value="custom">{t('customImage')}</option>}
        <option disabled>──────</option>
        <option value="__add">{t('addBackground')}</option>
      </select>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (ui.bgCustomUrl) URL.revokeObjectURL(ui.bgCustomUrl);
          ui.set({ bgCustomUrl: URL.createObjectURL(f), bgImage: 'custom', bgUseImage: true });
          e.target.value = '';
        }}
      />
      <button
        type="button"
        aria-pressed={ui.bgUseImage}
        title={t('bgToggle')}
        aria-label={t('bgToggle')}
        onClick={() => ui.set({ bgUseImage: !ui.bgUseImage, bgImage: ui.bgImage === 'none' ? 'gradient' : ui.bgImage })}
        className={cx('flex h-[22px] w-7 items-center justify-center rounded-[5px]', ui.bgUseImage ? 'bg-selected text-accent' : 'bg-control text-t2')}
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-sep" />
      <select aria-label={t('grid')} value={ui.grid} onChange={(e) => ui.set({ grid: e.target.value as 'light' | 'dark', showGrid: true })} className="h-[22px] rounded-[5px] bg-control px-2 text-xs outline-none">
        <option value="light">{t('gridLight')}</option>
        <option value="dark">{t('gridDark')}</option>
      </select>
      <button
        type="button"
        aria-pressed={ui.showGrid}
        aria-label={t('grid')}
        title={t('grid')}
        onClick={() => ui.set({ showGrid: !ui.showGrid })}
        className={cx('flex h-[22px] w-7 items-center justify-center rounded-[5px]', ui.showGrid ? 'bg-selected text-accent' : 'bg-control text-t2')}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <select
          aria-label={t('previewSize')}
          title={t('previewSize')}
          value={String(ui.previewSize)}
          onChange={(e) => ui.set({ previewSize: e.target.value === 'fit' ? 'fit' : Number(e.target.value) })}
          className="h-[22px] rounded-[5px] bg-control px-2 font-mono text-xs outline-none"
        >
          <option value="fit">{t('fit')}</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s} px
            </option>
          ))}
        </select>
        <select
          aria-label={t('zoomLevel')}
          title={t('zoomLevel')}
          value={String(ui.zoom)}
          onChange={(e) => ui.set({ zoom: Number(e.target.value) })}
          className="h-[22px] rounded-[5px] bg-control px-2 font-mono text-xs outline-none"
        >
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <span className="mx-1 h-4 w-px bg-sep" />
        <span className="flex items-center gap-1.5 text-t2" title={t('effectsHint')}>
          <Sparkles className="h-3.5 w-3.5" />
          {t('effects')}
          <Toggle label={t('effects')} checked={ui.effects} onChange={(v) => ui.set({ effects: v })} />
        </span>
        <span className="mx-1 h-4 w-px bg-sep" />
        <button
          type="button"
          aria-pressed={ui.mode === 'compare'}
          title={`${t('compare')} (⌘2)`}
          onClick={() => ui.set({ mode: ui.mode === 'compare' ? 'edit' : 'compare' })}
          className={cx('flex h-[22px] items-center gap-1.5 rounded-[5px] px-2', ui.mode === 'compare' ? 'bg-selected text-accent' : 'bg-control text-t2')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {t('compare')}
        </button>
      </div>
    </div>
  );
}

/** Mono options: light / dark, tinted, tint color. */
function MonoOptions() {
  useLang();
  const ui = useUI();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ui.monoOptionsOpen) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && ui.set({ monoOptionsOpen: false });
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [ui.monoOptionsOpen, ui]);
  if (!ui.monoOptionsOpen) return null;
  return (
    <div ref={ref} role="dialog" aria-label={t('monoOptions')} className="absolute right-0 bottom-10 z-40 w-64 rounded-[10px] border border-hairline bg-elevated p-3 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <Segmented
        label={t('monoOptions')}
        value={ui.monoDark ? 'dark' : 'light'}
        onChange={(v) => ui.set({ monoDark: v === 'dark' })}
        options={[
          { value: 'light', label: t('wpLight') },
          { value: 'dark', label: t('dark') },
        ]}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-t2">{t('tinted')}</span>
        <Toggle label={t('tinted')} checked={ui.monoTinted} onChange={(v) => ui.set({ monoTinted: v })} />
      </div>
      <div className={cx('mt-3 flex flex-col gap-2', !ui.monoTinted && 'pointer-events-none opacity-40')}>
        <div className="flex items-center gap-2">
          <span className="w-14 text-t2">{t('hue')}</span>
          <input
            type="range"
            aria-label={t('hue')}
            min={0}
            max={360}
            value={ui.tintHue}
            onChange={(e) => ui.set({ tintHue: Number(e.target.value) })}
            className="h-2 flex-1 appearance-none rounded-full"
            style={{ background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-t2">{t('intensity')}</span>
          <Slider label={t('intensity')} value={ui.tintIntensity} onChange={(v) => ui.set({ tintIntensity: v })} />
        </div>
        <div className="flex items-center gap-2 text-t3">
          <span className="h-3 w-3 rounded-full border border-hairline" style={{ background: tintHex(ui) }} />
          <span className="font-mono">{tintHex(ui)}</span>
        </div>
      </div>
    </div>
  );
}

function CanvasBottomBar() {
  useLang();
  const ui = useUI();
  const doc = useDoc((s) => s.doc);
  const plat = resolveProp<{ squares?: unknown; circles?: string[] }>(doc.props['supported-platforms'], { appearance: 'default' }, { squares: 'shared' });
  const squares = squarePlatforms(plat.squares);
  const shared = squares === 'shared';
  // shared squares are one platform in Icon Composer ("iOS, macOS"); it previews as iOS
  const platforms: Platform[] = [
    ...(shared || squares.includes('iOS') ? (['iOS'] as Platform[]) : []),
    ...(!shared && squares.includes('macOS') ? (['macOS'] as Platform[]) : []),
    ...((plat.circles ?? []).includes('watchOS') ? (['watchOS'] as Platform[]) : []),
  ];
  useEffect(() => {
    if (platforms.length && !platforms.includes(ui.platform)) ui.set({ platform: platforms[0]! });
  }, [platforms.join(), ui.platform]); // eslint-disable-line react-hooks/exhaustive-deps
  const watch = ui.platform === 'watchOS';
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t border-sep bg-canvas px-3">
      <Segmented<Platform>
        label={t('platform')}
        className="min-w-[200px]"
        value={ui.platform}
        onChange={(p) => ui.set({ platform: p })}
        options={(platforms.length ? platforms : (['iOS'] as Platform[])).map((p) => ({ value: p, label: shared && p === 'iOS' ? 'iOS, macOS' : p }))}
      />
      <span className="flex items-center gap-1.5 text-[11px] text-t3" title={t('approxLong')}>
        <span className="h-1.5 w-1.5 rounded-full bg-t3" />
        {t('approx')}
      </span>
      <div className={cx('relative flex items-center gap-2', watch && 'pointer-events-none opacity-40')} title={watch ? t('watchNoAppearances') : undefined}>
        <Segmented
          label={t('appearance')}
          className="min-w-[200px]"
          value={ui.appearanceMode}
          onChange={(m) => ui.set({ appearanceMode: m })}
          options={[
            { value: 'default', label: 'Default', title: '⌥1' },
            { value: 'dark', label: 'Dark', title: '⌥2' },
            { value: 'mono', label: 'Mono', title: '⌥3' },
          ]}
        />
        <button
          type="button"
          aria-label={t('monoOptions')}
          title={t('monoOptions')}
          disabled={ui.appearanceMode !== 'mono'}
          onClick={() => ui.set({ monoOptionsOpen: !ui.monoOptionsOpen })}
          className="flex h-6 items-center gap-1 rounded-md bg-control px-2 text-xs text-t2 hover:text-t1 disabled:opacity-30"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('options')}
        </button>
        <MonoOptions />
      </div>
    </div>
  );
}

function GridOverlay({ x, y, size, color, circle }: { x: number; y: number; size: number; color: string; circle: boolean }) {
  // Apple app icon template grid: outer square, center lines, diagonals and concentric circles
  const c = size / 2;
  return (
    <svg className="pointer-events-none absolute" style={{ left: x, top: y, width: size, height: size }} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g fill="none" stroke={color} strokeWidth="1" opacity="0.7">
        {!circle && <rect x={0.5} y={0.5} width={size - 1} height={size - 1} />}
        <line x1={c} y1={0} x2={c} y2={size} />
        <line x1={0} y1={c} x2={size} y2={c} />
        <line x1={0} y1={0} x2={size} y2={size} />
        <line x1={size} y1={0} x2={0} y2={size} />
        <circle cx={c} cy={c} r={size * 0.5} />
        <circle cx={c} cy={c} r={size * 0.3125} />
        <circle cx={c} cy={c} r={size * 0.1875} />
        <rect x={size * 0.1875} y={size * 0.1875} width={size * 0.625} height={size * 0.625} />
        <rect x={size * 0.0859} y={size * 0.0859} width={size * 0.8281} height={size * 0.8281} />
      </g>
    </svg>
  );
}

/** Small preview sizes are rasterized at their real pixel size and shown magnified. */
function usePixelUrl(svgSize: number | null, svg: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svgSize || !svg) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    svgToPngBytes(svg, svgSize)
      .then((png) => {
        if (!alive) return;
        made = URL.createObjectURL(new Blob([png as unknown as ArrayBuffer], { type: 'image/png' }));
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [svgSize, svg]);
  return url;
}

function Stage() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const ui = useUI();
  const opts = renderOptsFrom(ui);
  const [ref, box] = useSize<HTMLDivElement>();
  const fit = Math.max(96, Math.min(760, Math.min(box.w - 120, box.h - 80)));
  const fixed = ui.previewSize === 'fit' ? null : ui.previewSize;
  const size = Math.round((fixed ?? fit) * ui.zoom);
  const vectorUrl = useIconUrl(doc, { ...opts, size: Math.max(16, size) });
  const svgForPixels = useMemo(() => (fixed && fixed <= 256 ? renderSvg(doc, { ...opts, size: fixed }) : null), [doc, fixed, JSON.stringify(opts)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pixelUrl = usePixelUrl(fixed && fixed <= 256 ? fixed : null, svgForPixels);
  const url = pixelUrl ?? vectorUrl;
  const empty = doc.groups.length === 0;
  const x0 = Math.round(box.w / 2 - size / 2);
  const y0 = Math.round(box.h / 2 - size / 2);
  // watchOS previews a 1088 pt canvas around the 1024 pt artwork (see the renderer)
  const pad = ui.platform === 'watchOS' ? 32 : 0;
  const k = size / (CANVAS + 2 * pad);
  const ax0 = x0 + pad * k;
  const ay0 = y0 + pad * k;
  const ctx = { appearance: currentAppearance(ui), idiom: ui.platform };
  const geo = useMemo(() => layout(doc, ctx), [doc, ctx.appearance, ctx.idiom]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = ui.selection;
  const selBox: NodeBox | undefined =
    sel.kind === 'layer' ? geo.layers.find((b) => b.id === sel.id) : sel.kind === 'group' ? geo.groups.find((b) => b.id === sel.id) : undefined;
  const drag = useRef<{ ref: { kind: 'group' | 'layer'; id: string }; startX: number; startY: number; orig: Position; moved: boolean } | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  const toPt = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ax0) / k, y: (e.clientY - r.top - ay0) / k };
  };

  const variantFor = () => (ui.sectionScope.composition === 'variant' ? { idiom: editIdiom(ui) } : undefined);

  const posOf = (r: { kind: 'group' | 'layer'; id: string }): Position => {
    const d = useDoc.getState().doc;
    const node = r.kind === 'group' ? d.groups.find((g) => g.id === r.id) : d.groups.flatMap((g) => g.layers).find((l) => l.id === r.id);
    return resolveProp<Position>(node?.props.position, ctx, { scale: 1, 'translation-in-points': [0, 0] }) ?? { scale: 1, 'translation-in-points': [0, 0] };
  };

  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0 || empty) return;
    const p = toPt(e);
    const hit = hitTest(geo.layers, p.x, p.y);
    if (!hit) {
      ui.select({ kind: 'document' });
      return;
    }
    // keep a selected group selected when clicking one of its layers (drag the whole group)
    const target: { kind: 'group' | 'layer'; id: string } = sel.kind === 'group' && sel.id === hit.groupId ? { kind: 'group', id: hit.groupId } : { kind: 'layer', id: hit.id };
    ui.select(target);
    drag.current = { ref: target, startX: p.x, startY: p.y, orig: posOf(target), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toPt(e);
    let dx = p.x - d.startX;
    let dy = p.y - d.startY;
    if (!d.moved && Math.hypot(dx, dy) * k < 3) return;
    if (!d.moved) {
      d.moved = true;
      beginGesture();
    }
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // a layer's offset is in its group's (possibly scaled) space
    if (d.ref.kind === 'layer') {
      const lb = geo.layers.find((x) => x.id === d.ref.id);
      const g = useDoc.getState().doc.groups.find((x) => x.id === lb?.groupId);
      const gs = resolveProp<Position | null>(g?.props.position, ctx, null)?.scale ?? 1;
      dx /= gs;
      dy /= gs;
    }
    let tx = d.orig['translation-in-points'][0] + dx;
    let ty = d.orig['translation-in-points'][1] + dy;
    // snap the selection's center to the canvas center lines
    const b = d.ref.kind === 'layer' ? geo.layers.find((x) => x.id === d.ref.id) : geo.groups.find((x) => x.id === d.ref.id);
    let v = false;
    let h = false;
    if (b) {
      const cx0 = b.x + b.w / 2 + (tx - posOf(d.ref)['translation-in-points'][0]);
      const cy0 = b.y + b.h / 2 + (ty - posOf(d.ref)['translation-in-points'][1]);
      const snap = 6 / k;
      if (Math.abs(cx0 - CANVAS / 2) < snap) {
        tx += CANVAS / 2 - cx0;
        v = true;
      }
      if (Math.abs(cy0 - CANVAS / 2) < snap) {
        ty += CANVAS / 2 - cy0;
        h = true;
      }
    }
    setGuides({ v, h });
    const np: Position = { ...d.orig, 'translation-in-points': [Math.round(tx * 10) / 10, Math.round(ty * 10) / 10] };
    useDoc.getState().setProp(d.ref, 'position', np, variantFor());
  };

  const onUp = () => {
    if (drag.current?.moved) endGesture();
    drag.current = null;
    setGuides({ v: false, h: false });
  };

  return (
    <div
      ref={ref}
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ background: stageBackground(ui) }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-testid="stage"
    >
      {empty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex h-40 w-40 items-center justify-center rounded-[36px] border-2 border-dashed border-hairline">
            <Plus className="h-8 w-8 text-t3" />
          </div>
          <div>
            <p className="text-[15px] font-semibold">{t('dropHere')}</p>
            <p className="mt-1 text-xs text-t2">{t('dropHint')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={importLayers}>
              {t('addLayer')}
            </Button>
            <Button onClick={openIcon}>{t('openIcon')}</Button>
            <Button variant="ghost" onClick={openSample}>
              {t('trySample')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {url && (
            <img
              src={url}
              alt={`${ui.platform} ${currentAppearance(ui)} preview`}
              draggable={false}
              className={cx('pointer-events-none absolute select-none', pixelUrl ? '[image-rendering:pixelated]' : 'drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)]')}
              style={{ left: x0, top: y0, width: size, height: size }}
            />
          )}
          {ui.showGrid && <GridOverlay x={x0} y={y0} size={size} color={ui.grid === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'} circle={ui.platform === 'watchOS'} />}
          {selBox && (
            <div
              className="pointer-events-none absolute rounded-[2px] border border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
              style={{ left: ax0 + selBox.x * k, top: ay0 + selBox.y * k, width: selBox.w * k, height: selBox.h * k }}
              data-testid="selection-box"
            >
              {[
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ].map(([a, b2]) => (
                <span key={`${a}${b2}`} className="absolute h-1.5 w-1.5 rounded-[1px] border border-accent bg-white" style={{ left: `calc(${a! * 100}% - 3px)`, top: `calc(${b2! * 100}% - 3px)` }} />
              ))}
            </div>
          )}
          {guides.v && <div className="pointer-events-none absolute w-px bg-[#FF3BC4]" style={{ left: x0 + size / 2, top: y0 - 20, height: size + 40 }} />}
          {guides.h && <div className="pointer-events-none absolute h-px bg-[#FF3BC4]" style={{ top: y0 + size / 2, left: x0 - 20, width: size + 40 }} />}
          <span aria-live="polite" className="sr-only">
            {ui.platform} {currentAppearance(ui)} {currentAppearanceKey(ui) ?? ''}
          </span>
        </>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas" aria-label="Canvas">
      <CanvasTopBar />
      <Stage />
      <CanvasBottomBar />
    </div>
  );
}

export { CanvasTopBar, CanvasBottomBar };
