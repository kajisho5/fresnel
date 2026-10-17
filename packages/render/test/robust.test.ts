/** Regression tests for the render bug hunt (2026-10-17). */
import { describe, expect, it } from 'vitest';
import { buildIcns, decodePng, readBundle, type IconDocument } from '@fresnel/core';
import { contentBoxOf, svgAssetsNeedingBounds } from '../src/content';
import { renderSvg } from '../src/compose';
import { assetLuma } from '../src/luma';
import { nodeRasterizer, renderPng } from '../src/node';

const u8 = (s: string) => new TextEncoder().encode(s);
function mk(json: unknown, assets: Record<string, Uint8Array | string>): IconDocument {
  const files: Record<string, Uint8Array> = { 'icon.json': u8(JSON.stringify(json)) };
  for (const [k, v] of Object.entries(assets)) files[`Assets/${k}`] = typeof v === 'string' ? u8(v) : v;
  return readBundle(files);
}
const rect = (w: number, h: number, color = '#ff0000') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`;
const circle = (attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="200" ${attrs}/></svg>`;
function px(png: Uint8Array, x: number, y: number) {
  const b = decodePng(png)!;
  const o = (y * b.width + x) * 4;
  return [...b.data.slice(o, o + 4)];
}
const noNaN = (svg: string) => expect(svg).not.toMatch(/NaN|Infinity|undefined/);
const group = (extra: Record<string, unknown>, layers: unknown[]) => ({ name: 'G', layers, ...extra });

