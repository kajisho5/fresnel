import { CANVAS, layoutBoxes, type IconDocument, type NodeBox, type ResolveCtx } from '@fresnel/core';

export type { Box, NodeBox } from '@fresnel/core';

/** Bounding boxes of visible layers (front to back) and groups, in canvas points. */
export function layout(doc: IconDocument, ctx: ResolveCtx): { layers: NodeBox[]; groups: NodeBox[] } {
  return layoutBoxes(doc, ctx);
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
