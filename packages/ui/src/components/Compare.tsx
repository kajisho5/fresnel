import { useMemo } from 'react';
import { APPEARANCES, APPEARANCE_LABEL, isDarkAppearance, validate, type Appearance } from '@fresnel/core';
import { useDoc } from '../store/doc';
import { useUI, type Wallpaper } from '../store/ui';
import { t, useLang } from '../i18n';
import { useIconUrl } from '../lib/useIconUrl';
import { Segmented, cx } from './controls';

const ORDER: Appearance[] = ['default', 'dark', 'clear-light', 'clear-dark', 'tinted-light', 'tinted-dark'];
const ALL_SIZES = [1024, 128, 64, 32, 16];

function wallpaperCss(w: Wallpaper, dark: boolean) {
  if (w === 'photo') return 'linear-gradient(135deg,#F7B267 0%,#F25F5C 35%,#7E57C2 70%,#247BA0 100%)';
  const d = w === 'dark' || (w === 'auto' && dark);
  return d ? 'linear-gradient(135deg,#1B2033,#0B0C10)' : 'linear-gradient(135deg,#DCE6F5,#F3E9E1)';
}

function Tile({ appearance, warn }: { appearance: Appearance; warn: boolean }) {
  const doc = useDoc((s) => s.doc);
  const { mask, lightAngle, tint, wallpaper, compareSizes } = useUI();
  const url = useIconUrl(doc, { appearance, mask, lightAngle, tint, size: 300 });
  const dark = wallpaper === 'dark' || (wallpaper === 'auto' && isDarkAppearance(appearance)) || wallpaper === 'photo';
  const sizes = ALL_SIZES.filter((s) => compareSizes.includes(s));
  return (
    <div className="relative flex min-h-0 flex-col rounded-xl border border-hairline p-4" style={{ background: wallpaperCss(wallpaper, isDarkAppearance(appearance)) }}>
      <div className="flex items-center justify-between">
        <span className={cx('text-[13px] font-semibold', dark ? 'text-[#F2F2F5]' : 'text-[#1C1C1E]')}>{APPEARANCE_LABEL[appearance]}</span>
        <div className="flex items-center gap-3">
          {warn && (
            <span className="flex items-center gap-1 rounded-full bg-[rgba(255,176,32,0.18)] px-2.5 py-0.5 text-[10px] font-semibold text-[#B07800]" title={t('notCustomized')}>
              ▲ {t('notCustomized')}
            </span>
          )}
          <span className={cx('font-mono text-[11px]', dark ? 'text-white/60' : 'text-black/50')}>⌥{APPEARANCES.indexOf(appearance) + 1}</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-10 px-4 pt-3 pb-1">
        {url &&
          sizes.map((s) => {
            const px = s === 1024 ? 150 : s;
            return (
              <figure key={s} className="m-0 flex flex-col items-center gap-2">
                <img src={url} alt={`${APPEARANCE_LABEL[appearance]} ${s}`} width={px} height={px} draggable={false} className={px >= 64 ? 'drop-shadow-[0_8px_14px_rgba(0,0,0,0.3)]' : ''} />
                <figcaption className={cx('font-mono text-[10px]', dark ? 'text-white/60' : 'text-black/55')}>{s === 1024 ? '1024 (fit)' : s}</figcaption>
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
  const { wallpaper, tint, compareSizes, set } = useUI();
  const issues = useMemo(() => validate(doc), [doc]);
  const darkMissing = issues.some((i) => i.id === 'V-08' && i.message.startsWith('Dark'));
  const tintedMissing = issues.some((i) => i.id === 'V-08' && i.message.startsWith('Tinted'));
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <span className="text-xs text-t2">{t('wallpaper')}</span>
        <Segmented
          size="sm"
          className="w-60"
          label={t('wallpaper')}
          value={wallpaper}
          onChange={(w) => set({ wallpaper: w })}
          options={[
            { value: 'auto', label: t('auto') },
            { value: 'light', label: t('wpLight') },
            { value: 'dark', label: t('dark') },
            { value: 'photo', label: t('photo') },
          ]}
        />
        <span className="ml-6 text-xs text-t2">{t('tint')}</span>
        <label className="relative h-4 w-4 overflow-hidden rounded-full border border-white/30" style={{ background: tint }}>
          <input type="color" aria-label={t('tint')} value={tint} onChange={(e) => set({ tint: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        <span className="font-mono text-[11px] text-t2">{tint}</span>
        <span className="ml-6 text-xs text-t2">{t('sizes')}</span>
        <div className="flex gap-1.5">
          {ALL_SIZES.map((s) => {
            const on = compareSizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => set({ compareSizes: on ? compareSizes.filter((x) => x !== s) : [...compareSizes, s] })}
                className={cx('h-[22px] rounded-full px-2.5 font-mono text-[11px] font-medium', on ? 'bg-selected text-accent-hover' : 'bg-control text-t2')}
              >
                {s}
              </button>
            );
          })}
        </div>
        <span className="ml-auto truncate text-[11px] text-t3">{t('approxLong')}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-4 px-6 pb-5">
        {ORDER.map((a) => (
          <Tile key={a} appearance={a} warn={(a.startsWith('tinted') && tintedMissing) || (a === 'dark' && darkMissing)} />
        ))}
      </div>
    </div>
  );
}
