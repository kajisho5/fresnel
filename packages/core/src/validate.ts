import { parseColor } from './color';
import { assetText, decodePng, svgFacts, svgSize } from './image';
import type { IconDocument, NodeRef } from './model';
import { baseValue, resolveProp, variantsOf } from './prop';
import { attrsFor, validateAttr, type NodeKind, type Position } from './schema';
import { nameOf } from './ops';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
  /** "document", "Group", "Group/Layer" */
  target: string;
  ref?: NodeRef;
  /** structured detail for programmatic use (e.g. V-08: which appearance) */
  appearance?: 'dark' | 'tinted';
}

export const RULES: Record<string, { severity: Severity; title: string }> = {
  'V-01': { severity: 'error', title: 'icon.json value is invalid' },
  'V-02': { severity: 'error', title: 'Referenced image is missing from Assets/' },
  'V-03': { severity: 'warning', title: 'Layer is not square or is smaller than 1024' },
  'V-04': { severity: 'warning', title: 'Layer looks pre-masked (rounded corners baked in)' },
  'V-05': { severity: 'warning', title: 'Background is not opaque' },
  'V-06': { severity: 'info', title: 'Very thin strokes may disappear at small sizes' },
  'V-07': { severity: 'info', title: 'SVG contains text or custom effects' },
  'V-08': { severity: 'warning', title: 'Appearance is not customized' },
  'V-09': { severity: 'warning', title: 'More than 4 groups' },
  'V-10': { severity: 'error', title: 'Unsupported image format' },
};

function fillHasAlpha(fill: unknown): boolean {
  if (!fill || typeof fill !== 'object') return false;
  const f = fill as Record<string, unknown>;
  const colors = [f.solid, f['automatic-gradient'], ...(Array.isArray(f['linear-gradient']) ? f['linear-gradient'] : [])];
  return colors.some((c) => {
    const p = typeof c === 'string' ? parseColor(c) : null;
    if (!p) return false;
    const a = p.space === 'gray' || p.space === 'extended-gray' ? p.c[1] : p.c[3];
    return a !== undefined && a < 1;
  });
}

