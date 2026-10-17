import { useMemo } from 'react';
import { validate, isDarkAppearance, type Appearance } from '@fresnel/core';
import { useDoc } from '../store/doc';
import { tintHex, useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { useIconUrl } from '../lib/useIconUrl';
import { renderOptsFrom } from '../lib/renderOpts';
import { CanvasTopBar, stageBackground } from './Canvas';
import { cx } from './controls';

/** Each tile is one platform/appearance combination from Icon Composer's canvas controls. */
const TILES: { appearance: Appearance; label: string }[] = [
  { appearance: 'default', label: 'Default' },
  { appearance: 'dark', label: 'Dark' },
  { appearance: 'clear-light', label: 'Mono · Clear light' },
  { appearance: 'clear-dark', label: 'Mono · Clear dark' },
  { appearance: 'tinted-light', label: 'Mono · Tinted light' },
  { appearance: 'tinted-dark', label: 'Mono · Tinted dark' },
];
const ALL_SIZES = [1024, 128, 64, 32, 16];

function Tile({ appearance, label, warn }: { appearance: Appearance; label: string; warn: boolean }) {
  const doc = useDoc((s) => s.doc);
  const ui = useUI();
  const url = useIconUrl(doc, { ...renderOptsFrom(ui), appearance, size: 300 });
  const darkTile = isDarkAppearance(appearance);
  const bg = ui.bgUseImage ? stageBackground(ui) : darkTile ? 'linear-gradient(135deg,#1B2033,#0B0C10)' : 'linear-gradient(135deg,#DCE6F5,#F3E9E1)';
  const darkText = !ui.bgUseImage && !darkTile;
  const sizes = ALL_SIZES.filter((s) => ui.compareSizes.includes(s));
  return (
    <div className="relative flex min-h-0 flex-col rounded-xl border border-hairline p-4" style={{ background: bg }}>
      <div className="flex items-center justify-between">
        <span className={cx('text-[13px] font-semibold', darkText ? 'text-[#1C1C1E]' : 'text-[#F2F2F5] drop-shadow')}>{label}</span>
        {warn && (
          <span className="rounded-full bg-[rgba(255,176,32,0.2)] px-2.5 py-0.5 text-[10px] font-semibold text-[#B07800]" title={t('notCustomized')}>
            ▲ {t('notCustomized')}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-10 px-4 pt-3 pb-1">
        {url &&
          sizes.map((s) => {
            const px = s === 1024 ? 150 : s;
            return (
              <figure key={s} className="m-0 flex flex-col items-center gap-2">
                <img src={url} alt={`${label} ${s}`} width={px} height={px} draggable={false} className={px >= 64 ? 'drop-shadow-[0_8px_14px_rgba(0,0,0,0.3)]' : ''} />
                <figcaption className={cx('font-mono text-[10px]', darkText ? 'text-black/55' : 'text-white/70')}>{s === 1024 ? '1024 (fit)' : s}</figcaption>
              </figure>
            );
          })}
      </div>
    </div>
  );
}

export function Compare() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const ui = useUI();
  const issues = useMemo(() => validate(doc), [doc]);
  const darkMissing = issues.some((i) => i.id === 'V-08' && i.message.startsWith('Dark'));
  const tintedMissing = issues.some((i) => i.id === 'V-08' && i.message.startsWith('Tinted'));
  const tiles = ui.platform === 'watchOS' ? TILES.slice(0, 1) : TILES;
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <CanvasTopBar />
      <div className="flex h-11 shrink-0 items-center gap-3 px-6 text-xs">
        <span className="text-t2">{t('platform')}</span>
        <span className="font-medium">{ui.platform}</span>
        <span className="ml-6 text-t2">{t('tint')}</span>
        <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: tintHex(ui) }} />
        <span className="ml-6 text-t2">{t('sizes')}</span>
        <div className="flex gap-1.5">
          {ALL_SIZES.map((s) => {
            const on = ui.compareSizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => ui.set({ compareSizes: on ? ui.compareSizes.filter((x) => x !== s) : [...ui.compareSizes, s] })}
                className={cx('h-[22px] rounded-full px-2.5 font-mono text-[11px] font-medium', on ? 'bg-selected text-accent-hover' : 'bg-control text-t2')}
              >
                {s}
              </button>
            );
          })}
        </div>
        <span className="ml-auto truncate text-[11px] text-t3">{t('approxLong')}</span>
      </div>
      <div className={cx('grid min-h-0 flex-1 gap-4 px-6 pb-5', tiles.length > 1 ? 'grid-cols-2 grid-rows-3' : 'grid-cols-1')}>
        {tiles.map((tile) => (
          <Tile key={tile.appearance} {...tile} warn={(tile.appearance.startsWith('tinted') && tintedMissing) || (tile.appearance === 'dark' && darkMissing)} />
        ))}
      </div>
    </div>
  );
}
