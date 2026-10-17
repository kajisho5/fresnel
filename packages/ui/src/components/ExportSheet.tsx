import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  APPEARANCES,
  buildAppIconSet,
  buildIcns,
  buildPngSet,
  summarizeIssues,
  writeBundle,
  type Appearance,
} from '@fresnel/core';
import { renderSvg } from '@fresnel/render';
import { useDoc, type FileMap } from '../store/doc';
import { useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { getPlatform } from '../actions';
import { safeFileName } from '../platform';
import { browserRasterizer, svgUrl } from '../lib/raster';
import { renderOptsFrom } from '../lib/renderOpts';
import { IssueIcon, useActool, useIssues } from './StatusBar';
import { Button, Select, cx } from './controls';

type Format = 'icon' | 'icns' | 'appiconset' | 'png' | 'car';
const PNG_SIZES = [1024, 512, 256, 128, 64, 32, 16];

function Check({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 accent-[var(--accent)] disabled:opacity-40"
    />
  );
}

export function ExportSheet() {
  useLang();
  const { doc, extra, name: docName } = useDoc();
  const ui = useUI();
  const { set } = ui;
  const ropts = renderOptsFrom(ui);
  const issues = useIssues();
  const actool = useActool();
  const [formats, setFormats] = useState<Record<Format, boolean>>({ icon: true, icns: true, appiconset: false, png: true, car: false });
  const [pngScope, setPngScope] = useState<'all' | 'default'>('all');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const plat = getPlatform();

  useEffect(() => {
    const u = svgUrl(renderSvg(doc, { ...ropts, appearance: 'default', size: 80 }));
    setThumb(u);
    return () => URL.revokeObjectURL(u);
  }, [doc, ropts.tint, ropts.idiom]); // eslint-disable-line react-hooks/exhaustive-deps

  // HIG A4 sheets: Esc cancels, ⏎ runs the primary button, focus stays inside and returns on close
  const dialogRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
        (el) => !(el as HTMLButtonElement).disabled,
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') set({ exportOpen: false });
      else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, select, textarea')) {
        e.preventDefault();
        runRef.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1;
        e.preventDefault();
        f[next]!.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [set]);

  const sum = summarizeIssues(issues);
  const problems = issues.filter((i) => i.severity !== 'info');
  const passed = 10 - new Set(problems.map((i) => i.id)).size;
  const layerCount = doc.groups.reduce((a, g) => a + g.layers.length, 0);
  const any = Object.entries(formats).some(([k, v]) => v && k !== 'car');

  const run = async () => {
    setBusy(true);
    try {
      const raster = browserRasterizer(doc, { tint: ropts.tint!, effects: ropts.effects !== false });
      const files: FileMap = {};
      const name = safeFileName(docName);
      const put = (prefix: string, m: FileMap) => Object.entries(m).forEach(([k, v]) => (files[`${prefix}${k}`] = v));
      const wantCar = formats.car && actool && !!plat.compileCar;
      if (formats.icon || wantCar) put(`${name}.icon/`, writeBundle(doc, extra));
      if (formats.icns) files[`${name}.icns`] = await buildIcns(raster);
      if (formats.appiconset) put('AppIcon.appiconset/', await buildAppIconSet(raster));
      if (formats.png) put(`${name}-png/`, await buildPngSet(raster, pngScope === 'all' ? [...APPEARANCES] : (['default'] as Appearance[]), PNG_SIZES));
      const where = await plat.writeExport(files, name);
      if (where && wantCar) await plat.compileCar!(`${where}/${name}.icon`, where);
      if (where) {
        useUI.getState().toast('success', `${t('exported')}: ${where}`);
        set({ exportOpen: false });
      }
    } catch (e) {
      useUI.getState().toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  runRef.current = () => {
    if (!busy && any) void run();
  };


  const formatRows: { k: Format; title: string; desc: string; disabled?: boolean; extra?: React.ReactNode }[] = [
    { k: 'icon', title: t('iconBundle'), desc: t('iconBundleDesc') },
    { k: 'icns', title: t('icns'), desc: t('icnsDesc') },
    { k: 'appiconset', title: t('appiconset'), desc: t('appiconsetDesc') },
    {
      k: 'png',
      title: t('pngSet'),
      desc: t('pngSetDesc'),
      extra: (
        <Select
          className="!w-36 !flex-none"
          label={t('pngSet')}
          value={pngScope}
          onChange={setPngScope}
          options={[
            { value: 'all', label: t('allAppearances') },
            { value: 'default', label: t('defaultOnly') },
          ]}
        />
      ),
    },
    { k: 'car', title: t('assetsCar'), desc: t('assetsCarDesc'), disabled: !actool },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && set({ exportOpen: false })}>
      <div ref={dialogRef} role="dialog" aria-modal aria-labelledby="export-title" className="fr-sheet mt-[52px] flex h-fit max-h-[calc(100vh-80px)] w-[600px] flex-col overflow-hidden rounded-[14px] border border-hairline bg-elevated shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
        <div className="flex-1 overflow-y-auto px-7 pt-5 pb-4">
          <div className="flex items-center gap-3.5">
            {thumb && <img src={thumb} alt="" className="h-10 w-10" />}
            <div>
              <h2 id="export-title" className="m-0 text-xl leading-[26px] font-semibold">
                {t('exportTitle')} “{docName}”
              </h2>
              <p className="m-0 text-xs text-t2">
                {t('exportSummary', { layers: layerCount, groups: doc.groups.length })}
              </p>
            </div>
          </div>

          <h3 className="mt-6 mb-2 text-[11px] font-semibold tracking-[0.6px] text-t3">{t('formats')}</h3>
          <div className="flex flex-col gap-2">
            {formatRows.map((f) => (
              <label key={f.k} className={cx('flex h-12 items-center gap-3 rounded-lg border border-hairline px-3.5', f.disabled ? 'opacity-50' : 'bg-white/[0.03]')}>
                <Check label={f.title} checked={!f.disabled && formats[f.k]} disabled={!!f.disabled} onChange={(v) => setFormats({ ...formats, [f.k]: v })} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{f.title}</span>
                  <span className="block truncate text-[11px] text-t2">{f.desc}</span>
                </span>
                {f.disabled ? <span className="text-[11px] text-t3">{t('unavailable')}</span> : f.extra}
              </label>
            ))}
          </div>

          <h3 className="mt-5 mb-2 text-[11px] font-semibold tracking-[0.6px] text-t3">{t('validation')}</h3>
          <div className="rounded-lg border border-hairline bg-white/[0.03] px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-ok" />
              <span>
                {passed} {t('checksPassed')}
              </span>
              {issues.length > 0 && (
                <button type="button" onClick={() => setShowAll(!showAll)} className="ml-auto text-accent-hover">
                  {t('showAll')}
                </button>
              )}
            </div>
            {(showAll ? issues : problems.slice(0, 3)).map((i, k) => (
              <div key={k} className="mt-2.5 flex gap-2 border-t border-sep pt-2.5">
                <IssueIcon s={i.severity} className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">{i.message.split('. ')[0]}.</div>
                  <div className="text-[11px] text-t2">
                    {i.id} · {i.target}
                  </div>
                </div>
              </div>
            ))}
            {sum.errors > 0 && <p className="mt-2 text-err">{t('fixErrorsFirst')}</p>}
          </div>

          <h3 className="mt-5 mb-2 text-[11px] font-semibold tracking-[0.6px] text-t3">{t('saveTo')}</h3>
          <p className="m-0 font-mono text-xs text-t2">{plat.kind === 'web' ? `${safeFileName(docName)}-export.zip — ${t('downloadZip')}` : t('chooseFolder')}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-sep px-7 py-3">
          <Button onClick={() => set({ exportOpen: false })}>{t('cancel')}</Button>
          <Button variant="primary" onClick={run} disabled={busy || !any}>
            {busy ? t('exporting') : t('exportBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
