import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, PanelLeft, PanelRight } from 'lucide-react';
import { APPEARANCES, APPEARANCE_LABEL, type Appearance } from '@fresnel/core';
import { useDoc, undo, redo } from '../store/doc';
import { useUI } from '../store/ui';
import { getLang, setLang, t, useLang } from '../i18n';
import { importLayers, newIcon, openIcon, openSample, save } from '../actions';
import { Segmented, IconButton, cx } from './controls';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function AppearanceGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className={className}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </svg>
  );
}

function AppMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLang();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const item = (label: string, onClick: () => void, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center justify-between gap-6 rounded-[5px] px-2.5 py-1 text-left text-[13px] hover:bg-accent hover:text-white"
    >
      <span>{label}</span>
      {shortcut && <span className="text-xs text-t3">{shortcut}</span>}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <IconButton label={t('menu')} onClick={() => setOpen(!open)} active={open}>
        <Menu className="h-4 w-4" />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-8 left-0 z-50 w-60 rounded-[10px] border border-hairline bg-elevated p-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          {item(t('newIcon'), newIcon, `${mod}N`)}
          {item(t('open'), openIcon, `${mod}O`)}
          {item(t('trySample'), openSample)}
          <div className="my-1 h-px bg-sep" />
          {item(t('save'), () => save(), `${mod}S`)}
          {item(t('saveAs'), () => save(true), `⇧${mod}S`)}
          <div className="my-1 h-px bg-sep" />
          {item(t('addLayer'), importLayers, `⇧${mod}I`)}
          {item(t('undo'), undo, `${mod}Z`)}
          {item(t('redo'), redo, `⇧${mod}Z`)}
          <div className="my-1 h-px bg-sep" />
          {item(`${t('language')}: ${getLang() === 'ja' ? 'English' : '日本語'}`, () => setLang(getLang() === 'ja' ? 'en' : 'ja'))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  useLang();
  const name = useDoc((s) => s.name);
  const dirty = useDoc((s) => s.dirty);
  const rename = useDoc.setState;
  const { mode, appearance, set, sidebarOpen, inspectorOpen } = useUI();
  const [editing, setEditing] = useState(false);

  return (
    <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-sep bg-window px-3" data-tauri-drag-region>
      <AppMenu />
      <IconButton label="Toggle sidebar" onClick={() => set({ sidebarOpen: !sidebarOpen })} active={sidebarOpen}>
        <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </IconButton>
      <div className="flex min-w-0 items-baseline gap-2 pl-1">
        {editing ? (
          <input
            autoFocus
            aria-label="Document name"
            defaultValue={name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) rename({ name: v, dirty: true });
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-48 rounded bg-control px-1.5 text-[13px] font-semibold outline-none"
          />
        ) : (
          <button type="button" onDoubleClick={() => setEditing(true)} title={t('rename')} className="truncate text-[13px] font-semibold">
            {name}
          </button>
        )}
        {dirty && <span className="shrink-0 text-[13px] text-t3">{t('edited')}</span>}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <Segmented
          label="Mode"
          className="w-40"
          value={mode}
          onChange={(m) => set({ mode: m })}
          options={[
            { value: 'edit', label: t('edit'), title: `${mod}1` },
            { value: 'compare', label: t('compare'), title: `${mod}2` },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative h-6 w-[150px]">
          <AppearanceGlyph className="pointer-events-none absolute top-[5px] left-2.5 h-3.5 w-3.5 text-t1" />
          <select
            aria-label="Appearance"
            value={appearance}
            onChange={(e) => set({ appearance: e.target.value as Appearance })}
            className={cx('h-full w-full appearance-none rounded-md bg-control pr-6 pl-8 text-xs outline-none')}
          >
            {APPEARANCES.map((a, i) => (
              <option key={a} value={a}>
                {APPEARANCE_LABEL[a]} (⌥{i + 1})
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-[6px] right-2 h-3 w-3 text-t2" />
        </div>
        <button
          type="button"
          onClick={() => set({ exportOpen: true })}
          title={`⇧${mod}E`}
          className="h-6 rounded-md bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          {t('export')}
        </button>
        <IconButton label="Toggle inspector" onClick={() => set({ inspectorOpen: !inspectorOpen })} active={inspectorOpen}>
          <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </IconButton>
      </div>
    </header>
  );
}
