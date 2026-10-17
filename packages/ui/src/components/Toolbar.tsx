import { useState } from 'react';
import { useStore } from 'zustand';
import { FileText, Menu as MenuIcon, Paintbrush, PanelLeft, Redo2, Undo2 } from 'lucide-react';
import { useDoc, undo, redo, refreshDirty } from '../store/doc';
import { useUI } from '../store/ui';
import { getLang, setLang, t, useLang } from '../i18n';
import { importLayers, newIcon, openIcon, openSample, save } from '../actions';
import { arrange, copyStyle, deleteSelection, duplicateSelection, groupSelection, pasteStyle, toggleVisible, ungroupSelection } from '../commands';
import { getTheme, setTheme } from '../theme';
import { IconButton, cx } from './controls';
import { alignMenuItems } from './AlignBar';
import { useMenu, type MenuItem } from './Menu';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';

function appMenu(): MenuItem[] {
  const theme = getTheme();
  return [
    { label: t('newIcon'), shortcut: `${MOD}N`, onSelect: newIcon },
    { label: t('open'), shortcut: `${MOD}O`, onSelect: openIcon },
    { label: t('trySample'), onSelect: openSample },
    '---',
    { label: t('save'), shortcut: `${MOD}S`, onSelect: () => save() },
    { label: t('saveAs'), shortcut: `⇧${MOD}S`, onSelect: () => save(true) },
    { label: t('export'), shortcut: `⇧${MOD}E`, onSelect: () => useUI.getState().set({ exportOpen: true }) },
    '---',
    { label: t('undo'), shortcut: `${MOD}Z`, onSelect: undo },
    { label: t('redo'), shortcut: `⇧${MOD}Z`, onSelect: redo },
    { label: t('newImage'), shortcut: `⇧${MOD}I`, onSelect: importLayers },
    { label: t('newGroup'), onSelect: () => {
        const id = useDoc.getState().addGroup();
        if (id) useUI.getState().select({ kind: 'group', id });
      } },
    { label: t('duplicate'), shortcut: `${MOD}D`, onSelect: duplicateSelection },
    { label: t('remove'), shortcut: '⌫', onSelect: () => deleteSelection() },
    '---',
    { label: t('bringLayerForward'), shortcut: `${MOD}]`, onSelect: () => arrange(-1) },
    { label: t('sendLayerBackward'), shortcut: `${MOD}[`, onSelect: () => arrange(1) },
    { label: t('groupSelection'), shortcut: `${MOD}G`, onSelect: groupSelection },
    { label: t('ungroup'), shortcut: `⇧${MOD}G`, onSelect: ungroupSelection },
    { label: t('toggleVisible'), shortcut: `⇧${MOD}H`, onSelect: () => toggleVisible() },
    ...alignMenuItems(),
    { label: t('copyStyle'), shortcut: `⌥${MOD}C`, onSelect: copyStyle },
    { label: t('pasteStyle'), shortcut: `⌥${MOD}V`, onSelect: pasteStyle },
    '---',
    { label: `${t('theme')}: ${t(theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem')}`, onSelect: () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark') },
    { label: `${t('language')}: ${getLang() === 'ja' ? 'English' : '日本語'}`, onSelect: () => setLang(getLang() === 'ja' ? 'en' : 'ja') },
  ];
}

export function Toolbar() {
  useLang();
  const name = useDoc((s) => s.name);
  const dirty = useDoc((s) => s.dirty);
  const { set, sidebarOpen, inspectorOpen, inspectorTab } = useUI();
  const [editing, setEditing] = useState(false);
  const canUndo = useStore(useDoc.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useDoc.temporal, (s) => s.futureStates.length > 0);

  const inspectorBtn = (tab: 'style' | 'document', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={inspectorOpen && inspectorTab === tab}
      onClick={() => set(inspectorOpen && inspectorTab === tab ? { inspectorOpen: false } : { inspectorOpen: true, inspectorTab: tab })}
      className={cx('inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover', inspectorOpen && inspectorTab === tab ? 'bg-hover text-accent' : 'text-t2 hover:text-t1')}
    >
      {icon}
    </button>
  );

  return (
    <header className="relative flex h-[52px] shrink-0 items-center gap-1.5 border-b border-sep bg-window px-3" data-tauri-drag-region>
      <IconButton
        label={t('menu')}
        onClick={() => {
          useMenu.getState().show(12, 46, appMenu());
        }}
      >
        <MenuIcon className="h-4 w-4" />
      </IconButton>
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
              if (v && v !== name) {
                useDoc.setState({ name: v });
                refreshDirty();
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-48 rounded bg-control px-1.5 text-[13px] font-semibold outline-none"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} title={t('rename')} className="truncate rounded px-1 text-[13px] font-semibold hover:bg-hover">
            {name}
          </button>
        )}
        {dirty && <span className="shrink-0 text-[13px] text-t3">{t('edited')}</span>}
      </div>
      <div className="ml-2 flex items-center">
        <IconButton label={`${t('undo')} (${MOD}Z)`} onClick={undo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label={`${t('redo')} (⇧${MOD}Z)`} onClick={redo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => set({ exportOpen: true })}
          title={`⇧${MOD}E`}
          className="mr-2 h-6 rounded-md bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          {t('export')}
        </button>
        {inspectorBtn('style', <Paintbrush className="h-4 w-4" />, t('style'))}
        {inspectorBtn('document', <FileText className="h-4 w-4" />, t('document'))}
      </div>
    </header>
  );
}
