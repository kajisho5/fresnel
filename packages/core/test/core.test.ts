import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import {
  addGroup,
  addLayer,
  colorToCss,
  createDocument,
  encodeIcns,
  findLayer,
  looksPreMasked,
  makeAsset,
  moveNode,
  normalizeColorInput,
  parseColor,
  parseIconJson,
  readBundle,
  removeNode,
  resolvePath,
  resolveProp,
  sanitizeSvg,
  serializeIconJson,
  setProp,
  svgSize,
  toRGBA,
  unzipBundle,
  validate,
  writeBundle,
  zipBundle,
  type IconDocument,
} from '../src/index';

const fixture = readFileSync(join(__dirname, 'fixtures/specs.icon.json'), 'utf8');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="300" fill="#fff"/></svg>';

function docFromFixture(): IconDocument {
  return { ...parseIconJson(fixture), assets: {} };
}

describe('icon.json round trip', () => {
  it('keeps every value and unknown key', () => {
    const out = serializeIconJson(docFromFixture());
    expect(JSON.parse(out)).toEqual(JSON.parse(fixture));
  });

  it('keeps key order and Icon Composer formatting', () => {
    const out = serializeIconJson(docFromFixture());
    expect(Object.keys(JSON.parse(out))).toEqual(Object.keys(JSON.parse(fixture)));
    expect(out).toContain('"groups" : [');
    expect(serializeIconJson(parseIconJson(out))).toBe(out);
  });

  it('keeps explicit null distinct from missing', () => {
    const out = JSON.parse(serializeIconJson(docFromFixture()));
    expect(out.groups[0]).toHaveProperty('blur-material', null);
    expect(out.groups[1]).not.toHaveProperty('blur-material');
  });
});

describe('specialization resolution', () => {
  const doc = docFromFixture();
  const front = doc.groups[0]!;
  it('uses base entry for default and override for dark', () => {
    expect(resolveProp(front.props.translucency, { appearance: 'default' }, null)).toEqual({ enabled: true, value: 0.6 });
    expect(resolveProp(front.props.translucency, { appearance: 'dark' }, null)).toEqual({ enabled: true, value: 0.8 });
    expect(resolveProp(front.props.translucency, { appearance: 'clear-dark' }, null)).toEqual({ enabled: true, value: 0.8 });
    expect(resolveProp(front.props.translucency, { appearance: 'tinted-light' }, null)).toEqual({ enabled: true, value: 0.6 });
  });
  it('falls back to plain value and then default', () => {
    expect(resolveProp(front.props.specular, { appearance: 'dark' }, false)).toBe(true);
    expect(resolveProp(front.props.opacity, { appearance: 'dark' }, 1)).toBe(1);
  });
});

describe('editing', () => {
  it('writes overrides Icon Composer style and collapses them back', () => {
    const doc = docFromFixture();
    const ref = { kind: 'group' as const, id: doc.groups[1]!.id };
    setProp(doc, ref, 'opacity', 0.7);
    setProp(doc, ref, 'opacity', 0.4, 'dark');
    let json = JSON.parse(serializeIconJson(doc));
    expect(json.groups[1]['opacity-specializations']).toEqual([{ value: 0.7 }, { appearance: 'dark', value: 0.4 }]);
    expect(json.groups[1]).not.toHaveProperty('opacity');
    setProp(doc, ref, 'opacity', null, 'dark');
    json = JSON.parse(serializeIconJson(doc));
    expect(json.groups[1].opacity).toBe(0.7);
    expect(json.groups[1]).not.toHaveProperty('opacity-specializations');
  });

  it('validates values of known attributes', () => {
    const doc = docFromFixture();
    const ref = { kind: 'group' as const, id: doc.groups[0]!.id };
    expect(() => setProp(doc, ref, 'opacity', 2)).toThrow(/opacity/);
    expect(() => setProp(doc, ref, 'blend-mode', 'glow')).toThrow();
    setProp(doc, ref, 'refraction', 0.9); // unknown attribute: accepted as-is
  });

  it('normalizes hex colors in fills', () => {
    const doc = createDocument({ background: '#3366FF' });
    expect(resolveProp(doc.props.fill, { appearance: 'default' }, null)).toEqual({ solid: 'srgb:0.20000,0.40000,1.00000,1.00000' });
    setProp(doc, { kind: 'document' }, 'fill', 'gradient:#ffffff,#000000');
    expect(resolveProp(doc.props.fill, { appearance: 'default' }, null)).toEqual({
      'linear-gradient': ['srgb:1.00000,1.00000,1.00000,1.00000', 'srgb:0.00000,0.00000,0.00000,1.00000'],
    });
  });

  it('adds, finds, moves and removes layers; prunes assets', () => {
    const doc = createDocument({ background: '#112233' });
    const g = addGroup(doc, { name: 'Shapes' });
    const l1 = addLayer(doc, g.id, makeAsset('dot.svg', strToU8(SVG)), { props: { opacity: 0.5 } });
    const l2 = addLayer(doc, g.id, makeAsset('dot.svg', strToU8(SVG.replace('300', '200'))));
    expect(Object.keys(doc.assets)).toEqual(['dot.svg', 'dot 2.svg']);
    expect(resolvePath(doc, 'shapes/dot')).toEqual({ kind: 'layer', id: l1.id });
    expect(resolvePath(doc, '#0/#0')).toEqual({ kind: 'layer', id: l2.id });
    const g2 = addGroup(doc, { name: 'Back', index: 1 });
    moveNode(doc, { kind: 'layer', id: l1.id }, 0, g2.id);
    expect(findLayer(doc, l1.id)!.group.id).toBe(g2.id);
    removeNode(doc, { kind: 'layer', id: l2.id });
    expect(Object.keys(doc.assets)).toEqual(['dot.svg']);
    expect(() => resolvePath(doc, 'Nope')).toThrow(/Available: Shapes, Back/);
  });
});

