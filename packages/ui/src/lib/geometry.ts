import { CANVAS, resolveProp, type IconDocument, type Position, type ResolveCtx } from '@fresnel/core';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeBox extends Box {
  kind: 'group' | 'layer';
  id: string;
  groupId: string;
}

const H = CANVAS / 2;

/** Bounding boxes of visible layers (front to back) and groups, in canvas points. Mirrors @fresnel/render placement. */
export function layout(doc: IconDocument, ctx: ResolveCtx): { layers: NodeBox[]; groups: NodeBox[] } {
  const layers: NodeBox[] = [];
  const groups: NodeBox[] = [];
  for (const g of doc.groups) {
    if (resolveProp(g.props.hidden, ctx, false)) continue;
    const gp = resolveProp<Position | null>(g.props.position, ctx, null);
    const gs = gp?.scale ?? 1;
    const [gx, gy] = gp?.['translation-in-points'] ?? [0, 0];
    const toCanvas = (x: number, y: number) => ({ x: H + gx + (x - H) * gs, y: H + gy + (y - H) * gs });
    const inGroup: NodeBox[] = [];
    for (const l of g.layers) {
      if (resolveProp(l.props.hidden, ctx, false)) continue;
      const img = resolveProp<string>(l.props['image-name'], ctx, '');
      const a = doc.assets[img];
      if (!a) continue;
      const p = resolveProp<Position | null>(l.props.position, ctx, null);
      const s = p?.scale ?? 1;
      const [tx, ty] = p?.['translation-in-points'] ?? [0, 0];
      const w = a.width * s;
      const h = a.height * s;
      const tl = toCanvas(H + tx - w / 2, H + ty - h / 2);
      const b: NodeBox = { kind: 'layer', id: l.id, groupId: g.id, x: tl.x, y: tl.y, w: w * gs, h: h * gs };
      inGroup.push(b);
      layers.push(b);
    }
    if (inGroup.length) {
      const x = Math.min(...inGroup.map((b) => b.x));
      const y = Math.min(...inGroup.map((b) => b.y));
      const x2 = Math.max(...inGroup.map((b) => b.x + b.w));
      const y2 = Math.max(...inGroup.map((b) => b.y + b.h));
      groups.push({ kind: 'group', id: g.id, groupId: g.id, x, y, w: x2 - x, h: y2 - y });
    }
  }
  return { layers, groups };
}

/**
 * Picks the frontmost layer under a point. Layers that fill the whole canvas
 * (backgrounds) are only picked when nothing smaller is under the pointer.
 */
export function hitTest(boxes: NodeBox[], x: number, y: number): NodeBox | null {
  const inside = boxes.filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!inside.length) return null;
  const small = inside.filter((b) => b.w < CANVAS * 0.98 || b.h < CANVAS * 0.98);
  return (small[0] ?? inside[0])!;
}

/** Safe arithmetic for numeric fields: "35*3", "(10+2)/4", or relative "*2", "+10", "-5". */
export function evalNumber(input: string, current: number): number {
  const s = input.trim().replace(/,/g, '.').replace(/%$/, '');
  if (s === '') return NaN;
  const rel = /^[*/+]/.test(s);
  const expr = rel ? `${current}${s}` : s;
  if (!/^[\d.\s+\-*/()]+$/.test(expr)) return NaN;
  let i = 0;
  const peek = () => expr[i];
  const skip = () => {
    while (expr[i] === ' ') i++;
  };
  const num = (): number => {
    skip();
    if (peek() === '(') {
      i++;
      const v = add();
      skip();
      if (peek() !== ')') throw new Error('paren');
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    const m = /^\d*\.?\d+/.exec(expr.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return Number(m[0]);
  };
  const mul = (): number => {
    let v = num();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/') return v;
      i++;
      const r = num();
      v = op === '*' ? v * r : v / r;
    }
  };
  const add = (): number => {
    let v = mul();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') return v;
      i++;
      const r = mul();
      v = op === '+' ? v + r : v - r;
    }
  };
  try {
    const v = add();
    skip();
    return i === expr.length && Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}
