import { join } from 'node:path';
const strToU8 = (s: string) => new TextEncoder().encode(s);
import { describe, expect, it } from 'vitest';
import {
  addGroup,
  addLayer,
  buildAppIconSet,
  buildIcns,
  createDocument,
  decodePng,
  makeAsset,
  readBundle,
  setProp,
  unrenderableLayers,
} from '@fresnel/core';
import { loadIcon } from '@fresnel/core/node';
import { nodeRasterizer, renderPng } from '../src/node';

const FIX = join(__dirname, '../../../fixtures/Sample.icon');
const colorType = (png: Uint8Array) => png[25];
const hasChunk = (png: Uint8Array, type: string) => new TextDecoder('latin1').decode(png).includes(type);

describe('exports', () => {
  it('appiconset: opaque default and tinted, transparent dark, macOS template, watch slot, sRGB', async () => {
    const doc = await loadIcon(FIX);
    const files = await buildAppIconSet(nodeRasterizer(doc), { watch: true });
    expect(colorType(files['AppIcon.png']!)).toBe(2); // RGB, no alpha
    expect(colorType(files['AppIcon-Tinted.png']!)).toBe(2);
    expect(colorType(files['AppIcon-Dark.png']!)).toBe(6); // RGBA: transparent background
    const dark = decodePng(files['AppIcon-Dark.png']!)!;
    expect(dark.data[3]).toBe(0); // corner pixel is transparent
    const mac = decodePng(files['mac-512@2x.png']!)!;
    expect(mac.data[(40 * mac.width + 512) * 4 + 3]).toBe(0); // inside the 100 pt margin
    expect(mac.data[(512 * mac.width + 512) * 4 + 3]).toBe(255);
    const contents = JSON.parse(new TextDecoder().decode(files['Contents.json']));
    expect(contents.images.some((i: { platform?: string }) => i.platform === 'watchos')).toBe(true);
    for (const [k, v] of Object.entries(files)) if (k.endsWith('.png')) expect(hasChunk(v, 'sRGB')).toBe(true);
  }, 120_000);

  it('icns has 16 and 32 px entries and macOS variants are used', async () => {
    const doc = await loadIcon(FIX);
    const icns = await buildIcns(nodeRasterizer(doc));
    const s = new TextDecoder('latin1').decode(icns.subarray(0, 4000));
    expect(s).toContain('icp4');
    expect(s).toContain('icp5');
    expect(new DataView(icns.buffer).getUint32(4)).toBe(icns.length);
    // hide everything on macOS only: the macOS render differs from iOS
    const g = doc.groups[0]!;
    setProp(doc, { kind: 'group', id: g.id }, 'hidden', true, { idiom: 'macOS' });
    const ios = await renderPng(doc, { size: 64, idiom: 'iOS' });
    const mac = await renderPng(doc, { size: 64, idiom: 'macOS' });
    expect(Buffer.from(ios).equals(Buffer.from(mac))).toBe(false);
  }, 120_000);

  it('keeps imported SVG bytes and renders Illustrator entity SVGs', async () => {
    const svg =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY ns_svg "http://www.w3.org/2000/svg">]><svg xmlns="&ns_svg;" width="1024" height="1024" viewBox="0 0 1024 1024"><a href="#x"><rect width="1024" height="1024" fill="#00ff00"/></a></svg>';
    const asset = makeAsset('ai.svg', strToU8(svg));
    expect(new TextDecoder().decode(asset.bytes)).toBe(svg);
    const doc = createDocument({ background: '#000000' });
    addLayer(doc, addGroup(doc).id, asset, { props: { glass: false } });
    const png = decodePng(await renderPng(doc, { size: 64, effects: false }))!;
    const i = (32 * 64 + 32) * 4;
    expect(png.data[i + 1]).toBeGreaterThan(200); // green, not blank
  });

  it('drops unsafe and hidden paths when reading a bundle', () => {
    const b = readBundle({
      'A.icon/icon.json': strToU8('{"groups":[]}'),
      'A.icon/../../evil.sh': strToU8('x'),
      'A.icon/.git/config': strToU8('token'),
      'A.icon/.env': strToU8('x'),
      'A.icon/Assets/a\\..\\b.svg': strToU8('<svg/>'),
      'A.icon/notes.txt': strToU8('ok'),
    });
    expect(Object.keys(b.extra)).toEqual(['notes.txt']);
    expect(Object.keys(b.assets)).toEqual([]);
  });

  it('reports visible layers that can not be rendered', () => {
    const doc = createDocument();
    const g = addGroup(doc, { name: 'G' });
    addLayer(doc, g.id, makeAsset('doc.pdf', strToU8('%PDF-1.4')), { name: 'P' });
    expect(unrenderableLayers(doc)).toEqual(['G/P']);
  });
});
