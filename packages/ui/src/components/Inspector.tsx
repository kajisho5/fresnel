import type { ReactNode } from 'react';
import {
  BLEND_MODES,
  appearanceKeys,
  baseValue,
  findGroup,
  findLayer,
  hasOverride,
  nameOf,
  normalizeColorInput,
  parseColor,
  resolveProp,
  rgbaToHex,
  setProp as coreSetProp,
  toRGBA,
  type AppearanceKey,
  type IconDocument,
  type NodeRef,
  type Position,
  type PropMap,
  type Shadow,
  type Translucency,
} from '@fresnel/core';
import { useDoc } from '../store/doc';
import { useUI } from '../store/ui';
import { t, useLang } from '../i18n';
import { ColorWell, NumberField, Row, Section, Segmented, Select, Slider, Toggle } from './controls';

function propsOf(doc: IconDocument, ref: NodeRef): PropMap | null {
  if (ref.kind === 'document') return doc.props;
  if (ref.kind === 'group') return findGroup(doc, ref.id)?.props ?? null;
  return findLayer(doc, ref.id)?.layer.props ?? null;
}

/** Binds an attribute to the current appearance / scope. */
function useAttr<T>(ref: NodeRef, key: string, fallback: T) {
  const doc = useDoc((s) => s.doc);
  const { appearance, scope } = useUI();
  const props = propsOf(doc, ref);
  const ak: AppearanceKey | undefined = appearanceKeys(appearance)[0];
  const value = resolveProp<T>(props?.[key], { appearance }, fallback) ?? fallback;
  const overridden = !!ak && hasOverride(props?.[key], ak);
  const writeKey = scope === 'current' && ak ? ak : undefined;
  return {
    value,
    overridden,
    set: (v: unknown) => {
      try {
        useDoc.getState().setProp(ref, key, v, writeKey);
      } catch (e) {
        useUI.getState().toast('error', (e as Error).message);
      }
    },
    reset: () => ak && useDoc.getState().resetOverride(ref, key, ak),
  };
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const parsePct = (s: string) => Number(s.replace('%', '')) / 100;
const toHex = (c: unknown) => {
  const p = typeof c === 'string' ? parseColor(c) : null;
  return p ? rgbaToHex(toRGBA(p)) : '#FFFFFF';
};

type FillKind = 'original' | 'automatic' | 'system-light' | 'system-dark' | 'none' | 'solid' | 'automatic-gradient' | 'linear-gradient';

function fillKind(f: unknown): FillKind {
  if (f === null || f === undefined) return 'original';
  if (typeof f === 'string') return f as FillKind;
  const o = f as Record<string, unknown>;
  if ('solid' in o) return 'solid';
  if ('automatic-gradient' in o) return 'automatic-gradient';
  if ('linear-gradient' in o) return 'linear-gradient';
  return 'automatic';
}

function FillEditor({ nodeRef, layer }: { nodeRef: NodeRef; layer?: boolean }) {
  const a = useAttr<unknown>(nodeRef, 'fill', layer ? null : 'automatic');
  const kind = fillKind(a.value);
  const f = (a.value ?? {}) as Record<string, unknown>;
  const kinds: ({ value: FillKind; label: string } | '---')[] = layer
    ? [{ value: 'original', label: t('original') }, '---', { value: 'solid', label: t('solid') }, { value: 'automatic-gradient', label: t('autoGradient') }, { value: 'linear-gradient', label: t('gradient') }]
    : [
        { value: 'automatic', label: t('automatic') },
        { value: 'system-light', label: t('systemLight') },
        { value: 'system-dark', label: t('systemDark') },
        '---',
        { value: 'solid', label: t('solid') },
        { value: 'automatic-gradient', label: t('autoGradient') },
        { value: 'linear-gradient', label: t('gradient') },
      ];
  const setKind = (k: FillKind) => {
    const c1 = normalizeColorInput(kind === 'linear-gradient' ? toHex((f['linear-gradient'] as string[])[0]) : toHex(f.solid ?? f['automatic-gradient'] ?? '#3D7BFF'));
    if (k === 'original') a.set(null);
    else if (k === 'solid') a.set({ solid: c1 });
    else if (k === 'automatic-gradient') a.set({ 'automatic-gradient': c1 });
    else if (k === 'linear-gradient') a.set({ 'linear-gradient': [c1, normalizeColorInput('#0E2A8A')] });
    else a.set(k);
  };
  return (
    <>
      <Row label={t('fill')} overridden={a.overridden} onReset={a.reset}>
        <Select label={t('fill')} value={kind} options={kinds} onChange={setKind} />
      </Row>
      {kind === 'solid' && (
        <Row label="">
          <ColorWell label={t('fill')} value={toHex(f.solid)} onChange={(h) => a.set({ ...f, solid: normalizeColorInput(h) })} />
        </Row>
      )}
      {kind === 'automatic-gradient' && (
        <Row label="">
          <ColorWell label={t('fill')} value={toHex(f['automatic-gradient'])} onChange={(h) => a.set({ ...f, 'automatic-gradient': normalizeColorInput(h) })} />
        </Row>
      )}
      {kind === 'linear-gradient' && (
        <>
          {[0, 1].map((i) => (
            <Row key={i} label={i === 0 ? 'Top' : 'Bottom'}>
              <ColorWell
                label={`${t('gradient')} ${i + 1}`}
                value={toHex((f['linear-gradient'] as string[])[i])}
                onChange={(h) => {
                  const g = [...(f['linear-gradient'] as string[])];
                  g[i] = normalizeColorInput(h);
                  a.set({ ...f, 'linear-gradient': g });
                }}
              />
            </Row>
          ))}
        </>
      )}
    </>
  );
}

function OpacityRow({ nodeRef }: { nodeRef: NodeRef }) {
  const a = useAttr<number>(nodeRef, 'opacity', 1);
  return (
    <Row label={t('opacity')} overridden={a.overridden} onReset={a.reset}>
      <Slider label={t('opacity')} value={a.value} onChange={a.set} format={fmtPct} parse={parsePct} defaultValue={1} />
    </Row>
  );
}

function BlendRow({ nodeRef }: { nodeRef: NodeRef }) {
  const a = useAttr<string>(nodeRef, 'blend-mode', 'normal');
  const opts = BLEND_MODES.map((m) => ({ value: m, label: m.replace(/(^|-)([a-z])/g, (_s, d, c: string) => (d ? ' ' : '') + c.toUpperCase()) }));
  return (
    <Row label={t('blendMode')} overridden={a.overridden} onReset={a.reset}>
      <Select label={t('blendMode')} value={a.value} onChange={(v) => a.set(v === 'normal' ? null : v)} options={[opts[0]!, '---', ...opts.slice(1)]} />
    </Row>
  );
}

function PositionRows({ nodeRef }: { nodeRef: NodeRef }) {
  const a = useAttr<Position>(nodeRef, 'position', { scale: 1, 'translation-in-points': [0, 0] });
  const p = a.value;
  const [x, y] = p['translation-in-points'] ?? [0, 0];
  const write = (np: Position) => a.set(np.scale === 1 && np['translation-in-points'][0] === 0 && np['translation-in-points'][1] === 0 ? null : np);
  return (
    <>
      <Row label={t('scale')} overridden={a.overridden} onReset={a.reset}>
        <NumberField className="flex-1" label={t('scale')} value={p.scale ?? 1} min={0.05} max={10} step={0.01} format={fmtPct} parse={parsePct} onChange={(v) => write({ ...p, scale: v })} />
      </Row>
      <Row label={t('offset')}>
        <NumberField className="flex-1" prefix="X" label="X" value={x} step={1} format={(v) => String(Math.round(v * 10) / 10)} onChange={(v) => write({ ...p, 'translation-in-points': [v, y] })} />
        <NumberField className="flex-1" prefix="Y" label="Y" value={y} step={1} format={(v) => String(Math.round(v * 10) / 10)} onChange={(v) => write({ ...p, 'translation-in-points': [x, v] })} />
      </Row>
    </>
  );
}

function NameRow({ nodeRef }: { nodeRef: NodeRef }) {
  const doc = useDoc((s) => s.doc);
  const props = propsOf(doc, nodeRef);
  const v = (baseValue(props?.name) as string) ?? '';
  return (
    <Row label={t('name')}>
      <input
        key={v}
        aria-label={t('name')}
        defaultValue={v}
        onBlur={(e) => e.target.value.trim() && e.target.value !== v && useDoc.getState().rename(nodeRef, e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-[22px] min-w-0 flex-1 rounded-[5px] bg-control px-2.5 text-xs outline-none"
      />
    </Row>
  );
}

function GroupInspector({ id }: { id: string }) {
  const ref: NodeRef = { kind: 'group', id };
  const doc = useDoc((s) => s.doc);
  const g = findGroup(doc, id);
  const { appearance } = useUI();
  const specular = useAttr<boolean>(ref, 'specular', true);
  const tr = useAttr<Translucency>(ref, 'translucency', { enabled: true, value: 0.5 });
  const blur = useAttr<number | null>(ref, 'blur-material', null);
  const lighting = useAttr<string>(ref, 'lighting', 'combined');
  const shadow = useAttr<Shadow>(ref, 'shadow', { kind: 'neutral', opacity: 0.5 });
  if (!g) return null;
  const glassOn = g.layers.some((l) => resolveProp(l.props.glass, { appearance }, false));
  const setGlass = (v: boolean) =>
    useDoc.getState().mutate((d) => {
      for (const l of findGroup(d, id)?.layers ?? []) setLayerGlass(d, l.id, v);
    });
  return (
    <>
      <Section title={t('group')}>
        <NameRow nodeRef={ref} />
      </Section>
      <Section title={t('liquidGlass')}>
        <Row label={t('glass')}>
          <Toggle label={t('glass')} checked={glassOn} onChange={setGlass} />
        </Row>
        <Row label={t('specular')} overridden={specular.overridden} onReset={specular.reset}>
          <Toggle label={t('specular')} checked={specular.value} onChange={specular.set} />
        </Row>
        <Row label={t('translucency')} overridden={tr.overridden} onReset={tr.reset}>
          <Slider label={t('translucency')} value={tr.value.enabled ? tr.value.value : 0} onChange={(v) => tr.set({ enabled: v > 0, value: v > 0 ? v : tr.value.value })} defaultValue={0.5} />
        </Row>
        <Row label={t('blur')} overridden={blur.overridden} onReset={blur.reset}>
          <Slider label={t('blur')} value={blur.value ?? 0} onChange={(v) => blur.set(v)} defaultValue={0} />
        </Row>
        <Row label={t('lighting')} overridden={lighting.overridden} onReset={lighting.reset}>
          <Segmented
            size="sm"
            className="flex-1"
            label={t('lighting')}
            value={lighting.value as 'combined' | 'individual'}
            onChange={lighting.set}
            options={[
              { value: 'combined', label: t('combined') },
              { value: 'individual', label: t('individual') },
            ]}
          />
        </Row>
      </Section>
      <Section title={t('shadow')}>
        <Row label={t('kind')} overridden={shadow.overridden} onReset={shadow.reset}>
          <Select
            label={t('kind')}
            value={shadow.value.kind}
            onChange={(k) => shadow.set({ ...shadow.value, kind: k })}
            options={[
              { value: 'none', label: t('none') },
              { value: 'neutral', label: t('neutral') },
              { value: 'layer-color', label: t('layerColor') },
            ]}
          />
        </Row>
        <Row label={t('opacity')}>
          <Slider label={`${t('shadow')} ${t('opacity')}`} value={shadow.value.opacity} onChange={(v) => shadow.set({ ...shadow.value, opacity: v })} defaultValue={0.5} />
        </Row>
      </Section>
      <Section title={t('compositing')}>
        <OpacityRow nodeRef={ref} />
        <BlendRow nodeRef={ref} />
      </Section>
      <Section title={t('position')}>
        <PositionRows nodeRef={ref} />
      </Section>
    </>
  );
}

function setLayerGlass(d: IconDocument, layerId: string, v: boolean) {
  const { scope, appearance } = useUI.getState();
  const ak = appearanceKeys(appearance)[0];
  coreSetProp(d, { kind: 'layer', id: layerId }, 'glass', v, scope === 'current' && ak ? ak : undefined);
}

function LayerInspector({ id }: { id: string }) {
  const ref: NodeRef = { kind: 'layer', id };
  const doc = useDoc((s) => s.doc);
  const glass = useAttr<boolean>(ref, 'glass', false);
  const hidden = useAttr<boolean>(ref, 'hidden', false);
  const image = useAttr<string>(ref, 'image-name', '');
  const f = findLayer(doc, id);
  if (!f) return null;
  const asset = doc.assets[image.value];
  return (
    <>
      <Section title={t('layer')}>
        <NameRow nodeRef={ref} />
        <Row label={t('image')} overridden={image.overridden} onReset={image.reset}>
          <Select label={t('image')} value={image.value} onChange={image.set} options={Object.keys(doc.assets).map((k) => ({ value: k, label: k }))} />
        </Row>
        {asset && (
          <p className="pb-1 pl-[104px] text-[11px] text-t3">
            {asset.kind.toUpperCase()} · {Math.round(asset.width)}×{Math.round(asset.height)}
          </p>
        )}
        <Row label={t('hidden')} overridden={hidden.overridden} onReset={hidden.reset}>
          <Toggle label={t('hidden')} checked={hidden.value} onChange={hidden.set} />
        </Row>
      </Section>
      <Section title={t('liquidGlass')}>
        <Row label={t('glass')} overridden={glass.overridden} onReset={glass.reset}>
          <Toggle label={t('glass')} checked={glass.value} onChange={glass.set} />
        </Row>
        <FillEditor nodeRef={ref} layer />
      </Section>
      <Section title={t('compositing')}>
        <OpacityRow nodeRef={ref} />
        <BlendRow nodeRef={ref} />
      </Section>
      <Section title={t('position')}>
        <PositionRows nodeRef={ref} />
      </Section>
    </>
  );
}

function DocumentInspector() {
  const ref: NodeRef = { kind: 'document' };
  const platforms = useAttr<{ squares?: unknown; circles?: string[] }>(ref, 'supported-platforms', { squares: 'shared' });
  const cs = useAttr<string>(ref, 'color-space-for-untagged-svg-colors', 'display-p3');
  const watch = (platforms.value.circles ?? []).includes('watchOS');
  return (
    <>
      <Section title={t('background')}>
        <FillEditor nodeRef={ref} />
      </Section>
      <Section title={t('platforms')}>
        <Row label="iOS · macOS">
          <Toggle label="iOS, iPadOS, macOS" checked={platforms.value.squares !== undefined} onChange={(v) => platforms.set(v ? { ...platforms.value, squares: 'shared' } : { circles: platforms.value.circles ?? [] })} />
        </Row>
        <Row label="watchOS">
          <Toggle label="watchOS" checked={watch} onChange={(v) => platforms.set({ ...platforms.value, circles: v ? ['watchOS'] : [] })} />
        </Row>
        <Row label={t('colorSpace')}>
          <Select
            label={t('colorSpace')}
            value={cs.value}
            onChange={cs.set}
            options={[
              { value: 'display-p3', label: 'Display P3' },
              { value: 'srgb', label: 'sRGB' },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

export function Inspector() {
  useLang();
  const doc = useDoc((s) => s.doc);
  const { selection, select, scope, appearance, set } = useUI();
  const ak = appearanceKeys(appearance)[0];
  const tab = selection.kind;
  const firstGroup = doc.groups[0];
  const firstLayer = firstGroup?.layers[0];
  const crumb =
    selection.kind === 'group'
      ? nameOf(findGroup(doc, selection.id) ?? { id: '', props: {}, order: [], layers: [] })
      : selection.kind === 'layer'
        ? (() => {
            const f = findLayer(doc, selection.id);
            return f ? `${nameOf(f.group)} / ${nameOf(f.layer)}` : '';
          })()
        : '';
  let body: ReactNode;
  if (selection.kind === 'group' && findGroup(doc, selection.id)) body = <GroupInspector id={selection.id} />;
  else if (selection.kind === 'layer' && findLayer(doc, selection.id)) body = <LayerInspector id={selection.id} />;
  else body = <DocumentInspector />;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-sep bg-sidebar" aria-label="Inspector">
      <div className="px-4 pt-3.5">
        <Segmented
          label="Inspector"
          value={tab}
          onChange={(k) => {
            if (k === 'document') select({ kind: 'document' });
            if (k === 'group' && firstGroup) select({ kind: 'group', id: selection.kind === 'layer' ? (findLayer(doc, selection.id)?.group.id ?? firstGroup.id) : firstGroup.id });
            if (k === 'layer' && firstLayer) select({ kind: 'layer', id: firstLayer.id });
          }}
          options={[
            { value: 'document', label: t('document') },
            { value: 'group', label: t('group') },
            { value: 'layer', label: t('layer') },
          ]}
        />
      </div>
      <div className="flex items-center gap-3 border-b border-sep px-4 pt-3.5 pb-3">
        <span className="w-[84px] shrink-0 text-xs text-t2">{t('appliesTo')}</span>
        <Segmented
          size="sm"
          className="flex-1"
          label={t('appliesTo')}
          value={ak ? scope : 'all'}
          onChange={(s) => set({ scope: s })}
          options={[
            { value: 'all', label: t('all') },
            { value: 'current', label: t('current'), title: ak ? `${t('editingAppearance')} ${ak}` : 'Default uses the base values' },
          ]}
        />
      </div>
      {ak && scope === 'current' && (
        <div className="flex items-center gap-1.5 border-b border-sep bg-override/10 px-4 py-1.5 text-[11px] text-override">
          <span className="h-1.5 w-1.5 rounded-full bg-override" />
          {t('editingAppearance')} {ak}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{body}</div>
      {crumb && <div className="border-t border-sep px-4 py-2 text-[11px] text-t3">{crumb}</div>}
    </aside>
  );
}
