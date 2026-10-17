import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Plus } from 'lucide-react';
import {
  baseValue,
  colorToCss,
  mimeOf,
  nameOf,
  resolveProp,
  type Asset,
  type Idiom,
  type Prop,
  type ResolveCtx,
  type Fill,
  type GroupNode,
  type IconDocument,
  type LayerNode,
} from '@fresnel/core';
import { useDoc } from '../store/doc';
import { currentAppearance, useUI, type Selection } from '../store/ui';
import { t, useLang } from '../i18n';
import { importLayers } from '../actions';
import { arrange, canPasteStyle, copyStyle, deleteSelection, duplicateSelection, groupSelection, pasteStyle, toggleVisible, ungroupSelection, useRename } from '../commands';
import { useMenu, type MenuItem } from './Menu';
import { useIconUrl } from '../lib/useIconUrl';
import { renderOptsFrom } from '../lib/renderOpts';
import { cx } from './controls';

const isMacUA = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const M = isMacUA ? '⌘' : 'Ctrl+';

export function nodeMenu(kind: 'group' | 'layer' | 'document'): MenuItem[] {
  if (kind === 'document')
    return [
      { label: t('newImage'), onSelect: importLayers },
      { label: t('newGroup'), onSelect: () => {
        const id = useDoc.getState().addGroup();
        if (id) useUI.getState().select({ kind: 'group', id });
      } },
    ];
  const s = useUI.getState().selection;
  return [
    { label: t('rename'), onSelect: () => s.kind !== 'document' && useRename.getState().set(s.id) },
    { label: t('duplicate'), shortcut: `${M}D`, onSelect: duplicateSelection },
    '---',
    { label: kind === 'group' ? t('bringGroupForward') : t('bringLayerForward'), shortcut: `${M}]`, onSelect: () => arrange(-1) },
    { label: kind === 'group' ? t('sendGroupBackward') : t('sendLayerBackward'), shortcut: `${M}[`, onSelect: () => arrange(1) },
    ...(kind === 'layer' ? [{ label: t('groupSelection'), shortcut: `${M}G`, onSelect: groupSelection } as MenuItem] : [{ label: t('ungroup'), shortcut: `⇧${M}G`, onSelect: ungroupSelection } as MenuItem]),
    { label: t('toggleVisible'), shortcut: `⇧${M}H`, onSelect: () => toggleVisible() },
    '---',
    { label: t('copyStyle'), shortcut: `⌥${M}C`, onSelect: copyStyle },
    { label: t('pasteStyle'), shortcut: `⌥${M}V`, onSelect: pasteStyle, disabled: !canPasteStyle() },
    '---',
    { label: t('remove'), shortcut: '⌫', onSelect: () => deleteSelection(), danger: true },
  ];
}

/** Object URLs for layer thumbnails, keyed by the (immutable) asset bytes. */
const urlCache = new Map<Uint8Array, string>();
/** Revokes thumbnail URLs of assets no longer in the document (recreated on demand after undo). */
function pruneAssetUrls(doc: IconDocument) {
  const live = new Set(Object.values(doc.assets).map((a) => a.bytes));
  for (const [bytes, url] of urlCache) {
    if (!live.has(bytes)) {
      URL.revokeObjectURL(url);
      urlCache.delete(bytes);
    }
  }
}
function assetUrl(a: Asset): string {
  let u = urlCache.get(a.bytes);
  if (!u) {
    // thumbnails show the sanitized copy of an SVG
    u = URL.createObjectURL(new Blob([(a.display ?? a.bytes) as unknown as ArrayBuffer], { type: mimeOf(a) }));
    urlCache.set(a.bytes, u);
  }
  return u;
}