describe('render robustness', () => {
  it('layers far off the canvas and huge scales neither crash nor hang (filter regions are fixed)', async () => {
    for (const t of [2000, -3000, 1100]) {
      const doc = mk(
        { fill: { solid: 'srgb:1,1,1,1' }, groups: [group({ specular: true }, [{ 'image-name': 'a.svg', glass: true, position: { scale: 1, 'translation-in-points': [t, t] } }])] },
        { 'a.svg': rect(200, 200) },
      );
      const svg = renderSvg(doc, { size: 64 });
      expect(svg).not.toMatch(/x="-30%"/);
      await expect(renderPng(doc, { size: 64 })).resolves.toBeInstanceOf(Uint8Array);
    }
    const big = mk({ groups: [group({}, [{ 'image-name': 'a.svg', position: { scale: 2000, 'translation-in-points': [0, 0] } }])] }, { 'a.svg': rect(200, 200) });
    await expect(renderPng(big, { size: 64 })).resolves.toBeInstanceOf(Uint8Array);
    await expect(renderPng(big, { size: 1 })).rejects.toThrow(/at least 2 px/);
  }, 120_000);

  it('a corrupt or oversized PNG does not stop rendering', async () => {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (type: string, data: number[]) => {
      const len = data.length;
      return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...u8(type), ...data, 0, 0, 0, 0];
    };
    const ihdr = (w: number, h: number) => [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, 6, 0, 0, 0];
    const truncated = new Uint8Array([...sig, ...chunk('IHDR', ihdr(4, 4)), ...chunk('IDAT', [0x78, 0x9c, 0x63]), ...chunk('IEND', [])]);
    const huge = new Uint8Array([...sig, ...chunk('IHDR', ihdr(60000, 60000)), ...chunk('IDAT', [0x78, 0x9c, 0x63]), ...chunk('IEND', [])]);
    expect(() => decodePng(truncated)).not.toThrow();
    expect(decodePng(huge)).toBeNull();
    for (const bytes of [truncated, huge]) {
      const doc = mk({ groups: [group({}, [{ 'image-name': 'p.png', fill: { 'linear-gradient': ['srgb:1,0,0,1', 'srgb:0,0,1,1'] }, glass: true }])] }, { 'p.png': bytes });
      expect(() => contentBoxOf(doc.assets['p.png']!)).not.toThrow();
      expect(() => assetLuma(doc.assets['p.png']!)).not.toThrow();
      expect(() => renderSvg(doc, { size: 64 })).not.toThrow();
    }
  });

  it('Clear and Tinted both use the Mono ("tinted") fill override', async () => {
    const doc = mk(
      { fill: { solid: 'srgb:1,0,0,1' }, 'fill-specializations': [{ value: { solid: 'srgb:1,0,0,1' } }, { appearance: 'tinted', value: { solid: 'srgb:0,1,0,1' } }, { appearance: 'dark', value: { solid: 'srgb:0,0,1,1' } }], groups: [] },
      {},
    );
    delete (doc.props.fill as { plain?: unknown }).plain;
    for (const appearance of ['clear-light', 'clear-dark', 'tinted-light', 'tinted-dark'] as const) {
      const png = await renderPng(doc, { size: 32, appearance });
      expect(px(png, 16, 16).slice(0, 3), appearance).toEqual([0, 255, 0]);
    }
  }, 60_000);

  it('a dark fill limited to macOS keeps the automatic darkening on iOS', async () => {
    const doc = mk({ fill: { solid: 'srgb:1,0,0,1' }, 'fill-specializations': [{ value: { solid: 'srgb:1,0,0,1' } }, { appearance: 'dark', idiom: 'macOS', value: { solid: 'srgb:0,0,1,1' } }], groups: [] }, {});
    delete (doc.props.fill as { plain?: unknown }).plain;
    const ios = px(await renderPng(doc, { size: 32, appearance: 'dark', idiom: 'iOS' }), 16, 16);
    const mac = px(await renderPng(doc, { size: 32, appearance: 'dark', idiom: 'macOS' }), 16, 16);
    expect(ios[0]).toBeLessThan(150); // darkened red
    expect(mac.slice(0, 3)).toEqual([0, 0, 255]);
  }, 60_000);

  it('macOS inset template: 824 pt body in a 1024 pt image', async () => {
    const doc = mk({ fill: { solid: 'srgb:1,0,0,1' }, groups: [] }, {});
    const png = await renderPng(doc, { size: 1024, mask: 'none', rim: false, effects: false, inset: 100 });
    const b = decodePng(png)!;
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < 1024; x++) {
      if (b.data[(512 * 1024 + x) * 4 + 3]! > 250) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    }
    expect(x1 - x0 + 1).toBeGreaterThanOrEqual(822);
    expect(x1 - x0 + 1).toBeLessThanOrEqual(826);
    // icns still builds with the template
    await expect(buildIcns(nodeRasterizer(doc))).resolves.toBeInstanceOf(Uint8Array);
  }, 120_000);

  it('group opacity 0 draws nothing, including shadow and frosted backdrop', async () => {
    const doc = mk(
      { fill: { solid: 'srgb:1,1,1,1' }, groups: [group({ opacity: 0, shadow: { kind: 'neutral', opacity: 1 }, translucency: { enabled: true, value: 0.5 } }, [{ 'image-name': 'c.svg', glass: true }])] },
      { 'c.svg': circle('fill="#000"') },
    );
    const png = await renderPng(doc, { size: 64 });
    for (const [x, y] of [[32, 32], [32, 46], [32, 20]] as [number, number][]) expect(px(png, x, y).slice(0, 3)).toEqual([255, 255, 255]);
  }, 60_000);

  it('watchOS: Clear / Tinted foreground reaches the edge of the 1088 pt circle', async () => {
    const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="-200" y="412" width="1424" height="200" fill="#f00"/></svg>`;
    const doc = mk({ fill: { solid: 'srgb:0,0,0,1' }, groups: [group({ translucency: { enabled: false, value: 0 } }, [{ 'image-name': 'b.svg' }])] }, { 'b.svg': bar });
    const svg = renderSvg(doc, { appearance: 'tinted-light', mask: 'circle', idiom: 'watchOS', size: 1088 });
    expect(svg).toMatch(/<mask id="[^"]*fm\d+"[^>]*x="-256"/);
  });

  it('SVG luminance: no color = black, rgb() is understood', () => {
    const a = (svg: string) => ({ name: 'x.svg', kind: 'svg' as const, bytes: u8(svg), width: 1024, height: 1024 });
    expect(assetLuma(a(circle('')))).toBe(0);
    expect(assetLuma(a(circle('fill="rgb(255, 255, 255)"')))).toBeCloseTo(1, 2);
    expect(assetLuma(a(circle('fill="#000"')))).toBe(0);
  });

  it('automatic-gradient fills also measure the SVG shape', () => {
    const doc = mk({ groups: [group({}, [{ 'image-name': 's.svg', fill: { 'automatic-gradient': 'srgb:1,0,0,1' } }])] }, { 's.svg': circle('fill="#fff"') });
    expect(svgAssetsNeedingBounds(doc).map((x) => x.name)).toEqual(['s.svg']);
  });

  it('blur-material null turns the blur off; absent keeps the default', () => {
    const mkBlur = (v: unknown) =>
      renderSvg(mk({ groups: [group(v === undefined ? {} : { 'blur-material': v }, [{ 'image-name': 'c.svg' }])] }, { 'c.svg': circle('fill="#fff"') }), { size: 64 });
    const sd = (svg: string) => [...svg.matchAll(/<filter id="[^"]*bk\d+"[^>]*><feGaussianBlur stdDeviation="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sd(mkBlur(null))).toEqual([]);
    expect(sd(mkBlur(undefined))).toEqual([12]);
    expect(sd(mkBlur(0))).toEqual([4]);
  });

  it('ignores unvalidated icon.json values instead of crashing or injecting markup', () => {
    const doc = mk(
      {
        groups: [
          group({ 'blend-mode': 'x"><script>1</script>', opacity: '0.5', shadow: { kind: 'neutral', opacity: '0.5' }, position: { scale: 'big', 'translation-in-points': [5] } }, [
            { 'image-name': 'c.svg', opacity: '0.5', 'blend-mode': 'nope', fill: { 'linear-gradient': ['srgb:1,0,0,1'], orientation: { start: { x: 0 } } }, position: { scale: 1, 'translation-in-points': ['a', null] } },
            { 'image-name': 'zero.png' },
          ]),
        ],
      },
      { 'c.svg': circle('fill="#fff"'), 'zero.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
    );
    const svg = renderSvg(doc, { size: 64 });
    noNaN(svg);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('mix-blend-mode:nope');
    // one-color gradient: both stops are that color
    expect(svg).toMatch(/<stop offset="0" stop-color="rgb\(255,\s*0,\s*0\)"[^>]*\/><stop offset="1" stop-color="rgb\(255,\s*0,\s*0\)"/);
  });

  it('tint accepts #RGB, #RRGGBB and #RRGGBBAA', async () => {
    const doc = mk({ groups: [] }, {});
    const corner = async (tint: string) => px(await renderPng(doc, { size: 32, appearance: 'tinted-light', tint, rim: false }), 1, 16).join();
    const red = await corner('#FF0000');
    expect(await corner('#F00')).toBe(red);
    expect(await corner('#FF0000FF')).toBe(red);
    expect(await corner('banana')).not.toBe(red);
  }, 60_000);
});
