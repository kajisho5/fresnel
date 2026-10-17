import { type ReactNode } from 'react';
import { FileText, Paintbrush, Plus, X, ArrowUpDown } from 'lucide-react';
import {
  BLEND_MODES,
  baseValue,
  findGroup,
  findLayer,
  makeAsset,
  nameOf,
  normalizeColorInput,
  parseColor,
  resolveProp,
  rgbaToHex,
  setProp as coreSetProp,
  toRGBA,
  variantsOf,
  type AppearanceKey,
  type IconDocument,
  type Idiom,
  type NodeRef,
  type Position,
  type PropMap,
  type Variant,
} from '@fresnel/core';
import { useDoc } from '../store/doc';
import { APPEARANCE_MODE_LABEL, VARIANT_LABEL, currentAppearance, currentAppearanceKey, useUI, type SectionKey } from '../store/ui';
import { t, useLang } from '../i18n';
import { getPlatform } from '../actions';
import { useRename } from '../commands';
import { ColorWell, NumberField, Segmented, Select, Slider, Toggle, cx } from './controls';
import { useMenu } from './Menu';

function propsOf(doc: IconDocument, ref: NodeRef): PropMap | null {
  if (ref.kind === 'document') return doc.props;
  if (ref.kind === 'group') return findGroup(doc, ref.id)?.props ?? null;
  return findLayer(doc, ref.id)?.layer.props ?? null;
}

/** The variant a section edits when its scope is set to the current appearance / platform. */
function sectionVariant(section: SectionKey): Variant | null {
  const ui = useUI.getState();
  if (section === 'composition') return { idiom: ui.platform as Idiom };
  const k = currentAppearanceKey(ui);
  return k ? { appearance: k } : null;
}

function sectionVariantLabel(section: SectionKey): string | null {
  const ui = useUI.getState();
  if (section === 'composition') return ui.platform;
  return ui.appearanceMode === 'default' ? null : APPEARANCE_MODE_LABEL[ui.appearanceMode];
}

const toHex = (c: unknown) => {
  const p = typeof c === 'string' ? parseColor(c) : null;
  return p ? rgbaToHex(toRGBA(p)) : '#FFFFFF';
};
const alphaOf = (c: unknown) => {
  const p = typeof c === 'string' ? parseColor(c) : null;
  return p ? toRGBA(p).a : 1;
};
const withAlpha = (hex: string, a: number) => {
  const base = normalizeColorInput(hex);
  const p = parseColor(base)!;
  return `${p.space}:${[...p.c.slice(0, 3), a].map((x) => x.toFixed(5)).join(',')}`;
};
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const parsePct = (s: string) => Number(s.replace('%', '')) / 100;

// ---------------------------------------------------------------- generic setting row

interface SettingProps<T> {
  nodeRef: NodeRef;
  section: SectionKey;
  attr: string;
  label: string;
  fallback: T;
  /** renders the control for a value; `set(null)` removes the value */
  control: (value: T, set: (v: unknown) => void) => ReactNode;
}

