import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { create } from 'zustand';
import { cx } from './controls';

export type MenuItem =
  | { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; danger?: boolean; icon?: ReactNode; submenu?: undefined }
  | { label: string; submenu: MenuItem[]; disabled?: boolean; icon?: ReactNode; shortcut?: undefined; onSelect?: undefined; danger?: undefined }
  | '---';

interface MenuState {
  open: { x: number; y: number; items: MenuItem[] } | null;
  show(x: number, y: number, items: MenuItem[]): void;
  hide(): void;
}

export const useMenu = create<MenuState>()((set) => ({
  open: null,
  show: (x, y, items) => set({ open: { x, y, items } }),
  hide: () => set({ open: null }),
}));

const ITEM_H = 26;

function MenuList({
  items,
  onPick,
  onOpenSub,
  openSub,
  listRef,
  onBack,
}: {
  items: MenuItem[];
  onPick: () => void;
  onOpenSub?: (i: number, el: HTMLElement, focus: boolean) => void;
  openSub?: number | null;
  listRef?: React.RefObject<HTMLDivElement | null>;
  onBack?: () => void;
}) {
  return (
    <div
      ref={listRef}
      role="menu"
      className="w-56 rounded-[10px] border border-hairline bg-elevated p-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && onBack) {
          e.preventDefault();
          e.stopPropagation();
          onBack();
          return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        e.stopPropagation();
        const btns = [...((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }}
    >
      {items.map((it, i) =>
        it === '---' ? (
          <div key={`s${i}`} className="my-1 h-px bg-sep" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            aria-haspopup={it.submenu ? 'menu' : undefined}
            aria-expanded={it.submenu ? openSub === i : undefined}
            disabled={it.disabled}
            onMouseEnter={(e) => onOpenSub?.(it.submenu ? i : -1, e.currentTarget, false)}
            onKeyDown={(e) => {
              if (it.submenu && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                onOpenSub?.(i, e.currentTarget, true);
              }
            }}
            onClick={(e) => {
              if (it.submenu) return onOpenSub?.(i, e.currentTarget, true);
              onPick();
              it.onSelect();
            }}
            className={cx(
              'flex w-full items-center justify-between gap-4 rounded-[5px] px-2.5 py-1 text-left text-[13px] outline-none hover:bg-accent hover:text-white focus:bg-accent focus:text-white disabled:opacity-40 disabled:hover:bg-transparent',
              it.danger && 'text-err',
              it.submenu && openSub === i && 'bg-accent text-white',
            )}
          >
            <span className="flex items-center gap-2">
              {it.icon && <span className="flex h-4 w-4 items-center justify-center opacity-80">{it.icon}</span>}
              {it.label}
            </span>
            {it.shortcut && <span className="text-xs opacity-60">{it.shortcut}</span>}
            {it.submenu && <ChevronRight aria-hidden className="h-3.5 w-3.5 opacity-70" />}
          </button>
        ),
      )}
    </div>
  );
}

/** Context / pop-up menu with one level of submenus, rendered once at the app root. */
export function MenuHost() {
  const { open, hide } = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<{ index: number; x: number; y: number; focus: boolean } | null>(null);
  useEffect(() => setSub(null), [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !subRef.current?.contains(e.target as Node) && hide();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', hide);
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', hide);
    };
  }, [open, hide]);
  useEffect(() => {
    if (sub?.focus) subRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [sub]);
  if (!open) return null;
  const x = Math.min(open.x, window.innerWidth - 240);
  const y = Math.max(8, Math.min(open.y, window.innerHeight - open.items.length * ITEM_H - 16));
  const subItems = sub ? (open.items[sub.index] as Exclude<MenuItem, '---'>).submenu ?? [] : [];
  return (
    <>
      <div className="fixed z-[70]" style={{ left: x, top: y }}>
        <MenuList
          items={open.items}
          listRef={ref}
          onPick={hide}
          openSub={sub?.index ?? null}
          onOpenSub={(i, el, focus) => {
            if (i < 0) return setSub(null);
            const r = el.getBoundingClientRect();
            // open to the right, or to the left when there's no room
            const sx = r.right + 232 > window.innerWidth ? r.left - 228 : r.right + 4;
            const n = (open.items[i] as Exclude<MenuItem, '---'>).submenu?.length ?? 0;
            setSub({ index: i, x: sx, y: Math.max(8, Math.min(r.top - 5, window.innerHeight - n * ITEM_H - 24)), focus });
          }}
        />
      </div>
      {sub && (
        <div className="fixed z-[71]" style={{ left: sub.x, top: sub.y }}>
          <MenuList
            items={subItems}
            listRef={subRef}
            onPick={hide}
            onBack={() => {
              const i = sub.index;
              setSub(null);
              ref.current?.querySelectorAll<HTMLButtonElement>(':scope > button')[i - open.items.slice(0, i).filter((it) => it === '---').length]?.focus();
            }}
          />
        </div>
      )}
    </>
  );
}

export function MenuButton({ items, children, label, className }: { items: () => MenuItem[]; children: ReactNode; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        useMenu.getState().show(r.left, r.top - 8 - items().length * 26, items());
      }}
      className={className}
    >
      {children}
    </button>
  );
}
