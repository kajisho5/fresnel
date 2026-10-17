import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { beginGesture, endGesture } from '../store/doc';
import { t } from '../i18n';
import { evalNumber } from '../lib/geometry';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-md bg-control p-0.5', size === 'sm' ? 'h-[22px]' : 'h-6', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-[5px] px-2 whitespace-nowrap transition-colors duration-75',
            size === 'sm' ? 'text-[11px]' : 'text-xs',
            o.value === value ? 'bg-elevated font-medium text-t1 shadow-[0_1px_1px_rgba(0,0,0,0.3)]' : 'text-t2 hover:text-t1',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-4 w-[26px] shrink-0 rounded-full transition-colors duration-75', checked ? 'bg-accent' : 'bg-control')}
    >
      <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] duration-150', checked ? 'left-3' : 'left-0.5')} />
    </button>
  );
}

/** Numeric text field: ↑↓ ±step, ⇧ ×10, ⌥ ×0.1. Commits on Enter / blur. */
export function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 0.01,
  format = (v: number) => v.toFixed(2),
  parse = (s: string) => Number(s),
  label,
  prefix,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  parse?: (s: string) => number;
  label: string;
  prefix?: string;
  className?: string;
}) {
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  /** text shown when the field was focused: leaving it unchanged commits nothing */
  const startText = useRef<string | null>(null);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, format]);
  /** Accepts plain numbers and arithmetic like "35*3", "*2", "+10" (evaluated in display units). */
  const parseInput = (raw: string): number => {
    const direct = parse(raw);
    if (Number.isFinite(direct) && !/[*/+]|.-/.test(raw.trim().replace(/%$/, ''))) return direct;
    const shown = parseFloat(format(value).replace(/[^\d.\-]/g, ''));
    const r = evalNumber(raw, Number.isFinite(shown) ? shown : value);
    return Number.isFinite(r) ? parse(String(r)) : NaN;
  };
  const commit = (v: number) => {
    if (!Number.isFinite(v)) {
      setText(format(value));
      return;
    }
    const c = Math.min(max, Math.max(min, v));
    if (c !== value) onChange(c);
    setText(format(c));
    startText.current = format(c);
  };
  return (
    <label className={cx('flex h-[22px] min-w-0 items-center gap-1 rounded-[5px] bg-control px-2', className)}>
      {prefix && <span className="text-[11px] text-t3">{prefix}</span>}
      <input
        aria-label={label}
        className="tabular min-w-0 flex-1 bg-transparent text-right font-mono text-xs outline-none"
        value={text}
        onFocus={(e) => {
          focused.current = true;
          startText.current = e.currentTarget.value;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          const unchanged = text === startText.current || text.trim() === '';
          startText.current = null;
          if (unchanged) setText(format(value));
          else commit(parseInput(text));
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(format(value));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const m = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            commit(+(value + (e.key === 'ArrowUp' ? 1 : -1) * step * m).toFixed(6));
          }
        }}
      />
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format,
  parse,
  defaultValue,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
  parse?: (s: string) => number;
  defaultValue?: number;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        className="fr-slider min-w-0 flex-1"
        aria-label={label}
        style={{ ['--fill' as string]: fill }}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={beginGesture}
        onPointerUp={endGesture}
        onKeyDown={beginGesture}
        onKeyUp={endGesture}
        onBlur={endGesture}
        onDoubleClick={() => defaultValue !== undefined && defaultValue !== value && onChange(defaultValue)}
        onChange={(e) => Number(e.target.value) !== value && onChange(Number(e.target.value))}
      />
      <NumberField
        className="w-14"
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        {...(format ? { format } : {})}
        {...(parse ? { parse } : {})}
      />
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: ({ value: T; label: string } | '---')[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx('relative h-[22px] min-w-0 flex-1', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-full w-full appearance-none rounded-[5px] bg-control pr-6 pl-2.5 text-xs outline-none"
      >
        {options.map((o, i) =>
          o === '---' ? (
            <option key={`sep${i}`} disabled>
              ──────────
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-[5px] right-1.5 h-3 w-3 text-t2" />
    </div>
  );
}

export function ColorWell({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label htmlFor={id} className="relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[4px] border border-hairline" style={{ background: value }}>
        <input
          id={id}
          type="color"
          aria-label={label}
          value={value}
          onPointerDown={beginGesture}
          onBlur={endGesture}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <HexField value={value} onChange={onChange} label={label} />
    </div>
  );
}

function HexField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      aria-label={`${label} hex`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const hex = `#${text.trim().replace('#', '').toUpperCase()}`;
        if (/^#[0-9A-F]{6}$/.test(hex) && hex !== value.toUpperCase()) onChange(hex);
        else setText(value);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="tabular h-[22px] min-w-0 flex-1 rounded-[5px] bg-control px-2 font-mono text-xs outline-none"
    />
  );
}

export function Button({
  children,
  variant = 'secondary',
  onClick,
  disabled,
  className,
  title,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] transition-colors duration-75 disabled:opacity-40',
        variant === 'primary' && 'bg-accent font-semibold text-white hover:bg-accent-hover',
        variant === 'secondary' && 'bg-control text-t1 hover:brightness-110',
        variant === 'danger' && 'bg-control text-err hover:brightness-110',
        variant === 'ghost' && 'text-t2 hover:bg-hover hover:text-t1',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, onClick, children, disabled, active }: { label: string; onClick?: () => void; children: ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-t2 transition-colors duration-75 hover:bg-hover hover:text-t1 disabled:opacity-30',
        active && 'text-t1',
      )}
    >
      {children}
    </button>
  );
}

/** Inspector row: label (with override marker) + control */
export function Row({
  label,
  children,
  overridden,
  onReset,
}: {
  label: string;
  children: ReactNode;
  overridden?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <div className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-t2">
        {overridden && (
          <button
            type="button"
            title={`${t('overridden')} — ${t('resetOverride')}`}
            aria-label={t('resetOverride')}
            onClick={onReset}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-override"
          />
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-sep px-4 py-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-[13px] font-semibold">
        {title}
        <ChevronDown aria-hidden className={cx('h-3.5 w-3.5 text-t2 transition-transform duration-200', !open && '-rotate-90')} />
      </button>
      {open && <div className="mt-2 flex flex-col">{children}</div>}
    </section>
  );
}