describe('bundle files', () => {
  it('reads and writes folders and zips', () => {
    const doc = createDocument();
    const g = addGroup(doc);
    addLayer(doc, g.id, makeAsset('a.svg', strToU8(SVG)));
    const files = writeBundle(doc);
    expect(Object.keys(files).sort()).toEqual(['Assets/a.svg', 'icon.json']);
    const back = readBundle({ ...files, 'notes.txt': strToU8('keep me') });
    expect(back.extra['notes.txt']).toBeDefined();
    const z = unzipBundle(zipBundle(back, 'Test', back.extra));
    expect(Object.keys(z.assets)).toEqual(['a.svg']);
    expect(z.extra['notes.txt']).toBeDefined();
  });
});

describe('colors', () => {
  it('parses and converts', () => {
    expect(parseColor('extended-gray:1.0,1.0')).toEqual({ space: 'extended-gray', c: [1, 1] });
    expect(parseColor('nope:1,2,3')).toBeNull();
    expect(colorToCss('srgb:1,0,0,1')).toBe('rgb(255,0,0)');
    const p3red = toRGBA(parseColor('display-p3:1,0,0,1')!);
    expect(p3red.r).toBe(1);
    expect(p3red.g).toBe(0);
    expect(normalizeColorInput('#f00')).toBe('srgb:1.00000,0.00000,0.00000,1.00000');
    expect(() => normalizeColorInput('red')).toThrow();
  });
});

describe('images', () => {
  it('sanitizes active SVG content', () => {
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><div/></foreignObject>' +
      '<image href="https://evil.example/x.png"/><use href="#a"/><a href="javascript:alert(1)"/></svg>';
    const s = sanitizeSvg(evil);
    expect(s).not.toMatch(/script|onload|foreignObject|evil\.example|javascript/i);
    expect(s).toContain('href="#a"');
  });
  it('reads natural size', () => {
    expect(svgSize('<svg viewBox="0 0 400 200"></svg>')).toEqual({ width: 400, height: 200 });
    expect(svgSize('<svg width="300px" viewBox="0 0 100 50"></svg>')).toEqual({ width: 300, height: 150 });
  });
  it('detects pre-masked corners', () => {
    const w = 64;
    const data = new Uint8Array(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const dx = Math.max(0, Math.abs(x - 31.5) - 18);
        const dy = Math.max(0, Math.abs(y - 31.5) - 18);
        data[(y * w + x) * 4 + 3] = dx * dx + dy * dy < 14 * 14 ? 255 : 0;
      }
    expect(looksPreMasked({ width: w, height: w, data })).toBe(true);
    expect(looksPreMasked({ width: w, height: w, data: data.map((_, i) => (i % 4 === 3 ? 255 : 0)) })).toBe(false);
  });
});

describe('validation', () => {
  it('flags missing assets, invalid values and missing variants', () => {
    const doc = docFromFixture();
    const ids = validate(doc).map((i) => i.id);
    expect(ids).toContain('V-02');
    expect(ids.filter((i) => i === 'V-08')).toHaveLength(0); // fixture has dark + tinted overrides
    const doc2 = createDocument({ background: 'none' });
    const g = addGroup(doc2);
    addLayer(doc2, g.id, makeAsset('t.svg', strToU8('<svg viewBox="0 0 100 50"><text>Hi</text><path stroke-width="1"/></svg>')));
    const issues = validate(doc2);
    expect(issues.map((i) => i.id).sort()).toEqual(['V-03', 'V-05', 'V-06', 'V-07', 'V-08', 'V-08']);
  });
});