function Setting<T>({ nodeRef, section, attr, label, fallback, control }: SettingProps<T>) {
  const doc = useDoc((s) => s.doc);
  const ui = useUI();
  const props = propsOf(doc, nodeRef);
  const prop = props?.[attr];
  const scope = ui.sectionScope[section];
  const variant = scope === 'variant' ? sectionVariant(section) : null;
  const ctx = { appearance: currentAppearance(ui), idiom: ui.platform as Idiom };
  const value = (variant ? resolveProp<T>(prop, ctx, fallback) : ((baseValue(prop) as T | undefined) ?? fallback)) ?? fallback;
  const write = (v: Variant | null) => (val: unknown) => {
    try {
      useDoc.getState().setProp(nodeRef, attr, val, v ?? undefined);
    } catch (e) {
      useUI.getState().toast('error', (e as Error).message);
    }
  };
  const variants = variantsOf(prop);
  const curAppearance = currentAppearanceKey(ui);
  const varyOptions: { label: string; v: Variant }[] = [
    ...(curAppearance ? [{ label: `${t('varyFor')} ${APPEARANCE_MODE_LABEL[ui.appearanceMode]}`, v: { appearance: curAppearance as AppearanceKey } }] : []),
    { label: `${t('varyFor')} ${ui.platform}`, v: { idiom: ui.platform as Idiom } },
  ].filter((o) => !variants.some((x) => x.appearance === o.v.appearance && x.idiom === o.v.idiom));
  return (
    <div className="py-1">
      <div className="group/setting flex min-h-8 items-center gap-2">
        <div className="flex w-[104px] shrink-0 items-center gap-1 text-xs text-t2">
          <span className="truncate">{label}</span>
          {scope === 'all' && varyOptions.length > 0 && (
            <button
              type="button"
              aria-label={`${label}: ${t('addVariant')}`}
              title={t('addVariant')}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                useMenu.getState().show(
                  r.left,
                  r.bottom + 4,
                  varyOptions.map((o) => ({ label: o.label, onSelect: () => write(o.v)(resolveProp(prop, ctx, value) ?? value) })),
                );
              }}
              className="flex h-4 w-4 items-center justify-center rounded text-t3 opacity-0 group-hover/setting:opacity-100 hover:bg-hover hover:text-t1 focus:opacity-100"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{control(value, write(variant))}</div>
      </div>
      {scope === 'all' &&
        variants.map((v) => {
          const vv = prop?.specs?.find((e) => e.appearance === v.appearance && e.idiom === v.idiom)?.value as T;
          const active =
            (v.appearance === undefined || v.appearance === curAppearance) && (v.idiom === undefined || v.idiom === ui.platform || (v.idiom === 'square' && ui.platform !== 'watchOS'));
          return (
            <div key={`${v.appearance}-${v.idiom}`} className="flex min-h-7 items-center gap-2 pl-3">
              <div className="flex w-[92px] shrink-0 items-center gap-1 text-[11px]">
                <button
                  type="button"
                  aria-label={`${t('removeVariant')} ${VARIANT_LABEL(v)}`}
                  title={t('removeVariant')}
                  onClick={() => write(v)(null)}
                  className="flex h-4 w-4 items-center justify-center rounded text-t3 hover:bg-hover hover:text-err"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className={cx('truncate font-medium', active ? 'text-override' : 'text-t3')}>{VARIANT_LABEL(v)}</span>
              </div>
              <div className={cx('flex min-w-0 flex-1 items-center justify-end gap-2', !active && 'opacity-60')}>{control(vv ?? fallback, write(v))}</div>
            </div>
          );
        })}
    </div>
  );
}