export function fillToCss(fill: unknown, dark = false): string {
  if (fill === 'none' || fill === null || fill === undefined) return 'transparent';
  if (fill === 'system-dark' || (fill === 'automatic' && dark)) return 'linear-gradient(#3c3c40,#1c1c1e)';
  if (typeof fill === 'string') return 'linear-gradient(#ffffff,#e3e3e8)';
  const f = fill as Record<string, unknown>;
  if (typeof f.solid === 'string') return colorToCss(f.solid);
  if (typeof f['automatic-gradient'] === 'string') return colorToCss(f['automatic-gradient'] as string);
  if (Array.isArray(f['linear-gradient'])) {
    const [a, b] = f['linear-gradient'] as string[];
    return `linear-gradient(${colorToCss(a!)}, ${colorToCss(b!)})`;
  }
  return 'transparent';
}

function Thumb({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cx('checker flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-[#0f0f10]', className)}>{children}</div>;
}

type DragData = { kind: 'group' | 'layer'; id: string };
const DND = 'application/x-fresnel-node';

export function Sidebar() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const ui = useUI();
  const { selection, select } = ui;
  const appearance = currentAppearance(ui);
  const docName = useDoc((s) => s.name);
  const iconUrl = useIconUrl(doc, { ...renderOptsFrom(ui), size: 56 });
  const renaming = useRename((s) => s.id);
  const setRenaming = useRename((s) => s.set);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const lowerHalf = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  const actions = useDoc.getState();

  const idiom = useUI((u) => u.platform) as Idiom;
  const flat = useMemo(() => flatten(doc, collapsed, { appearance, idiom }), [doc, collapsed, appearance, idiom]);
  useEffect(() => pruneAssetUrls(doc), [doc]);
  const isSel = (s: Selection) => selection.kind === s.kind && (s.kind === 'document' || ('id' in selection && selection.id === (s as { id: string }).id));
  const layerCount = doc.groups.reduce((a, g) => a + g.layers.length, 0);
  const bgFill = resolveProp<Fill>(doc.props.fill, { appearance }, 'automatic');

  const onDragStart = (e: DragEvent, d: DragData) => {
    e.dataTransfer.setData(DND, JSON.stringify(d));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = (e: DragEvent, target: { kind: 'group'; g: GroupNode; gi: number } | { kind: 'layer'; g: GroupNode; l: LayerNode; li: number }) => {
    const raw = e.dataTransfer.getData(DND);
    const after = lowerHalf(e);
    setDropTarget(null);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    const d = JSON.parse(raw) as DragData;
    // the upper half of a row inserts before it, the lower half after it (matching the indicator line);
    // moveNode removes the item first, so moving down a list needs one less
    if (d.kind === 'group') {
      let gi = (target.kind === 'group' ? target.gi : doc.groups.indexOf(target.g)) + (after && target.kind === 'group' ? 1 : 0);
      const from = doc.groups.findIndex((g) => g.id === d.id);
      if (from < 0) return;
      if (from < gi) gi -= 1;
      if (from !== gi) actions.move({ kind: 'group', id: d.id }, gi);
    } else {
      // dropping a layer on a group row puts it at the top of that group
      let idx = target.kind === 'layer' ? target.li + (after ? 1 : 0) : 0;
      const from = target.g.layers.findIndex((l) => l.id === d.id);
      if (from >= 0 && from < idx) idx -= 1;
      if (from !== idx || from < 0) actions.move({ kind: 'layer', id: d.id }, idx, target.g.id);
    }
  };

  const toggleHidden = (ref: Selection) => toggleVisible(ref);
  const openMenu = (e: React.MouseEvent, r: Selection) => {
    e.preventDefault();
    select(r);
    useMenu.getState().show(e.clientX, e.clientY, nodeMenu(r.kind));
  };

  const onKey = (e: KeyboardEvent) => {
    const i = flat.findIndex((r) => isSel(r.sel));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) select(n.sel);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && selection.kind !== 'document') {
      e.preventDefault();
      removeSelected();
    } else if (e.key === ' ' && selection.kind !== 'document') {
      e.preventDefault();
      toggleHidden(selection);
    } else if (e.key === 'Enter' && selection.kind !== 'document') {
      e.preventDefault();
      setRenaming(selection.id);
    } else if (e.key === 'ArrowLeft' && selection.kind === 'group') {
      setCollapsed(new Set([...collapsed, selection.id]));
    } else if (e.key === 'ArrowRight' && selection.kind === 'group') {
      const c = new Set(collapsed);
      c.delete(selection.id);
      setCollapsed(c);
    }
  };

  const removeSelected = () => deleteSelection();

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-sep bg-sidebar" aria-label={t('layers')}>

      <div role="tree" aria-label={t('layers')} tabIndex={0} onKeyDown={onKey} className="flex-1 overflow-y-auto px-2 pb-2 outline-none">
        <div className="mt-2" />
        <Row
          selected={isSel({ kind: 'document' })}
          onClick={() => select({ kind: 'document' })}
          onContextMenu={(e) => openMenu(e, { kind: 'document' })}
          thumb={
            <Thumb className="!border-0 !bg-transparent">
              {iconUrl ? <img alt="" src={iconUrl} className="h-7 w-7" draggable={false} /> : <div className="h-[22px] w-[22px] rounded" style={{ background: fillToCss(bgFill, appearance.includes('dark')) }} />}
            </Thumb>
          }
          name={docName}
          level={1}
        />
        <div className="mx-2 my-1 h-px bg-sep" />
        {doc.groups.length === 0 && <p className="px-3 py-6 text-center text-xs leading-5 text-t3">{t('dropHere')}</p>}
        {flat
          .filter((r) => r.sel.kind !== 'document')
          .map((r) => {
            const sel = r.sel as { kind: 'group' | 'layer'; id: string };
            const target = r.kind === 'group' ? ({ kind: 'group', g: r.group, gi: r.gi } as const) : ({ kind: 'layer', g: r.group, l: r.layer!, li: r.li! } as const);
            return (
              <Row
                key={sel.id}
                level={r.kind === 'group' ? 1 : 2}
                selected={isSel(r.sel)}
                dropping={dropTarget?.id === sel.id ? (dropTarget.after && r.kind === 'layer' ? 'after' : dropTarget.after && r.kind === 'group' && collapsed.has(sel.id) ? 'after' : dropTarget.after ? 'into' : 'before') : undefined}
                onClick={() => select(r.sel)}
                onDoubleClick={() => setRenaming(sel.id)}
                onContextMenu={(e) => openMenu(e, r.sel)}
                draggable
                onDragStart={(e) => onDragStart(e, sel)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DND)) return;
                  e.preventDefault();
                  const after = lowerHalf(e);
                  setDropTarget((d) => (d?.id === sel.id && d.after === after ? d : { id: sel.id, after }));
                }}
                onDragLeave={() => setDropTarget((d) => (d?.id === sel.id ? null : d))}
                onDrop={(e) => onDrop(e, target)}
                expander={
                  r.kind === 'group' ? (
                    <button
                      type="button"
                      aria-label={collapsed.has(sel.id) ? t('expandRow') : t('collapseRow')}
                      onClick={(e) => {
                        e.stopPropagation();
                        const c = new Set(collapsed);
                        if (c.has(sel.id)) c.delete(sel.id);
                        else c.add(sel.id);
                        setCollapsed(c);
                      }}
                      className="flex h-4 w-4 items-center justify-center text-t2"
                    >
                      {collapsed.has(sel.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  ) : undefined
                }
                thumb={
                  r.kind === 'group' ? (
                    <Thumb className="!bg-transparent">
                      <Folder className="h-4 w-4 text-t2" strokeWidth={1.5} />
                    </Thumb>
                  ) : (
                    <Thumb>{r.asset && <img alt="" src={assetUrl(r.asset)} className="h-full w-full object-contain" draggable={false} />}</Thumb>
                  )
                }
                name={r.name}
                renaming={renaming === sel.id}
                onRename={(v) => {
                  setRenaming(null);
                  if (v && v !== r.name) actions.rename(r.sel as never, v);
                }}
                badge={r.glass ? t('glass') : undefined}
                hidden={r.hidden}
                onToggleHidden={() => toggleHidden(r.sel)}
              />
            );
          })}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-t border-sep px-2">
        <button
          type="button"
          aria-label={t('add')}
          title={t('add')}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            useMenu.getState().show(r.left, r.top - 72, nodeMenu('document'));
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-t2 hover:bg-hover hover:text-t1"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="ml-auto pr-2 text-[11px] text-t3">{t('layersCount', { g: doc.groups.length, l: layerCount })}</span>
      </div>
    </aside>
  );
}

