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