function Section({ title, section, children }: { title: string; section: SectionKey; children: ReactNode }) {
  useLang();
  const ui = useUI();
  const label = sectionVariantLabel(section);
  const scope = label ? ui.sectionScope[section] : 'all';
  return (
    <section className="border-b border-sep px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-semibold">{title}</h3>
        <select
          aria-label={`${title}: ${t('appliesTo')}`}
          value={scope}
          disabled={!label}
          onChange={(e) => ui.set({ sectionScope: { ...ui.sectionScope, [section]: e.target.value } })}
          className={cx('h-[22px] rounded-[5px] bg-control px-2 text-[11px] outline-none disabled:opacity-50', scope === 'variant' && 'text-override')}
        >
          <option value="all">{t('all')}</option>
          {label && <option value="variant">{label}</option>}
        </select>
      </div>
      {scope === 'variant' && <p className="m-0 mb-1 text-[11px] text-override">{t('editingVariant', { v: label ?? '' })}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- controls per attribute

type FillKind = 'automatic' | 'none' | 'solid' | 'gradient' | 'automatic-gradient' | 'system-light' | 'system-dark';

function fillKind(f: unknown, layer: boolean): FillKind {
  if (f === null || f === undefined) return 'automatic';
  if (typeof f === 'string') return (f === 'automatic' || f === 'none' || (!layer && (f === 'system-light' || f === 'system-dark')) ? f : 'automatic') as FillKind;
  const o = f as Record<string, unknown>;
  if ('solid' in o) return 'solid';
  if ('linear-gradient' in o) return 'gradient';
  if ('automatic-gradient' in o) return 'automatic-gradient';
  return 'automatic';
}

function FillControl({ value, set, layer }: { value: unknown; set: (v: unknown) => void; layer: boolean }) {
  const kind = fillKind(value, layer);
  const f = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const grad = (f['linear-gradient'] as string[] | undefined) ?? ['srgb:1,1,1,1', 'srgb:0,0,0,1'];
  const kinds: ({ value: FillKind; label: string } | '---')[] = [
    { value: 'automatic', label: t('automatic') },
    { value: 'none', label: t('none') },
    '---',
    { value: 'solid', label: t('solid') },
    { value: 'gradient', label: t('gradient') },
    ...(layer
      ? []
      : ([{ value: 'automatic-gradient', label: t('autoGradient') }, '---', { value: 'system-light', label: t('systemLight') }, { value: 'system-dark', label: t('systemDark') }] as ({ value: FillKind; label: string } | '---')[])),
  ];
  const seed = normalizeColorInput(kind === 'gradient' ? toHex(grad[0]) : toHex(f.solid ?? f['automatic-gradient'] ?? '#3D7BFF'));
  const setKind = (k: FillKind) => {
    if (k === 'automatic') set(layer ? null : 'automatic');
    else if (k === 'none') set('none');
    else if (k === 'solid') set({ solid: seed });
    else if (k === 'automatic-gradient') set({ 'automatic-gradient': seed });
    else if (k === 'gradient') set({ 'linear-gradient': [seed, normalizeColorInput('#0E2A8A')] });
    else set(k);
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Select label={t('fill')} value={kind} options={kinds} onChange={setKind} />
      {kind === 'solid' && <ColorAlpha value={f.solid} onChange={(c) => set({ ...f, solid: c })} label={t('fill')} />}
      {kind === 'automatic-gradient' && <ColorAlpha value={f['automatic-gradient']} onChange={(c) => set({ ...f, 'automatic-gradient': c })} label={t('fill')} />}
      {kind === 'gradient' && (
        <div className="group/grad relative flex flex-col gap-1.5 pl-5">
          <button
            type="button"
            aria-label={t('swapColors')}
            title={t('swapColors')}
            onClick={() => set({ ...f, 'linear-gradient': [grad[1], grad[0]] })}
            className="absolute top-2 left-0 flex h-8 w-4 items-center justify-center text-t3 opacity-0 group-hover/grad:opacity-100 hover:text-t1 focus:opacity-100"
          >
            <ArrowUpDown className="h-3 w-3" />
          </button>
          {[0, 1].map((i) => (
            <ColorAlpha
              key={i}
              label={i === 0 ? t('from') : t('to')}
              value={grad[i]}
              onChange={(c) => {
                const g = [...grad];
                g[i] = c;
                set({ ...f, 'linear-gradient': g });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColorAlpha({ value, onChange, label }: { value: unknown; onChange: (c: string) => void; label: string }) {
  const a = alphaOf(value);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <ColorWell label={label} value={toHex(value)} onChange={(h) => onChange(withAlpha(h, a))} />
      <NumberField className="w-14 shrink-0" label={`${label} ${t('opacity')}`} value={a} min={0} max={1} step={0.01} format={fmtPct} parse={parsePct} onChange={(v) => onChange(withAlpha(toHex(value), v))} />
    </div>
  );
}

function BlendSelect({ value, set }: { value: string; set: (v: unknown) => void }) {
  const opts = BLEND_MODES.map((m) => ({ value: m, label: m.replace(/(^|-)([a-z])/g, (_s, d, c: string) => (d ? ' ' : '') + c.toUpperCase()) }));
  return <Select label={t('blendMode')} value={value} onChange={(v) => set(v === 'normal' ? null : v)} options={[opts[0]!, '---', ...opts.slice(1)]} />;
}

/** 2D pad for refraction strength (x) and depth (y), like Icon Composer. */
function RefractionPad({ strength, depth, onChange }: { strength: number; depth: number; onChange: (s: number, d: number) => void }) {
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const d = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    onChange(Math.round(s * 100) / 100, Math.round(d * 100) / 100);
  };
  return (
    <div
      role="slider"
      aria-label={t('refraction')}
      aria-valuetext={`${t('strength')} ${fmtPct(strength)}, ${t('depth')} ${fmtPct(depth)}`}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e)}
      onKeyDown={(e) => {
        const st = e.shiftKey ? 0.1 : 0.01;
        if (e.key === 'ArrowRight') onChange(Math.min(1, +(strength + st).toFixed(2)), depth);
        if (e.key === 'ArrowLeft') onChange(Math.max(0, +(strength - st).toFixed(2)), depth);
        if (e.key === 'ArrowUp') onChange(strength, Math.min(1, +(depth + st).toFixed(2)));
        if (e.key === 'ArrowDown') onChange(strength, Math.max(0, +(depth - st).toFixed(2)));
      }}
      className="relative h-20 w-full cursor-crosshair rounded-md border border-hairline bg-control"
      style={{ backgroundImage: 'linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)', backgroundSize: '25% 25%' }}
    >
      <span className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: `${strength * 100}%`, bottom: `${depth * 100}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- inspectors

function DocumentStyle() {
  const ref: NodeRef = { kind: 'document' };
  return (
    <Section title={t('color')} section="color">
      <Setting nodeRef={ref} section="color" attr="fill" label={t('fill')} fallback={'automatic' as unknown} control={(v, set) => <FillControl value={v} set={set} layer={false} />} />
    </Section>
  );
}

function GroupStyle({ id }: { id: string }) {
  const ref: NodeRef = { kind: 'group', id };
  return (
    <>
      <Section title={t('color')} section="color">
        <Setting nodeRef={ref} section="color" attr="blend-mode" label={t('blendMode')} fallback="normal" control={(v, set) => <BlendSelect value={v} set={set} />} />
        <Setting nodeRef={ref} section="color" attr="opacity" label={t('opacity')} fallback={1} control={(v, set) => <Slider label={t('opacity')} value={v} onChange={set} format={fmtPct} parse={parsePct} defaultValue={1} />} />
      </Section>
      <Section title={t('liquidGlass')} section="glass">
        <Setting
          nodeRef={ref}
          section="glass"
          attr="lighting"
          label={t('mode')}
          fallback="combined"
          control={(v, set) => (
            <Select
              label={t('mode')}
              value={v}
              onChange={set}
              options={[
                { value: 'individual', label: t('individual') },
                { value: 'combined', label: t('combined') },
              ]}
            />
          )}
        />
        <Setting
          nodeRef={ref}
          section="glass"
          attr="specular"
          label={t('specular')}
          fallback={true as boolean | string}
          control={(v, set) => (
            <Select
              label={t('specular')}
              value={v === false ? 'off' : v === true ? 'automatic' : String(v)}
              onChange={(x) => set(x === 'off' ? false : x === 'automatic' ? true : x)}
              options={[
                { value: 'off', label: t('off') },
                { value: 'automatic', label: t('automatic') },
                { value: 'inside', label: t('inside') },
                { value: 'outside', label: t('outside') },
              ]}
            />
          )}
        />
        <Setting
          nodeRef={ref}
          section="glass"
          attr="blur-material"
          label={t('blur')}
          fallback={null as number | null}
          control={(v, set) => (
            <>
              <Toggle label={t('blur')} checked={v !== null} onChange={(on) => set(on ? 0.3 : null)} />
              <div className={cx('flex min-w-0 flex-1', v === null && 'pointer-events-none opacity-40')}>
                <Slider label={t('blur')} value={v ?? 0} onChange={set} format={fmtPct} parse={parsePct} defaultValue={0.3} />
              </div>
            </>
          )}
        />
        <Setting
          nodeRef={ref}
          section="glass"
          attr="refractivity"
          label={t('refraction')}
          fallback={null as { enabled: boolean; strength: number; depth: number } | null}
          control={(v, set) => {
            const r = v ?? { enabled: false, strength: 0.5, depth: 0.5 };
            return (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-end">
                  <Toggle label={t('refraction')} checked={!!v?.enabled} onChange={(on) => set(on ? { ...r, enabled: true } : null)} />
                </div>
                {v?.enabled && (
                  <>
                    <RefractionPad strength={r.strength} depth={r.depth} onChange={(s, d) => set({ ...r, strength: s, depth: d })} />
                    <div className="flex gap-1.5">
                      <NumberField className="flex-1" prefix={t('strength')} label={t('strength')} value={r.strength} min={0} max={1} format={fmtPct} parse={parsePct} onChange={(s) => set({ ...r, strength: s })} />
                      <NumberField className="flex-1" prefix={t('depth')} label={t('depth')} value={r.depth} min={0} max={1} format={fmtPct} parse={parsePct} onChange={(d) => set({ ...r, depth: d })} />
                    </div>
                  </>
                )}
              </div>
            );
          }}
        />
        <Setting
          nodeRef={ref}
          section="glass"
          attr="translucency"
          label={t('translucency')}
          fallback={{ enabled: true, value: 0.5 }}
          control={(v, set) => (
            <>
              <Toggle label={t('translucency')} checked={v.enabled} onChange={(on) => set({ ...v, enabled: on })} />
              <div className={cx('flex min-w-0 flex-1', !v.enabled && 'pointer-events-none opacity-40')}>
                <Slider label={t('translucency')} value={v.value} onChange={(x) => set({ ...v, value: x })} format={fmtPct} parse={parsePct} defaultValue={0.5} />
              </div>
            </>
          )}
        />
        <Setting
          nodeRef={ref}
          section="glass"
          attr="shadow"
          label={t('shadow')}
          fallback={{ kind: 'neutral', opacity: 0.5 } as { kind: string; opacity: number }}
          control={(v, set) => (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Select
                label={t('shadow')}
                value={v.kind}
                onChange={(k) => set({ ...v, kind: k })}
                options={[
                  { value: 'none', label: t('none') },
                  { value: 'neutral', label: t('neutral') },
                  { value: 'layer-color', label: t('chromatic') },
                ]}
              />
              {v.kind !== 'none' && <Slider label={`${t('shadow')} ${t('opacity')}`} value={v.opacity} onChange={(o) => set({ ...v, opacity: o })} format={fmtPct} parse={parsePct} defaultValue={0.5} />}
            </div>
          )}
        />
      </Section>
      <CompositionSection nodeRef={ref} />
    </>
  );
}

function LayerStyle({ id }: { id: string }) {
  const ref: NodeRef = { kind: 'layer', id };
  return (
    <>
      <Section title={t('color')} section="color">
        <Setting nodeRef={ref} section="color" attr="fill" label={t('fill')} fallback={null as unknown} control={(v, set) => <FillControl value={v} set={set} layer />} />
        <Setting nodeRef={ref} section="color" attr="blend-mode" label={t('blendMode')} fallback="normal" control={(v, set) => <BlendSelect value={v} set={set} />} />
        <Setting nodeRef={ref} section="color" attr="opacity" label={t('opacity')} fallback={1} control={(v, set) => <Slider label={t('opacity')} value={v} onChange={set} format={fmtPct} parse={parsePct} defaultValue={1} />} />
      </Section>
      <Section title={t('liquidGlass')} section="glass">
        <Setting nodeRef={ref} section="glass" attr="glass" label={t('effects')} fallback={false} control={(v, set) => <Toggle label={t('effects')} checked={v} onChange={(on) => set(on)} />} />
      </Section>
      <CompositionSection nodeRef={ref} />
    </>
  );
}

function CompositionSection({ nodeRef }: { nodeRef: NodeRef }) {
  const doc = useDoc((s) => s.doc);
  const isLayer = nodeRef.kind === 'layer';
  return (
    <Section title={t('composition')} section="composition">
      <Setting nodeRef={nodeRef} section="composition" attr="hidden" label={t('visible')} fallback={false} control={(v, set) => <Toggle label={t('visible')} checked={!v} onChange={(on) => set(on ? null : true)} />} />
      {isLayer && (
        <Setting
          nodeRef={nodeRef}
          section="composition"
          attr="image-name"
          label={t('image')}
          fallback=""
          control={(v, set) => (
            <Select
              label={t('image')}
              value={v}
              onChange={async (x) => {
                if (x !== '__replace') return set(x);
                const files = await getPlatform().pickImages();
                const f = files[0];
                if (!f) return;
                const asset = makeAsset(f.name, f.bytes);
                let stored = '';
                useDoc.getState().mutate((d) => {
                  let name = asset.name;
                  let i = 2;
                  while (d.assets[name]) name = asset.name.replace(/(\.[a-z0-9]+)?$/i, ` ${i++}$1`);
                  d.assets[name] = { ...asset, name };
                  stored = name;
                });
                set(stored);
              }}
              options={[...Object.keys(doc.assets).map((k) => ({ value: k, label: k })), '---', { value: '__replace', label: t('replace') }]}
            />
          )}
        />
      )}
      <Setting
        nodeRef={nodeRef}
        section="composition"
        attr="position"
        label={t('layout')}
        fallback={{ scale: 1, 'translation-in-points': [0, 0] } as Position}
        control={(p, set) => {
          const [x, y] = p['translation-in-points'] ?? [0, 0];
          const write = (np: Position) => set(np.scale === 1 && np['translation-in-points'][0] === 0 && np['translation-in-points'][1] === 0 ? null : np);
          const f1 = (v: number) => String(Math.round(v * 10) / 10);
          return (
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
              <NumberField prefix="X" label="X" value={x} step={1} format={f1} onChange={(v) => write({ ...p, 'translation-in-points': [v, y] })} />
              <NumberField prefix="Y" label="Y" value={y} step={1} format={f1} onChange={(v) => write({ ...p, 'translation-in-points': [x, v] })} />
              <NumberField label={t('scale')} value={p.scale ?? 1} min={0.05} max={10} step={0.01} format={fmtPct} parse={parsePct} onChange={(v) => write({ ...p, scale: v })} />
            </div>
          );
        }}
      />
    </Section>
  );
}

function DocumentInspector() {
  const doc = useDoc((s) => s.doc);
  const plat = (baseValue(doc.props['supported-platforms']) as { squares?: unknown; circles?: string[] } | undefined) ?? { squares: 'shared' };
  const cs = (baseValue(doc.props['color-space-for-untagged-svg-colors']) as string | undefined) ?? 'display-p3';
  const squares = plat.squares === 'shared' ? 'shared' : Array.isArray(plat.squares) ? (plat.squares.includes('iOS') ? 'iOS' : plat.squares.includes('macOS') ? 'macOS' : 'off') : 'off';
  const setPlat = (p: { squares?: unknown; circles?: string[] }) => {
    const clean: Record<string, unknown> = {};
    if (p.circles?.length) clean.circles = p.circles;
    if (p.squares !== undefined) clean.squares = p.squares;
    useDoc.getState().setProp({ kind: 'document' }, 'supported-platforms', clean);
  };
  return (
    <section className="border-b border-sep px-4 py-3">
      <h3 className="m-0 mb-2 text-[13px] font-semibold">{t('platforms')}</h3>
      <div className="flex min-h-8 items-center gap-2">
        <span className="w-[104px] shrink-0 text-xs text-t2">iOS, macOS</span>
        <Select
          label="iOS, macOS"
          value={squares}
          onChange={(v) => setPlat({ ...plat, squares: v === 'shared' ? 'shared' : v === 'off' ? undefined : [v] })}
          options={[
            { value: 'shared', label: 'iOS & macOS' },
            { value: 'iOS', label: t('iosOnly') },
            { value: 'macOS', label: t('macosOnly') },
            '---',
            { value: 'off', label: t('off') },
          ]}
        />
      </div>
      <div className="flex min-h-8 items-center gap-2">
        <span className="w-[104px] shrink-0 text-xs text-t2">watchOS</span>
        <div className="flex flex-1 justify-end">
          <Toggle label="watchOS" checked={(plat.circles ?? []).includes('watchOS')} onChange={(on) => setPlat({ ...plat, circles: on ? ['watchOS'] : [] })} />
        </div>
      </div>
      <div className="flex min-h-8 items-center gap-2">
        <span className="w-[104px] shrink-0 text-xs text-t2">{t('colorSpace')}</span>
        <Select
          label={t('colorSpace')}
          value={cs}
          onChange={(v) => useDoc.getState().setProp({ kind: 'document' }, 'color-space-for-untagged-svg-colors', v)}
          options={[
            { value: 'display-p3', label: 'Display P3' },
            { value: 'srgb', label: 'sRGB' },
          ]}
        />
      </div>
    </section>
  );
}

function SelectionHeader() {
  const doc = useDoc((s) => s.doc);
  const docName = useDoc((s) => s.name);
  const { selection } = useUI();
  let kind = t('icon');
  let name = docName;
  if (selection.kind === 'group') {
    const g = findGroup(doc, selection.id);
    kind = t('group');
    name = g ? nameOf(g) : '';
  } else if (selection.kind === 'layer') {
    const f = findLayer(doc, selection.id);
    kind = t('layer');
    name = f ? nameOf(f.layer) : '';
  }
  return (
    <div className="border-b border-sep px-4 py-2.5">
      <div className="text-[11px] tracking-[0.4px] text-t3 uppercase">{kind}</div>
      <button
        type="button"
        className="max-w-full truncate text-left text-[13px] font-semibold"
        title={t('rename')}
        onDoubleClick={() => selection.kind !== 'document' && useRename.getState().set(selection.id)}
      >
        {name}
      </button>
    </div>
  );
}

export function Inspector() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const { selection, inspectorTab, set } = useUI();
  let body: ReactNode;
  if (inspectorTab === 'document') body = <DocumentInspector />;
  else if (selection.kind === 'group' && findGroup(doc, selection.id)) body = <GroupStyle id={selection.id} />;
  else if (selection.kind === 'layer' && findLayer(doc, selection.id)) body = <LayerStyle id={selection.id} />;
  else body = <DocumentStyle />;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-sep bg-sidebar" aria-label="Inspector">
      <div className="flex justify-center border-b border-sep px-4 py-2.5">
        <Segmented
          label="Inspector"
          className="w-full"
          value={inspectorTab}
          onChange={(v) => set({ inspectorTab: v })}
          options={[
            {
              value: 'style',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Paintbrush className="h-3.5 w-3.5" />
                  {t('style')}
                </span>
              ),
            },
            {
              value: 'document',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {t('document')}
                </span>
              ),
            },
          ]}
        />
      </div>
      {inspectorTab === 'style' && <SelectionHeader />}
      <div className="flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}

export { coreSetProp };