interface FlatRow {
  kind: 'group' | 'layer';
  sel: Selection;
  name: string;
  group: GroupNode;
  gi: number;
  layer?: LayerNode;
  li?: number;
  asset?: Asset;
  glass: boolean;
  hidden: boolean;
}

function flatten(doc: IconDocument, collapsed: Set<string>, ctx: ResolveCtx): FlatRow[] {
  const isHidden = (p: Prop | undefined) => resolveProp<boolean>(p, ctx, false) === true;
  const rows: FlatRow[] = [];
  doc.groups.forEach((g, gi) => {
    const glass = g.layers.some((l) => baseValue(l.props.glass) === true) || (baseValue(g.props.translucency) as { enabled?: boolean } | undefined)?.enabled === true;
    rows.push({ kind: 'group', sel: { kind: 'group', id: g.id }, name: nameOf(g) || `Group ${gi + 1}`, group: g, gi, glass, hidden: isHidden(g.props.hidden) });
    if (collapsed.has(g.id)) return;
    g.layers.forEach((l, li) => {
      const img = baseValue(l.props['image-name']);
      rows.push({
        kind: 'layer',
        sel: { kind: 'layer', id: l.id },
        name: nameOf(l) || `Layer ${li + 1}`,
        group: g,
        gi,
        layer: l,
        li,
        ...(typeof img === 'string' && doc.assets[img] ? { asset: doc.assets[img] } : {}),
        glass: false,
        hidden: isHidden(l.props.hidden),
      });
    });
  });
  return rows;
}

