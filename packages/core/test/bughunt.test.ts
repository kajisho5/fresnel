/** Regressions for the bugs found in the v0.2.0 bug hunt (core). */
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  addAsset,
  addGroup,
  addLayer,
  baseValue,
  boxOf,
  createDocument,
  groupLayer,
  groupLayers,
  makeAsset,
  moveBy,
  pngSize,
  readBundle,
  removeNode,
  resolvePath,
  sanitizeSvg,
  setProp,
  setPropValue,
  validate,
  variantValue,
  writeBundle,
  type IconDocument,
} from '../src/index';
import { loadIcon, saveIcon } from '../src/node';

const svgOf = (body: string, attrs = 'viewBox="0 0 1024 1024"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const asset = (name: string, body = '<rect width="200" height="200"/>', attrs = 'width="200" height="200"') => makeAsset(name, strToU8(svgOf(body, attrs)));

function docWith(...names: string[]) {
  const doc = createDocument();
  const g = addGroup(doc, { name: 'G' });
  for (const n of names) addLayer(doc, g.id, asset(`${n}.svg`), { name: n });
  return { doc, g };
}

describe('SVG sanitizer', () => {
  it('never lets nested CSS escapes in <style> produce markup', () => {
    const enc = (s: string) => s.replace(/\\/g, '\\5c\\5c ').replace(/</g, '\\3c ');
    for (const layers of [1, 4, 5, 6, 9]) {
      let p = '</style><script>alert(1)</script><style>';
      for (let k = 0; k < layers; k++) p = enc(p);
      const out = sanitizeSvg(svgOf(`<style>a{x:"${p}"}</style>`));
      expect(out, `${layers} layers`).not.toMatch(/<script/i);
    }
  });
  it('keeps inline SVG and parameterised data images, drops image-set URLs', () => {
    const out = sanitizeSvg(
      svgOf('<image href="data:image/svg+xml;base64,PHN2Zy8+"/><image href="data:image/png;charset=utf-8;base64,iVBORw0K"/><rect style="background:image-set(\'https://evil.example/y.png\' 1x)"/>'),
    );
    expect(out).toContain('data:image/svg+xml;base64');
    expect(out).toContain('data:image/png;charset=utf-8;base64');
    expect(out).not.toMatch(/image-set/i);
  });
  it('writes decoded style values back as valid XML', () => {
    const out = sanitizeSvg(svgOf(`<text style="font-family:'A\\3c B'">x</text>`));
    expect(out).toContain('A&lt;B');
  });
  it('caps entity expansion', () => {
    const doc = `<!DOCTYPE svg [<!ENTITY a "${'x'.repeat(2000)}">]>` + svgOf('&a;'.repeat(5000));
    expect(sanitizeSvg(doc).length).toBeLessThan(6 * 1024 * 1024);
  });
});

describe('bundles', () => {
  it('reads the shallowest icon.json and survives a truncated PNG', () => {
    const json = (fill: string) => strToU8(JSON.stringify({ fill: { solid: fill }, groups: [] }));
    const doc = readBundle({ 'Backup/icon.json': json('srgb:1,0,0,1'), 'icon.json': json('srgb:0,0,1,1'), 'Assets/bad.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]) });
    expect(JSON.stringify(baseValue(doc.props.fill))).toContain('0,0,1');
    expect(pngSize(new Uint8Array(6))).toEqual({ width: 0, height: 0 });
  });
  it('keeps files it could not read, and writes icon.json last', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fresnel-bh-')), 'A.icon');
    mkdirSync(join(dir, 'Assets'), { recursive: true });
    writeFileSync(join(dir, 'icon.json'), JSON.stringify({ groups: [{ layers: [{ 'image-name': 'a:b.svg', name: 'x' }] }] }));
    writeFileSync(join(dir, 'Assets', 'a:b.svg'), svgOf(''));
    await saveIcon(dir, await loadIcon(dir));
    expect(readdirSync(join(dir, 'Assets'))).toEqual(['a:b.svg']);
    const { doc } = docWith('a');
    expect(Object.keys(writeBundle(doc)).at(-1)).toBe('icon.json');
  });
  it('round-trips odd specialization keys', () => {
    const raw = { 'fill-specializations': [], 'foo-specializations': 'x', groups: [] };
    const doc = readBundle({ 'icon.json': strToU8(JSON.stringify(raw)) });
    const out = JSON.parse(strFromU8(writeBundle(doc)['icon.json']!));
    expect(out['fill-specializations']).toEqual([]);
    expect(out['foo-specializations']).toBe('x');
  });
  it('writeBundle does not change the caller’s feature list', () => {
    const { doc, g } = docWith('a');
    setPropValue(doc.props, 'features', ['custom-x']);
    setProp(doc, { kind: 'group', id: g.id }, 'refractivity', { enabled: true, strength: 0.5, depth: 0.5 });
    writeBundle(doc);
    expect(baseValue(doc.props.features)).toEqual(['custom-x']);
  });
});

describe('ops', () => {
  it('removing a layer keeps other bundled assets nothing points at', () => {
    const { doc } = docWith('a', 'b');
    doc.assets['spare.svg'] = asset('spare.svg');
    removeNode(doc, resolvePath(doc, 'G/b'));
    expect(Object.keys(doc.assets).sort()).toEqual(['a.svg', 'spare.svg']);
  });
  it('names are unique regardless of case, and ambiguous paths are reported', () => {
    const doc = createDocument();
    addGroup(doc, { name: 'Group' });
    expect(addGroup(doc, { name: 'group' }).props.name?.plain?.value).toBe('group 2');
    const d2 = createDocument();
    const a = addGroup(d2, { name: 'A' });
    addLayer(d2, a.id, asset('b.svg'), { name: 'B' });
    // another tool may write a group name containing "/"
    setPropValue(addGroup(d2, { name: 'X' }).props, 'name', 'A/B');
    expect(() => resolvePath(d2, 'A/B')).toThrow(/both a group and a layer/);
  });
  it('asset names: capped length and no case-only clashes', () => {
    const doc = createDocument();
    const long = addAsset(doc, asset(`${'x'.repeat(300)}.svg`));
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(255);
    addAsset(doc, asset('Logo.svg'));
    expect(addAsset(doc, asset('logo.svg', '<circle r="5"/>'))).not.toBe('logo.svg');
  });
  it('moveBy moves the base and every variant together, or just the given variant', () => {
    const { doc } = docWith('a');
    const ref = resolvePath(doc, 'G/a');
    setProp(doc, ref, 'position', { scale: 1, 'translation-in-points': [0, 0] });
    setProp(doc, ref, 'position', { scale: 1, 'translation-in-points': [100, 0] }, { idiom: 'iOS' });
    moveBy(doc, ref, 10, 0, { appearance: 'default', idiom: 'iOS' });
    const p = (doc as IconDocument).groups[0]!.layers[0]!.props.position;
    expect((baseValue(p) as { 'translation-in-points': number[] })['translation-in-points']).toEqual([10, 0]);
    expect((variantValue(p, { idiom: 'iOS' }) as { 'translation-in-points': number[] })['translation-in-points']).toEqual([110, 0]);
    moveBy(doc, ref, 5, 0, { appearance: 'default', idiom: 'macOS' }, { idiom: 'macOS' });
    expect((variantValue(p, { idiom: 'macOS' }) as { 'translation-in-points': number[] })['translation-in-points']).toEqual([15, 0]);
  });
  it('grouping keeps layers where they were and ignores duplicate ids', () => {
    const { doc, g } = docWith('a', 'b', 'c');
    setProp(doc, { kind: 'group', id: g.id }, 'position', { scale: 0.5, 'translation-in-points': [200, 0] });
    const ctx = { appearance: 'default' as const, idiom: 'iOS' as const };
    const c = resolvePath(doc, 'G/c');
    const before = boxOf(doc, c, ctx)!;
    const ng = groupLayers(doc, [c.id, c.id]);
    expect(ng.layers).toHaveLength(1);
    expect(doc.groups.flatMap((x) => x.layers)).toHaveLength(3);
    expect(boxOf(doc, c, ctx)).toMatchObject({ x: before.x, w: before.w });
    const b = resolvePath(doc, 'G/b');
    const b0 = boxOf(doc, b, ctx)!;
    groupLayer(doc, b.id);
    expect(boxOf(doc, b, ctx)).toMatchObject({ x: b0.x, w: b0.w });
  });
});

describe('checks', () => {
  const ids = (doc: IconDocument) => validate(doc).map((i) => `${i.id}:${i.message}`);
  it('V-08 counts dark / tinted variants limited to a platform', () => {
    const { doc } = docWith('a');
    const ref = resolvePath(doc, 'G/a');
    setProp(doc, ref, 'opacity', 0.5, { appearance: 'dark', idiom: 'iOS' });
    setProp(doc, ref, 'opacity', 0.5, { appearance: 'tinted', idiom: 'iOS' });
    expect(ids(doc).filter((i) => i.startsWith('V-08'))).toEqual([]);
  });
  it('V-06 measures strokes in points, not viewBox units', () => {
    const doc = createDocument();
    const g = addGroup(doc, { name: 'G' });
    addLayer(doc, g.id, makeAsset('s.svg', strToU8(svgOf('<path d="M2 2h20" stroke-width="2"/>', 'width="1024" height="1024" viewBox="0 0 24 24"'))));
    expect(ids(doc).filter((i) => i.startsWith('V-06'))).toEqual([]);
  });
  it('V-03 warns when a bitmap is scaled up, not when it is shown at 1:1', async () => {
    const { encodePngRgb } = await import('../src/index');
    const png = makeAsset('p.png', encodePngRgb(512, 512, new Uint8Array(512 * 512 * 4).fill(255)));
    const doc = createDocument();
    const g = addGroup(doc, { name: 'G' });
    const l = addLayer(doc, g.id, png);
    expect(ids(doc).filter((i) => i.startsWith('V-03'))).toEqual([]);
    setProp(doc, { kind: 'layer', id: l.id }, 'position', { scale: 2, 'translation-in-points': [0, 0] });
    expect(ids(doc).filter((i) => i.startsWith('V-03'))).toHaveLength(1);
  });
});