describe('icns', () => {
  it('encodes a valid container', () => {
    const fake = (n: number) => new Uint8Array(n).fill(7);
    const icns = encodeIcns({ 32: fake(10), 1024: fake(20) });
    const dv = new DataView(icns.buffer);
    expect(String.fromCharCode(...icns.subarray(0, 4))).toBe('icns');
    expect(dv.getUint32(4)).toBe(icns.length);
    // 32 px is stored twice: icp5 (32@1x) and ic11 (16@2x)
    expect(String.fromCharCode(...icns.subarray(8, 12))).toBe('icp5');
    expect(String.fromCharCode(...icns.subarray(26, 30))).toBe('ic11');
    expect(icns.length).toBe(8 + 18 + 18 + 28);
  });
});

describe('platform variants and features', () => {
  it('writes and resolves idiom (platform) variants', async () => {
    const { setProp: sp, resolveProp: rp, serializeIconJson: ser } = await import('../src/index');
    const doc = createDocument();
    const g = addGroup(doc, { name: 'G' });
    const ref = { kind: 'group' as const, id: g.id };
    sp(doc, ref, 'opacity', 0.9);
    sp(doc, ref, 'opacity', 0.5, { idiom: 'watchOS' });
    sp(doc, ref, 'opacity', 0.3, { appearance: 'dark', idiom: 'watchOS' });
    expect(rp(g.props.opacity, { appearance: 'default', idiom: 'iOS' }, 1)).toBe(0.9);
    expect(rp(g.props.opacity, { appearance: 'default', idiom: 'watchOS' }, 1)).toBe(0.5);
    expect(rp(g.props.opacity, { appearance: 'dark', idiom: 'watchOS' }, 1)).toBe(0.3);
    expect(rp(g.props.opacity, { appearance: 'dark', idiom: 'macOS' }, 1)).toBe(0.9);
    const json = JSON.parse(ser(doc));
    expect(json.groups[0]['opacity-specializations']).toEqual([
      { value: 0.9 },
      { idiom: 'watchOS', value: 0.5 },
      { appearance: 'dark', idiom: 'watchOS', value: 0.3 },
    ]);
    sp(doc, ref, 'opacity', null, { idiom: 'watchOS' });
    sp(doc, ref, 'opacity', null, { appearance: 'dark', idiom: 'watchOS' });
    expect(JSON.parse(ser(doc)).groups[0].opacity).toBe(0.9);
  });

  it('square idiom applies to iOS and macOS', async () => {
    const { setProp: sp, resolveProp: rp } = await import('../src/index');
    const doc = createDocument();
    const g = addGroup(doc);
    sp(doc, { kind: 'group', id: g.id }, 'opacity', 0.4, { idiom: 'square' });
    expect(rp(g.props.opacity, { appearance: 'default', idiom: 'macOS' }, 1)).toBe(0.4);
    expect(rp(g.props.opacity, { appearance: 'default', idiom: 'watchOS' }, 1)).toBe(1);
  });

  it('keeps "features" in sync with specular placement and refraction', () => {
    const doc = createDocument();
    const g = addGroup(doc);
    const ref = { kind: 'group' as const, id: g.id };
    setProp(doc, ref, 'specular', 'inside');
    setProp(doc, ref, 'refractivity', { enabled: true, strength: 0.5, depth: 0.3 });
    let json = JSON.parse(new TextDecoder().decode(writeBundle(doc)['icon.json']));
    expect(json.features).toEqual(['refractivity', 'specular-location']);
    setProp(doc, ref, 'specular', true);
    setProp(doc, ref, 'refractivity', null);
    json = JSON.parse(new TextDecoder().decode(writeBundle(doc)['icon.json']));
    expect(json).not.toHaveProperty('features');
    expect(() => setProp(doc, ref, 'specular', 'middle')).toThrow();
  });
});

describe('sanitizeSvg bypasses', () => {
  it('handles unquoted, css, smil and split-tag tricks', () => {
    const s = sanitizeSvg(
      '<svg><image href=https://e.x/a.png /><style>.a{fill:url(https://e.x/a)} @import "x.css";</style><rect style="fill:url(http://e.x)"/>' +
        '<scr<script></script>ipt>alert(1)</script><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="href"></animate><use href="#a" fill="url(#g)"/></svg>',
    );
    expect(s).not.toMatch(/https?:|@import|<script|<set|<animate|javascript/i);
    expect(s).toContain('href="#a"');
    expect(s).toContain('url(#g)');
  });
});
