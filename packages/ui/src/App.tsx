import { useEffect, useState } from 'react';
import { findGroup, findLayer } from '@fresnel/core';
import { X } from 'lucide-react';
import { useDoc, undo, redo } from './store/doc';
import { selectedRefs, selectionOf, useUI } from './store/ui';
import { t as tr, useLang } from './i18n';
import { commitPendingEdit, getPlatform, handleDrop, importLayers, newIcon, openIcon, save, setPlatform } from './actions';
import { arrange, copyStyle, selectAllLayers, deleteSelection, duplicateSelection, groupSelection, nudge, pasteStyle, toggleVisible, ungroupSelection } from './commands';
import { MenuHost, useMenu } from './components/Menu';
import { initTheme } from './theme';
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
      const target = e.target as HTMLElement;
      // text entry only: sliders, checkboxes and color wells keep the global shortcuts (⌘Z after a slider drag)
      const typing = !!target.closest(
        'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button]), textarea, [contenteditable]:not([contenteditable=false])',
      );
      const onControl = !!target.closest('button, input, select, a, [role=switch], [role=menuitem]');
      const ui = useUI.getState();
      if (e.altKey && !mod && !typing && /^Digit[1-3]$/.test(e.code)) {
        e.preventDefault();
        ui.set({ appearanceMode: (['default', 'dark', 'mono'] as const)[Number(e.code.slice(5)) - 1]! });
        return;
      }
      if (!mod) {
        if (typing || useMenu.getState().open || ui.exportOpen) return;
        if (e.key === 'Escape') {
          ui.select({ kind: 'document' });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (ui.selection.kind !== 'document' && !onControl && !target.closest('[role=tree]')) {
            e.preventDefault();
            deleteSelection();
          }
        } else if (e.key.startsWith('Arrow') && ui.selection.kind !== 'document' && !target.closest('[role=tree], [role=slider], [role=radiogroup], input, select')) {
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
        }
        return;
      }
      const k = e.key.toLowerCase();
      // while the export sheet or a menu is open, shortcuts must not edit the document behind it
      if (ui.exportOpen || useMenu.getState().open) {
        if (!typing || ['s', 'o', 'n'].includes(k)) e.preventDefault();
        return;
      }
      if (k === 'a' && !typing && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        selectAllLayers();
      } else if (k === 'z' && !typing) {
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
        commitPendingEdit();
        ui.set({ exportOpen: true });
      } else if (k === 'i' && e.shiftKey) {
        e.preventDefault();
        importLayers();
      } else if ((e.key === '1' || e.key === '2') && !e.shiftKey && !typing) {
        e.preventDefault();
        ui.set({ mode: e.key === '1' ? 'edit' : 'compare' });
      } else if (typing) {
        return;
      } else if (k === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (k === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (k === 'h' && e.shiftKey) {
        e.preventDefault();
        toggleVisible();
      } else if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        e.preventDefault();
        arrange(e.code === 'BracketRight' ? -1 : 1);
      } else if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        copyStyle();
      } else if (e.altKey && e.code === 'KeyV') {
        e.preventDefault();
        pasteStyle();
      } else if (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0') {
        e.preventDefault();
        const zooms = [0.25, 0.5, 0.75, 1, 1.5, 2];
        if (e.key === '0') ui.set({ zoom: 1, previewSize: 'fit' });
        else {
          const i = zooms.indexOf(ui.zoom);
          ui.set({ zoom: zooms[Math.max(0, Math.min(zooms.length - 1, (i < 0 ? 3 : i) + (e.key === '-' ? -1 : 1)))]! });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Drops a selection that no longer exists (after undo, delete, open, restore). */
function useSelectionGuard() {
  useEffect(
    () =>
      useDoc.subscribe((st) => {
        const ui = useUI.getState();
        const items = selectedRefs(ui.selection);
        if (!items.length) return;
        const alive = items.filter((r) => (r.kind === 'group' ? !!findGroup(st.doc, r.id) : !!findLayer(st.doc, r.id)));
        if (alive.length !== items.length) ui.select(selectionOf(alive));
      }),
    [],
  );
}

/** Reloads the document when its bundle changes on disk (e.g. edited through MCP). */
function useWatch() {
  const location = useDoc((s) => s.location);
  useEffect(() => {
    const p = getPlatform();
    if (!location || !p.watch || !p.reload) return;
    return p.watch(location, async () => {
      if (useDoc.getState().dirty) {
        useUI.getState().toast('info', tr('fileChangedOnDisk'));
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
          <button type="button" aria-label={tr('dismiss')} onClick={() => dismiss(t.id)} className="text-t3 hover:text-t1">
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
  useSelectionGuard();
  useWatch();
  const { mode, sidebarOpen, inspectorOpen, exportOpen, set } = useUI();
  const [dragging, setDragging] = useState(false);
  const generation = useDoc((s) => s.generation);
  void generation;

  useEffect(() => initTheme(), []);
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
      <MenuHost />
      {dragging && <div className="pointer-events-none fixed inset-[52px_0_24px_0] z-40 rounded-lg border-2 border-dashed border-accent bg-accent/5" />}
      <Toasts />
    </div>
  );
}
