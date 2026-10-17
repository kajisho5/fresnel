/**
 * Layout geometry, Align / Distribute and grouping several layers.
 * Coordinates are canvas points (1024 × 1024, origin top-left, y down), the same placement
 * the renderer uses: images at natural size, centered, then layer position, then group position.
 */
import { CANVAS, type IconDocument, type NodeRef } from './model';
import type { Position } from './schema';
import { resolveProp, type ResolveCtx, type VariantArg } from './prop';
import { addGroup, findGroup, findLayer, OpError, setProp } from './ops';

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

/**
 * Bounding boxes of layers (front to back) and groups, in canvas points.
 * Hidden items are skipped unless `includeHidden` (Align / Distribute can move hidden items too).
 * Layers whose image is missing have no box.
 */
export function layoutBoxes(doc: IconDocument, ctx: ResolveCtx, opts: { includeHidden?: boolean } = {}): { layers: NodeBox[]; groups: NodeBox[] } {
  const layers: NodeBox[] = [];
  const groups: NodeBox[] = [];
  for (const g of doc.groups) {
    if (!opts.includeHidden && resolveProp(g.props.hidden, ctx, false)) continue;
    const gp = resolveProp<Position | null>(g.props.position, ctx, null);
    const gs = gp?.scale ?? 1;
    const [gx, gy] = gp?.['translation-in-points'] ?? [0, 0];
    const toCanvas = (x: number, y: number) => ({ x: H + gx + (x - H) * gs, y: H + gy + (y - H) * gs });
    const inGroup: NodeBox[] = [];
    for (const l of g.layers) {
      if (!opts.includeHidden && resolveProp(l.props.hidden, ctx, false)) continue;
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
    if (inGroup.length) groups.push({ kind: 'group', id: g.id, groupId: g.id, ...unionBox(inGroup)! });
  }
  return { layers, groups };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function boxOf(doc: IconDocument, ref: NodeRef, ctx: ResolveCtx): NodeBox | undefined {
  if (ref.kind === 'document') return undefined;
  const geo = layoutBoxes(doc, ctx, { includeHidden: true });
  return (ref.kind === 'group' ? geo.groups : geo.layers).find((b) => b.id === ref.id);
}

/**
 * Moves an item by a distance given in canvas points. A layer's translation lives in its
 * group's (possibly scaled) space, so the distance is divided by the group's scale.
 */
export function moveBy(doc: IconDocument, ref: NodeRef, dx: number, dy: number, ctx: ResolveCtx, variant?: VariantArg): void {
  if (ref.kind === 'document' || (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9)) return;
  let props;
  let scale = 1;
  if (ref.kind === 'group') {
    const g = findGroup(doc, ref.id);
    if (!g) throw new OpError('Group not found');
    props = g.props;
  } else {
    const f = findLayer(doc, ref.id);
    if (!f) throw new OpError('Layer not found');
    props = f.layer.props;
    scale = resolveProp<Position | null>(f.group.props.position, ctx, null)?.scale ?? 1;
  }
  const p = resolveProp<Position>(props.position, ctx, { scale: 1, 'translation-in-points': [0, 0] }) ?? { scale: 1, 'translation-in-points': [0, 0] };
  const [x, y] = p['translation-in-points'] ?? [0, 0];
  const round = (v: number) => Math.round(v * 100) / 100;
  setProp(doc, ref, 'position', { ...p, 'translation-in-points': [round(x + dx / scale), round(y + dy / scale)] }, variant);
}

export type AlignHow = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type AlignBasis = 'selection' | 'canvas';

/**
 * Aligns items' bounding boxes. With one item (or basis "canvas") the reference is the 1024 pt canvas,
 * otherwise the union of the items. Only positions change; returns how many items moved.
 */
export function alignNodes(
  doc: IconDocument,
  refs: NodeRef[],
  how: AlignHow,
  ctx: ResolveCtx,
  opts: { basis?: AlignBasis; variant?: VariantArg } = {},
): number {
  const boxes = refs.map((r) => ({ ref: r, box: boxOf(doc, r, ctx) })).filter((x): x is { ref: NodeRef; box: NodeBox } => !!x.box);
  if (!boxes.length) return 0;
  const ref: Box = opts.basis === 'canvas' || boxes.length === 1 ? { x: 0, y: 0, w: CANVAS, h: CANVAS } : unionBox(boxes.map((b) => b.box))!;
  let moved = 0;
  for (const { ref: r, box: b } of boxes) {
    let dx = 0;
    let dy = 0;
    if (how === 'left') dx = ref.x - b.x;
    else if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
    else if (how === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    else if (how === 'top') dy = ref.y - b.y;
    else if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    else dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;
    moveBy(doc, r, dx, dy, ctx, opts.variant);
    moved++;
  }
  return moved;
}

/**
 * Spaces item centers evenly along an axis. The two outermost items stay put; needs 3 or more.
 * Returns how many items moved.
 */
export function distributeNodes(
  doc: IconDocument,
  refs: NodeRef[],
  axis: 'horizontal' | 'vertical',
  ctx: ResolveCtx,
  opts: { variant?: VariantArg } = {},
): number {
  const items = refs.map((r) => ({ ref: r, box: boxOf(doc, r, ctx) })).filter((x): x is { ref: NodeRef; box: NodeBox } => !!x.box);
  if (items.length < 3) return 0;
  const c = (b: Box) => (axis === 'horizontal' ? b.x + b.w / 2 : b.y + b.h / 2);
  items.sort((a, b) => c(a.box) - c(b.box));
  const first = c(items[0]!.box);
  const step = (c(items[items.length - 1]!.box) - first) / (items.length - 1);
  let moved = 0;
  items.forEach((it, i) => {
    if (i === 0 || i === items.length - 1) return;
    const d = first + step * i - c(it.box);
    if (Math.abs(d) < 1e-6) return;
    moveBy(doc, it.ref, axis === 'horizontal' ? d : 0, axis === 'vertical' ? d : 0, ctx, opts.variant);
    moved++;
  });
  return moved;
}

/**
 * Wraps several layers in one new group, placed where the frontmost of them was.
 * Layers keep their front-to-back order. Empty source groups are left in place.
 */
export function groupLayers(doc: IconDocument, layerIds: string[], name?: string) {
  const found = layerIds.map((id) => findLayer(doc, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (!found.length) throw new OpError('Layer not found');
  const order = (f: (typeof found)[number]) => doc.groups.indexOf(f.group) * 1e6 + f.index;
  found.sort((a, b) => order(a) - order(b));
  const front = found[0]!;
  const gi = doc.groups.indexOf(front.group);
  const g = addGroup(doc, { name: name ?? 'Group', index: gi });
  for (const f of found) {
    const grp = f.group;
    grp.layers.splice(grp.layers.indexOf(f.layer), 1);
    g.layers.push(f.layer);
  }
  return g;
}
