import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addAsset,
  addGroup,
  addLayer,
  createDocument,
  duplicateNode,
  makeAsset,
  recolor,
  resolvePath,
  setProp,
  withAlpha,
  writeBundle,
  MAX_GROUPS,
} from '../src/index';
import { saveIcon } from '../src/node';

const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

describe('hardening', () => {
  it('never writes or deletes through a symlinked Assets folder', async () => {
    const base = mkdtempSync(join(tmpdir(), 'fresnel-'));
    const outside = join(base, 'outside');
    const bundle = join(base, 'A.icon');
    mkdirSync(outside);
    mkdirSync(bundle);
    writeFileSync(join(outside, 'precious.txt'), 'keep');
    symlinkSync(outside, join(bundle, 'Assets'));
    const doc = createDocument();
    addLayer(doc, addGroup(doc).id, makeAsset('layer.svg', svg));
    await expect(saveIcon(bundle, doc)).rejects.toThrow(/symbolic link/);
    expect(existsSync(join(outside, 'precious.txt'))).toBe(true);
    expect(existsSync(join(outside, 'layer.svg'))).toBe(false);
  });

  it('writeBundle leaves the document untouched', () => {
    const doc = createDocument();
    const g = addGroup(doc);
    setProp(doc, { kind: 'group', id: g.id }, 'specular', 'inside');
    writeBundle(doc);
    expect(doc.props.features).toBeUndefined();
    expect(new TextDecoder().decode(writeBundle(doc)['icon.json'])).toContain('specular-location');
  });

  it('warns (V-09) instead of refusing more than 4 groups', async () => {
    const { validate } = await import('../src/index');
    const doc = createDocument();
    for (let i = 0; i <= MAX_GROUPS; i++) addGroup(doc);
    const v = validate(doc).find((i) => i.id === 'V-09');
    expect(v?.severity).toBe('warning');
  });

  it('gives new layers Liquid Glass, like Icon Composer', () => {
    const doc = createDocument();
    const l = addLayer(doc, addGroup(doc).id, makeAsset('a.svg', svg));
    expect(l.props.glass?.plain?.value).toBe(true);
  });

  it('resolves "light" specializations for the Default appearance', async () => {
    const { resolveProp } = await import('../src/index');
    const p = { specs: [{ appearance: 'light', value: true }] };
    expect(resolveProp(p, { appearance: 'default' }, false)).toBe(true);
    expect(resolveProp(p, { appearance: 'dark' }, false)).toBe(false);
  });

  it('reports missing nodes as OpError', () => {
    expect(() => duplicateNode(createDocument(), { kind: 'layer', id: 'nope' })).toThrow('Layer not found');
  });

  it('cleans names and asset names', () => {
    const doc = createDocument();
    const g = addGroup(doc, { name: 'a/b' });
    expect(resolvePath(doc, 'a-b')).toEqual({ kind: 'group', id: g.id });
    expect(addAsset(doc, makeAsset('.hidden.svg', svg))).toBe('hidden.svg');
    expect(addAsset(doc, makeAsset('..', svg))).toBe('image');
  });

  it('keeps color space and alpha when recoloring', () => {
    expect(recolor('display-p3:1,0.2,0.1,0.5', '#FF0000')).toMatch(/^display-p3:.*,0\.50000$/);
    expect(withAlpha('display-p3:1,0.20000,0.10000,1', 0.3)).toBe('display-p3:1.00000,0.20000,0.10000,0.30000');
  });
});

describe('align and distribute', () => {
  const box = (w: number, h: number) => makeAsset(`r${w}x${h}.svg`, new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"/>`));
  const setup = async () => {
    const core = await import('../src/index');
    const doc = createDocument();
    const g = addGroup(doc, { name: 'G' });
    const pos = (x: number, y: number) => ({ position: { scale: 1, 'translation-in-points': [x, y] } });
    const a = addLayer(doc, g.id, box(100, 100), { name: 'A', props: pos(-300, -200) });
    const b = addLayer(doc, g.id, box(200, 100), { name: 'B', props: pos(0, 0) });
    const c = addLayer(doc, g.id, box(100, 100), { name: 'C', props: pos(350, 120) });
    const refs = [a, b, c].map((l) => ({ kind: 'layer' as const, id: l.id }));
    const ctx = { appearance: 'default' as const };
    return { core, doc, g, refs, ctx };
  };

  it('aligns left edges to the selection and centers to the canvas', async () => {
    const { core, doc, refs, ctx } = await setup();
    core.alignNodes(doc, refs, 'left', ctx);
    const xs = refs.map((r) => core.boxOf(doc, r, ctx)!.x);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(1);
    core.alignNodes(doc, [refs[1]!], 'vcenter', ctx);
    const b = core.boxOf(doc, refs[1]!, ctx)!;
    expect(b.y + b.h / 2).toBeCloseTo(512);
  });

  it('distributes centers evenly and keeps the ends', async () => {
    const { core, doc, refs, ctx } = await setup();
    const before = refs.map((r) => core.boxOf(doc, r, ctx)!);
    core.alignNodes(doc, [refs[1]!], 'hcenter', ctx); // move B off the middle first
    core.setProp(doc, refs[1]!, 'position', { scale: 1, 'translation-in-points': [-250, 0] });
    core.distributeNodes(doc, refs, 'horizontal', ctx);
    const after = refs.map((r) => core.boxOf(doc, r, ctx)!);
    const cx = (b: { x: number; w: number }) => b.x + b.w / 2;
    expect(cx(after[0]!)).toBeCloseTo(cx(before[0]!));
    expect(cx(after[2]!)).toBeCloseTo(cx(before[2]!));
    expect(cx(after[1]!) - cx(after[0]!)).toBeCloseTo(cx(after[2]!) - cx(after[1]!));
  });

  it('accounts for the group scale when moving a layer', async () => {
    const { core, doc, g, refs, ctx } = await setup();
    core.setProp(doc, { kind: 'group', id: g.id }, 'position', { scale: 0.5, 'translation-in-points': [0, 0] });
    core.alignNodes(doc, [refs[0]!], 'left', ctx);
    expect(core.boxOf(doc, refs[0]!, ctx)!.x).toBeCloseTo(0);
  });

  it('groups several layers into one new group in front-to-back order', async () => {
    const { core, doc, refs } = await setup();
    const ng = core.groupLayers(doc, [refs[2]!.id, refs[0]!.id]);
    // layers added later are in front (index 0), so C is in front of A
    expect(ng.layers.map((l) => core.nameOf(l))).toEqual(['C', 'A']);
  });
});
