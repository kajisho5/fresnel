/** Align / Distribute: icons, menu items and the inspector row (docs/design/multi-select.md). */
import type { ReactNode } from 'react';
import type { AlignHow } from '@fresnel/core';
import { alignSelection, distributeSelection } from '../commands';
import { t, useLang } from '../i18n';
import { selectedRefs, useUI } from '../store/ui';
import type { MenuItem } from './Menu';
import { cx } from './controls';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    {children}
  </svg>
);

export const ALIGN_ICONS: Record<AlignHow | 'dh' | 'dv', ReactNode> = {
  left: (
    <Svg>
      <path d="M1 0v14" />
      <rect x="3" y="2" width="9" height="4" rx="1" />
      <rect x="3" y="8" width="6" height="4" rx="1" />
    </Svg>
  ),
  hcenter: (
    <Svg>
      <path d="M7 0v14" />
      <rect x="2" y="2" width="10" height="4" rx="1" />
      <rect x="4" y="8" width="6" height="4" rx="1" />
    </Svg>
  ),
  right: (
    <Svg>
      <path d="M13 0v14" />
      <rect x="2" y="2" width="9" height="4" rx="1" />
      <rect x="5" y="8" width="6" height="4" rx="1" />
    </Svg>
  ),
  top: (
    <Svg>
      <path d="M0 1h14" />
      <rect x="2" y="3" width="4" height="9" rx="1" />
      <rect x="8" y="3" width="4" height="6" rx="1" />
    </Svg>
  ),
  vcenter: (
    <Svg>
      <path d="M0 7h14" />
      <rect x="2" y="2" width="4" height="10" rx="1" />
      <rect x="8" y="4" width="4" height="6" rx="1" />
    </Svg>
  ),
  bottom: (
    <Svg>
      <path d="M0 13h14" />
      <rect x="2" y="2" width="4" height="9" rx="1" />
      <rect x="8" y="5" width="4" height="6" rx="1" />
    </Svg>
  ),
  dh: (
    <Svg>
      <path d="M0 0v14M14 0v14" />
      <rect x="5" y="3" width="4" height="8" rx="1" />
    </Svg>
  ),
  dv: (
    <Svg>
      <path d="M0 0h14M0 14h14" />
      <rect x="3" y="5" width="8" height="4" rx="1" />
    </Svg>
  ),
};

const ALIGN: { how: AlignHow; key: Parameters<typeof t>[0] }[] = [
  { how: 'left', key: 'alignLeft' },
  { how: 'hcenter', key: 'alignHCenter' },
  { how: 'right', key: 'alignRight' },
  { how: 'top', key: 'alignTop' },
  { how: 'vcenter', key: 'alignVCenter' },
  { how: 'bottom', key: 'alignBottom' },
];

/** "Align ▸" and "Distribute ▸" for the app menu and context menus. */
export function alignMenuItems(): MenuItem[] {
  const n = selectedRefs(useUI.getState().selection).length;
  return [
    {
      label: t('align'),
      disabled: n === 0,
      submenu: [
        ...ALIGN.slice(0, 3).map((a) => ({ label: t(a.key), icon: ALIGN_ICONS[a.how], onSelect: () => alignSelection(a.how) })),
        '---' as const,
        ...ALIGN.slice(3).map((a) => ({ label: t(a.key), icon: ALIGN_ICONS[a.how], onSelect: () => alignSelection(a.how) })),
      ],
    },
    {
      label: t('distribute'),
      disabled: n < 3,
      submenu: [
        { label: t('distributeH'), icon: ALIGN_ICONS.dh, onSelect: () => distributeSelection('horizontal') },
        { label: t('distributeV'), icon: ALIGN_ICONS.dv, onSelect: () => distributeSelection('vertical') },
      ],
    },
  ];
}

const Btn = ({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="flex h-6 w-[26px] items-center justify-center rounded-[6px] bg-control text-t1 hover:bg-hover hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:text-t3 disabled:hover:bg-control"
  >
    {icon}
  </button>
);

/** Inspector row: six align buttons, two distribute buttons and the reference switch. */
export function AlignRow() {
  useLang();
  const ui = useUI();
  const n = selectedRefs(ui.selection).length;
  if (!n) return null;
  return (
    <div className="py-1">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="text-xs text-t2">{t('align')}</span>
        <select
          aria-label={`${t('align')}: ${t('alignToSelection')} / ${t('alignToCanvas')}`}
          value={n === 1 ? 'canvas' : ui.alignBasis}
          disabled={n === 1}
          onChange={(e) => ui.set({ alignBasis: e.target.value as 'selection' | 'canvas' })}
          className="h-[22px] rounded-[5px] bg-control px-2 text-[11px] outline-none disabled:opacity-50"
        >
          <option value="selection">{t('alignToSelection')}</option>
          <option value="canvas">{t('alignToCanvas')}</option>
        </select>
      </div>
      <div className={cx('flex items-center gap-[3px]')}>
        {ALIGN.slice(0, 3).map((a) => (
          <Btn key={a.how} label={`${t('align')}: ${t(a.key)}`} icon={ALIGN_ICONS[a.how]} onClick={() => alignSelection(a.how)} />
        ))}
        <span className="w-2" />
        {ALIGN.slice(3).map((a) => (
          <Btn key={a.how} label={`${t('align')}: ${t(a.key)}`} icon={ALIGN_ICONS[a.how]} onClick={() => alignSelection(a.how)} />
        ))}
        <span className="w-2" />
        <Btn label={`${t('distribute')}: ${t('distributeH')}`} icon={ALIGN_ICONS.dh} disabled={n < 3} onClick={() => distributeSelection('horizontal')} />
        <Btn label={`${t('distribute')}: ${t('distributeV')}`} icon={ALIGN_ICONS.dv} disabled={n < 3} onClick={() => distributeSelection('vertical')} />
      </div>
      <p className="m-0 mt-1.5 text-[10px] leading-4 text-t3">{t('alignHint')}</p>
    </div>
  );
}
