import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { APPEARANCES } from '@fresnel/core';
import { useDoc, undo, redo } from './store/doc';
import { useUI } from './store/ui';
import { useLang } from './i18n';
import { getPlatform, handleDrop, importLayers, newIcon, openIcon, save, setPlatform } from './actions';
import type { Platform } from './platform';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Compare } from './components/Compare';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { ExportSheet } from './components/ExportSheet';
import { Recovery } from './components/Recovery';
import { cx } from './components/controls';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
      const ui = useUI.getState();
      if (e.altKey && !mod && /^Digit[1-6]$/.test(e.code)) {
        e.preventDefault();
        ui.set({ appearance: APPEARANCES[Number(e.code.slice(5)) - 1]! });
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        save(e.shiftKey);
      } else if (k === 'o') {
        e.preventDefault();
        openIcon();
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        newIcon();
      } else if (k === 'e' && e.shiftKey) {
        e.preventDefault();
        ui.set({ exportOpen: true });
      } else if (k === 'i' && e.shiftKey) {
        e.preventDefault();
        importLayers();
      } else if (e.key === '1' || e.key === '2') {
        e.preventDefault();
        ui.set({ mode: e.key === '1' ? 'edit' : 'compare' });
      } else if (k === 'g' && !typing) {
        e.preventDefault();
        const sel = ui.selection;
        if (sel.kind === 'layer') ui.select({ kind: 'group', id: useDoc.getState().groupLayer(sel.id) });
      } else if ((e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0') && !typing) {
        e.preventDefault();
        if (e.key === '0') ui.set({ zoom: 'fit' });
        else {
          const z = ui.zoom === 'fit' ? 0.5 : ui.zoom;
          ui.set({ zoom: Math.max(0.125, Math.min(1, e.key === '-' ? z / 2 : z * 2)) });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Reloads the document when its bundle changes on disk (e.g. edited through MCP). */
function useWatch() {
  const location = useDoc((s) => s.location);
  useEffect(() => {
    const p = getPlatform();
    if (!location || !p.watch || !p.reload) return;
    return p.watch(location, async () => {
      if (useDoc.getState().dirty) {
        useUI.getState().toast('info', 'The file changed on disk. Save to keep your version, or reopen it.');
        return;
      }
      const r = await p.reload!(location);
      useDoc.getState().load(r.doc, { name: r.name, location: r.location, extra: r.extra });
    });
  }, [location]);
}

function Toasts() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[10px] border border-hairline bg-elevated px-3.5 py-2 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
            t.kind === 'error' && 'text-err',
            t.kind === 'success' && 'text-ok',
          )}
        >
          <span className="text-t1">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-t3 hover:text-t1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function App({ platform }: { platform?: Platform }) {
  if (platform && getPlatform() !== platform) setPlatform(platform);
  useLang();
  useShortcuts();
  useWatch();
  const { mode, sidebarOpen, inspectorOpen, exportOpen, set } = useUI();
  const [dragging, setDragging] = useState(false);
  const generation = useDoc((s) => s.generation);
  void generation;

  useEffect(() => {
    // HIG §A3: collapse panes on narrow windows
    if (window.innerWidth < 1180) set({ inspectorOpen: false });
    if (window.innerWidth < 1024) set({ sidebarOpen: false });
  }, [set]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useDoc.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(false);
        handleDrop(e.dataTransfer);
      }}
    >
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        {mode === 'edit' && sidebarOpen && <Sidebar />}
        {mode === 'edit' ? <Canvas /> : <Compare />}
        {mode === 'edit' && inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
      {exportOpen && <ExportSheet />}
      <Recovery />
      {dragging && <div className="pointer-events-none fixed inset-[52px_0_24px_0] z-40 rounded-lg border-2 border-dashed border-accent bg-accent/5" />}
      <Toasts />
    </div>
  );
}
