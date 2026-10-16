import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { APPEARANCES, APPEARANCE_LABEL } from '@fresnel/core';
import { useDoc } from '../store/doc';
import { useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { useIconUrl } from '../lib/useIconUrl';
import { importLayers, openIcon, openSample } from '../actions';
import { Button, Segmented, Toggle, cx } from './controls';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const ZOOMS = [0.125, 0.25, 0.5, 0.75, 1];

export function Canvas() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const { appearance, mask, lightAngle, tint, showGrid, zoom, set } = useUI();
  const [ref, box] = useSize<HTMLDivElement>();
  const fit = Math.max(120, Math.min(720, Math.min(box.w - 200, box.h - 260)));
  const size = zoom === 'fit' ? fit : 1024 * zoom;
  const url = useIconUrl(doc, { appearance, mask, lightAngle, tint, size: Math.round(size) });
  const empty = doc.groups.length === 0;
  const cx0 = box.w / 2;
  const cy0 = box.h / 2 - 18;
  const R = (size / 2) * 1.414 + 24;
  const a = (lightAngle * Math.PI) / 180;
  const hx = cx0 + R * Math.sin(a);
  const hy = cy0 - R * Math.cos(a);
  const dragging = useRef(false);

  const onHandle = (e: RPointerEvent) => {
    if (!dragging.current) return;
    const r = ref.current!.getBoundingClientRect();
    let deg = (Math.atan2(e.clientX - r.left - cx0, -(e.clientY - r.top - cy0)) * 180) / Math.PI;
    if (e.altKey) deg = Math.round(deg / 15) * 15;
    set({ lightAngle: Math.round(deg) });
  };

  const zoomStep = (dir: 1 | -1) => {
    const cur = zoom === 'fit' ? fit / 1024 : zoom;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 1e-3) : [...ZOOMS].reverse().find((z) => z < cur - 1e-3);
    set({ zoom: next ?? (dir > 0 ? 1 : 0.125) });
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1 overflow-hidden bg-canvas" aria-label="Canvas">
      <div className="absolute top-3 left-4 text-[11px] text-t3">iOS · iPadOS · macOS</div>
      <div className="absolute top-2.5 right-4 flex items-center gap-2">
        <Toggle checked={showGrid} onChange={(v) => set({ showGrid: v })} label={t('grid')} />
        <span className="text-[11px] text-t2">{t('grid')}</span>
      </div>

      {empty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
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
          {showGrid && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <g fill="none" stroke="var(--hairline)" strokeWidth="1">
                <rect x={cx0 - size / 2} y={cy0 - size / 2} width={size} height={size} />
                <circle cx={cx0} cy={cy0} r={size * 0.5} />
                <circle cx={cx0} cy={cy0} r={size * 0.31} />
                <circle cx={cx0} cy={cy0} r={size * 0.18} />
                <line x1={cx0 - size / 2} y1={cy0 - size / 2} x2={cx0 + size / 2} y2={cy0 + size / 2} />
                <line x1={cx0 + size / 2} y1={cy0 - size / 2} x2={cx0 - size / 2} y2={cy0 + size / 2} />
                <line x1={cx0} y1={cy0 - size / 2 - 30} x2={cx0} y2={cy0 + size / 2 + 30} />
                <line x1={cx0 - size / 2 - 30} y1={cy0} x2={cx0 + size / 2 + 30} y2={cy0} />
              </g>
            </svg>
          )}
          {url && (
            <img
              src={url}
              alt={`${APPEARANCE_LABEL[appearance]} preview`}
              draggable={false}
              className="pointer-events-none absolute drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)]"
              style={{ left: cx0 - size / 2, top: cy0 - size / 2, width: size, height: size }}
            />
          )}
          <span aria-live="polite" className="sr-only">
            {APPEARANCE_LABEL[appearance]}
          </span>
          {/* light handle */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <circle cx={cx0} cy={cy0} r={R} fill="none" stroke="var(--hairline)" strokeDasharray="2 6" />
            <line x1={cx0} y1={cy0} x2={hx} y2={hy} stroke="rgba(255,214,110,0.25)" strokeDasharray="3 5" />
          </svg>
          <button
            type="button"
            aria-label={`${t('light')} ${lightAngle}°`}
            title={`${t('light')} ${lightAngle}° (⌥: 15°)`}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={onHandle}
            onPointerUp={() => (dragging.current = false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') set({ lightAngle: lightAngle - (e.shiftKey ? 15 : 1) });
              if (e.key === 'ArrowRight') set({ lightAngle: lightAngle + (e.shiftKey ? 15 : 1) });
            }}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-hairline bg-elevated active:cursor-grabbing"
            style={{ left: hx, top: hy }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="3.5" fill="#FFD76E" />
              {Array.from({ length: 8 }, (_, i) => {
                const r = (i * Math.PI) / 4;
                return <line key={i} x1={12 + 6 * Math.cos(r)} y1={12 + 6 * Math.sin(r)} x2={12 + 9 * Math.cos(r)} y2={12 + 9 * Math.sin(r)} stroke="#FFD76E" strokeWidth="1.4" strokeLinecap="round" />;
              })}
            </svg>
          </button>
          <span className="pointer-events-none absolute -translate-y-1/2 font-mono text-[11px] text-t3" style={{ left: hx - 18, top: hy, transform: 'translate(-100%, -50%)' }}>
            {t('light')} {lightAngle}°
          </span>
        </>
      )}

      {/* appearance HUD */}
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="absolute bottom-[56px] left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full border border-hairline bg-hud p-1 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        {APPEARANCES.map((ap, i) => (
          <button
            key={ap}
            type="button"
            role="radio"
            aria-checked={appearance === ap}
            title={`⌥${i + 1}`}
            onClick={() => set({ appearance: ap })}
            className={cx('h-7 rounded-full px-3 text-xs whitespace-nowrap', appearance === ap ? 'bg-white/15 font-medium text-t1' : 'text-t2 hover:text-t1')}
          >
            {APPEARANCE_LABEL[ap]}
          </button>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-3">
        <Segmented
          size="sm"
          label="Mask"
          className="w-[140px]"
          value={mask}
          onChange={(m) => set({ mask: m })}
          options={[
            { value: 'squircle', label: t('squircle') },
            { value: 'circle', label: t('circle') },
          ]}
        />
        <span className="flex items-center gap-1.5 text-[11px] text-t3" title={t('approxLong')}>
          <span className="h-1.5 w-1.5 rounded-full bg-t3" />
          {t('approx')}
        </span>
      </div>

      <div className="absolute right-4 bottom-4 flex h-[22px] items-center rounded-[5px] bg-control text-t2">
        <button type="button" aria-label="Zoom out" onClick={() => zoomStep(-1)} className="flex h-full w-7 items-center justify-center hover:text-t1">
          <Minus className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => set({ zoom: 'fit' })} className="tabular px-1 font-mono text-[11px] text-t1">
          {zoom === 'fit' ? `${t('fit')} · ${Math.round((fit / 1024) * 100)}%` : `${Math.round(zoom * 100)}%`}
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomStep(1)} className="flex h-full w-7 items-center justify-center hover:text-t1">
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
