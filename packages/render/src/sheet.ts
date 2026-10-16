import { APPEARANCE_LABEL, isDarkAppearance, type Appearance, type IconDocument } from '@fresnel/core';
import { renderSvg, type RenderOptions } from './compose';

/** Light variants on the top row, dark variants below. */
export const SHEET_ORDER: Appearance[] = ['default', 'clear-light', 'tinted-light', 'dark', 'clear-dark', 'tinted-dark'];

/**
 * Contact sheet: the six appearances in a 3×2 grid on light / dark wallpapers.
 * Icons are inlined as nested <svg> elements (resvg doesn't render SVG images
 * nested inside SVG images).
 */
export function renderSheetSvg(
  doc: IconDocument,
  opts: Omit<RenderOptions, 'appearance' | 'size' | 'idPrefix'> & { cell?: number; labels?: boolean } = {},
): string {
  const cell = opts.cell ?? 320;
  const pad = Math.round(cell * 0.18);
  const label = opts.labels !== false ? Math.round(cell * 0.12) : 0;
  const w = cell * 3;
  const h = (cell + label) * 2;
  const icon = cell - pad * 2;
  const parts: string[] = [];
  SHEET_ORDER.forEach((ap, i) => {
    const x = (i % 3) * cell;
    const y = Math.floor(i / 3) * (cell + label);
    const darkBg = isDarkAppearance(ap);
    parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell + label}" fill="${darkBg ? '#14161F' : '#E3E8F0'}"/>`);
    const svg = renderSvg(doc, { ...opts, appearance: ap, size: icon, idPrefix: `a${i}_` });
    parts.push(svg.replace('<svg ', `<svg x="${x + pad}" y="${y + pad}" `).replace(/ width="\d+" height="\d+"/, ` width="${icon}" height="${icon}"`));
    if (label)
      parts.push(
        `<text x="${x + cell / 2}" y="${y + cell + label * 0.15}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" ` +
          `font-size="${Math.round(label * 0.5)}" font-weight="600" fill="${darkBg ? '#F2F2F5' : '#1C1C1E'}">${APPEARANCE_LABEL[ap]}</text>`,
      );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}