export function validate(doc: IconDocument): Issue[] {
  const out: Issue[] = [];
  const push = (id: string, message: string, target: string, ref?: NodeRef) =>
    out.push({ id, severity: RULES[id]!.severity, message, target, ...(ref ? { ref } : {}) });

  const checkProps = (kind: NodeKind, props: IconDocument['props'], target: string, ref: NodeRef) => {
    for (const [key, p] of Object.entries(props)) {
      if (!attrsFor(kind)[key]) continue;
      const values = [...(p.plain ? [p.plain.value] : []), ...(p.specs ?? []).map((s) => s.value)];
      for (const v of values) {
        if (v === null && key === 'blur-material') continue;
        const r = validateAttr(kind, key, v);
        if (!r.ok) push('V-01', r.error, target, ref);
      }
    }
  };

  checkProps('document', doc.props, 'document', { kind: 'document' });

  const fill = resolveProp<unknown>(doc.props.fill, { appearance: 'default' }, 'automatic');
  if (fill === 'none') push('V-05', 'The background fill is "none". Icons need an opaque, full-bleed background.', 'document', { kind: 'document' });
  else if (fillHasAlpha(fill)) push('V-05', 'The background color is partly transparent. App Store icons are flattened onto black.', 'document', { kind: 'document' });

  const visibleGroups = doc.groups.filter((g) => resolveProp<boolean>(g.props.hidden, { appearance: 'default' }, false) !== true).length;
  if (visibleGroups > 4) push('V-09', `This icon has ${visibleGroups} visible groups. Apple recommends at most 4, and Xcode's actool may reject icons with more.`, 'document');

  let anyDark = false;
  let anyTinted = false;
  const scan = (props: IconDocument['props']) => {
    for (const p of Object.values(props)) {
      // any dark / tinted variant counts, also one limited to a platform
      for (const v of variantsOf(p)) {
        if (v.appearance === 'dark') anyDark = true;
        if (v.appearance === 'tinted') anyTinted = true;
      }
    }
  };
  scan(doc.props);

  for (const g of doc.groups) {
    const gName = nameOf(g) || '(unnamed group)';
    const gref: NodeRef = { kind: 'group', id: g.id };
    checkProps('group', g.props, gName, gref);
    scan(g.props);
    for (const l of g.layers) {
      const lName = `${gName}/${nameOf(l) || '(unnamed layer)'}`;
      const lref: NodeRef = { kind: 'layer', id: l.id };
      checkProps('layer', l.props, lName, lref);
      scan(l.props);
      const names = new Set<string>();
      const img = l.props['image-name'];
      if (img?.plain && typeof img.plain.value === 'string') names.add(img.plain.value);
      for (const s of img?.specs ?? []) if (typeof s.value === 'string') names.add(s.value);
      const pos = (baseValue(l.props.position) as Position | undefined) ?? { scale: 1, 'translation-in-points': [0, 0] };
      for (const n of names) {
        const a = doc.assets[n];
        if (!a) {
          push('V-02', `"${n}" is referenced but not found in Assets/.`, lName, lref);
          continue;
        }
        if (a.kind === 'other' || a.kind === 'pdf') {
          push('V-10', `"${n}" can't be previewed by fresnel. Use SVG or PNG.`, lName, lref);
          continue;
        }
        if (Math.abs(a.width - a.height) > 0.5) {
          push('V-03', `"${n}" is ${round(a.width)}×${round(a.height)}. Apple recommends square, unmasked layers.`, lName, lref);
        } else if (a.kind !== 'svg' && pos.scale > 1.01) {
          // images are placed at 1 px = 1 pt, so only enlarging them makes them soft
          push('V-03', `"${n}" (${a.width}×${a.height} px) is scaled up ${round(pos.scale)}× and may look soft. Use a larger image or a vector.`, lName, lref);
        }
        if (a.kind === 'png' && a.width === a.height && a.width >= 256) {
          const bmp = safeDecode(a.bytes);
          if (bmp && looksPreMasked(bmp)) push('V-04', `"${n}" seems to have rounded corners baked in. The system masks icons itself.`, lName, lref);
        }
        if (a.kind === 'svg') {
          const text = assetText(a);
          const f = svgFacts(text);
          // stroke widths are in viewBox units; convert to points
          const vb = /<svg\b[^>]*\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)/i.exec(text);
          const unit = vb && Number(vb[1]) > 0 ? svgSize(text).width / Number(vb[1]) : 1;
          if (f.hasText) push('V-07', `"${n}" contains <text>. Convert text to outlines.`, lName, lref);
          if (f.hasFilter) push('V-07', `"${n}" uses SVG filters (blur, glow, shadow). Let the system draw effects.`, lName, lref);
          if (f.minStrokeWidth !== null && f.minStrokeWidth * unit * pos.scale < 10)
            push('V-06', `"${n}" has strokes as thin as ${round(f.minStrokeWidth * unit)} pt. They'll be under 0.16 px at 16 px.`, lName, lref);
        }
      }
    }
  }
  if (!anyDark) {
    push('V-08', "Dark appearance isn't customized. The system will generate it. Review it in Compare.", 'document');
    out[out.length - 1]!.appearance = 'dark';
  }
  if (!anyTinted) {
    push('V-08', "Tinted appearance isn't customized. The system will generate it. Review it in Compare.", 'document');
    out[out.length - 1]!.appearance = 'tinted';
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

function safeDecode(b: Uint8Array) {
  try {
    return decodePng(b);
  } catch {
    return null;
  }
}

/** Corners transparent while edge midpoints are opaque -> probably pre-masked. */
export function looksPreMasked(bmp: { width: number; height: number; data: Uint8Array }): boolean {
  const { width: w, height: h, data } = bmp;
  const k = Math.max(4, Math.round(w * 0.03));
  const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3]!;
  let transparent = 0;
  let total = 0;
  for (const [cx, cy] of [
    [0, 0],
    [w - k, 0],
    [0, h - k],
    [w - k, h - k],
  ] as const) {
    for (let y = cy; y < cy + k; y++)
      for (let x = cx; x < cx + k; x++) {
        total++;
        if (alphaAt(x, y) < 16) transparent++;
      }
  }
  const mids = [alphaAt(w >> 1, 1), alphaAt(w >> 1, h - 2), alphaAt(1, h >> 1), alphaAt(w - 2, h >> 1)];
  return transparent / total > 0.9 && mids.every((a) => a > 240);
}

export function summarizeIssues(issues: Issue[]) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