function Row({
  level,
  selected,
  dropping,
  thumb,
  name,
  badge,
  hidden,
  expander,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleHidden,
  renaming,
  onRename,
  ...drag
}: {
  level: 1 | 2;
  selected: boolean;
  dropping?: 'before' | 'after' | 'into';
  thumb: React.ReactNode;
  name: string;
  badge?: string | undefined;
  hidden?: boolean;
  expander?: React.ReactNode;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleHidden?: () => void;
  renaming?: boolean;
  onRename?: (v: string) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-level={level}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      {...drag}
      className={cx(
        'group relative flex h-8 items-center gap-1.5 rounded-md pr-2 transition-colors duration-75',
        level === 1 ? 'pl-2' : 'pl-[34px]',
        selected ? 'bg-selected' : 'hover:bg-hover',
        dropping === 'before' && 'before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded before:bg-accent',
        dropping === 'after' && 'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-accent',
        dropping === 'into' && 'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-accent',
      )}
    >
      <div className="flex w-4 justify-center">{expander}</div>
      {thumb}
      {renaming ? (
        <input
          autoFocus
          defaultValue={name}
          aria-label="Name"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onRename?.(e.target.value.trim())}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') onRename?.(name);
          }}
          className="ml-1 h-5 min-w-0 flex-1 rounded bg-control px-1 text-xs outline-none"
        />
      ) : (
        <span className={cx('ml-1 min-w-0 flex-1 truncate text-xs', level === 1 && 'font-semibold', hidden ? 'text-t3' : 'text-t1')}>{name}</span>
      )}
      {badge && (
        <span className={cx('rounded px-1.5 py-px text-[10px] font-semibold', badge === t('glass') ? 'bg-accent/20 text-accent' : 'bg-hover text-t2')}>{badge}</span>
      )}
      {onToggleHidden && (
        <button
          type="button"
          aria-label={hidden ? t('showNode') : t('hideNode')}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
          className={cx('flex h-5 w-5 items-center justify-center text-t2', hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
