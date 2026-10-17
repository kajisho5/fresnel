import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { cx } from './controls';

export type MenuItem = { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | '---';

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

/** Context / pop-up menu, rendered once at the app root. */
export function MenuHost() {
  const { open, hide } = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && hide();
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
  if (!open) return null;
  const x = Math.min(open.x, window.innerWidth - 240);
  const y = Math.min(open.y, window.innerHeight - open.items.length * 26 - 16);
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] w-56 rounded-[10px] border border-hairline bg-elevated p-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      {open.items.map((it, i) =>
        it === '---' ? (
          <div key={`s${i}`} className="my-1 h-px bg-sep" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              hide();
              it.onSelect();
            }}
            className={cx(
              'flex w-full items-center justify-between gap-4 rounded-[5px] px-2.5 py-1 text-left text-[13px] outline-none hover:bg-accent hover:text-white focus:bg-accent focus:text-white disabled:opacity-40 disabled:hover:bg-transparent',
              it.danger && 'text-err',
            )}
          >
            <span>{it.label}</span>
            {it.shortcut && <span className="text-xs opacity-60">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
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
