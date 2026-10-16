import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPEARANCES, decodePng, setProp, type IconDocument } from '@fresnel/core';
import { loadIcon } from '@fresnel/core/node';
import { renderSvg, renderSheetSvg } from '../src/index';
import { renderPng, renderSheetPng } from '../src/node';

let doc: IconDocument;
beforeAll(async () => {
  doc = await loadIcon(join(__dirname, '../../../fixtures/Sample.icon'));
});

const pixel = (png: Uint8Array, x: number, y: number) => {
  const b = decodePng(png)!;
  const o = (y * b.width + x) * 4;
  return [...b.data.slice(o, o + 4)] as [number, number, number, number];
};

describe('renderSvg', () => {
  it('produces a self-contained SVG for every appearance', () => {
    for (const a of APPEARANCES) {
      const svg = renderSvg(doc, { appearance: a, size: 256 });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('width="256"');
      expect(svg).not.toMatch(/href="(?!#|data:)/);
    }
  });

  it('prefixes ids when asked', () => {
    const svg = renderSvg(doc, { idPrefix: 'x_' });
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.every((i) => i.startsWith('x_'))).toBe(true);
  });

  it('inlines all six icons in the sheet', () => {
    const sheet = renderSheetSvg(doc);
    expect(sheet.match(/<svg /g)).toHaveLength(7);
  });
});

describe('rasterized output', () => {
  it('draws the sun in default and recolors it in clear / tinted', async () => {
    const at = (png: Uint8Array) => pixel(png, 128, 102); // sun center at 256px
    const def = at(await renderPng(doc, { size: 256 }));
    expect(def[0]).toBeGreaterThan(220);
    expect(def[2]).toBeLessThan(140); // orange
    const clear = at(await renderPng(doc, { size: 256, appearance: 'clear-light' }));
    expect(Math.abs(clear[0] - clear[2])).toBeLessThan(12); // neutral
    const tinted = at(await renderPng(doc, { size: 256, appearance: 'tinted-light', tint: '#3FA7A0' }));
    expect(tinted[1]).toBeGreaterThan(tinted[0]); // teal-ish
  });

  it('masks the corners', async () => {
    const png = await renderPng(doc, { size: 128 });
    expect(pixel(png, 1, 1)[3]).toBe(0);
    expect(pixel(png, 64, 64)[3]).toBe(255);
    const full = await renderPng(doc, { size: 128, mask: 'none', rim: false });
    expect(pixel(full, 1, 1)[3]).toBe(255);
  });

  it('respects hidden layers and dark overrides', async () => {
    const d = structuredClone(doc);
    const sun = d.groups.find((g) => g.layers.some((l) => l.props.name?.plain?.value === 'Sun'))!;
    setProp(d, { kind: 'layer', id: sun.layers[0]!.id }, 'hidden', true, 'dark');
    const dark = pixel(await renderPng(d, { size: 256, appearance: 'dark' }), 128, 102);
    expect(dark[0]).toBeLessThan(120); // background shows through
    const def = pixel(await renderPng(d, { size: 256 }), 128, 102);
    expect(def[0]).toBeGreaterThan(220);
  });

  it('renders the contact sheet', async () => {
    const png = await renderSheetPng(doc, { cell: 160 });
    const b = decodePng(png)!;
    expect(b.width).toBe(480);
  });
});
