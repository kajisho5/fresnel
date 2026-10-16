import type { Appearance, AppearanceKey, Idiom, Prop, PropMap, SpecEntry } from './model';
import { appearanceKeys } from './model';

export const SPEC_SUFFIX = '-specializations';

/** Keys that hold child nodes and are never treated as attributes. */
export const STRUCTURAL_KEYS = new Set(['groups', 'layers']);

const isSpecArray = (v: unknown): v is SpecEntry[] =>
  Array.isArray(v) && v.every((e) => e !== null && typeof e === 'object' && !Array.isArray(e) && 'value' in e);

/** Splits a raw JSON object into attribute props (keeps key order). Structural keys are returned separately. */
export function readProps(obj: Record<string, unknown>): { props: PropMap; order: string[] } {
  const props: PropMap = {};
  const order: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    order.push(k);
    if (STRUCTURAL_KEYS.has(k)) continue;
    if (k.endsWith(SPEC_SUFFIX) && isSpecArray(v)) {
      const base = k.slice(0, -SPEC_SUFFIX.length);
      (props[base] ??= {}).specs = structuredClone(v);
    } else {
      (props[k] ??= {}).plain = { value: structuredClone(v) };
    }
  }
  return { props, order };
}

/** Rebuilds the raw JSON object. Keys keep their original order; new keys are appended. */
export function writeProps(
  props: PropMap,
  order: string[],
  structural: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const emitted = new Set<string>();
  const emit = (rawKey: string) => {
    if (emitted.has(rawKey)) return;
    if (rawKey in structural) {
      out[rawKey] = structural[rawKey];
      emitted.add(rawKey);
      return;
    }
    const isSpec = rawKey.endsWith(SPEC_SUFFIX);
    const base = isSpec ? rawKey.slice(0, -SPEC_SUFFIX.length) : rawKey;
    const p = props[base];
    if (!p) return;
    if (isSpec ? p.specs && p.specs.length > 0 : p.plain) {
      out[rawKey] = structuredClone(isSpec ? p.specs : p.plain!.value);
      emitted.add(rawKey);
    }
  };
  for (const k of order) emit(k);
  for (const [base, p] of Object.entries(props)) {
    if (p.plain) emit(base);
    if (p.specs?.length) emit(base + SPEC_SUFFIX);
  }
  for (const k of Object.keys(structural)) emit(k);
  return out;
}

const isBaseEntry = (e: SpecEntry) => e.appearance === undefined && e.idiom === undefined;

export interface ResolveCtx {
  appearance: Appearance;
  idiom?: Idiom;
}

/**
 * Resolves a prop for an appearance.
 * Order: appearance+idiom exact > appearance only > idiom only > base entry > plain > fallback.
 */
export function resolveProp<T>(p: Prop | undefined, ctx: ResolveCtx, fallback: T): T {
  if (!p) return fallback;
  const keys = appearanceKeys(ctx.appearance);
  const specs = p.specs ?? [];
  for (const a of keys) {
    const hit = specs.find((e) => e.appearance === a && ctx.idiom !== undefined && e.idiom === ctx.idiom);
    if (hit) return hit.value as T;
  }
  for (const a of keys) {
    const hit = specs.find((e) => e.appearance === a && e.idiom === undefined);
    if (hit) return hit.value as T;
  }
  if (ctx.idiom) {
    const hit = specs.find((e) => e.appearance === undefined && e.idiom === ctx.idiom);
    if (hit) return hit.value as T;
  }
  const base = specs.find(isBaseEntry);
  if (base) return base.value as T;
  if (p.plain) return p.plain.value as T;
  return fallback;
}

/** Returns the base (all-appearances) value, if any. */
export function baseValue(p: Prop | undefined): unknown {
  if (!p) return undefined;
  const b = p.specs?.find(isBaseEntry);
  if (b) return b.value;
  return p.plain?.value;
}

export function hasOverride(p: Prop | undefined, key: AppearanceKey): boolean {
  return !!p?.specs?.some((e) => e.appearance === key && e.idiom === undefined);
}

export function overriddenAppearances(p: Prop | undefined): AppearanceKey[] {
  return (p?.specs ?? [])
    .filter((e) => e.appearance !== undefined && e.idiom === undefined)
    .map((e) => e.appearance as AppearanceKey);
}

/** Sets a value for all appearances (or for one appearance key when `appearance` is given). */
export function setPropValue(props: PropMap, key: string, value: unknown, appearance?: AppearanceKey): void {
  const p = (props[key] ??= {});
  if (!appearance) {
    if (p.specs && p.specs.length > 0) {
      const b = p.specs.find(isBaseEntry);
      if (b) b.value = structuredClone(value);
      else if (p.plain) p.plain.value = structuredClone(value);
      else p.specs.unshift({ value: structuredClone(value) });
    } else {
      p.plain = { value: structuredClone(value) };
    }
    return;
  }
  // Icon Composer writes overrides as specializations with the base entry first.
  if (!p.specs) p.specs = [];
  if (p.plain) {
    if (!p.specs.some(isBaseEntry)) p.specs.unshift({ value: p.plain.value });
    delete p.plain;
  }
  const hit = p.specs.find((e) => e.appearance === appearance && e.idiom === undefined);
  if (hit) hit.value = structuredClone(value);
  else p.specs.push({ appearance, value: structuredClone(value) });
}

/** Removes an appearance override. Collapses back to the plain key when only a base entry remains. */
export function clearOverride(props: PropMap, key: string, appearance: AppearanceKey): void {
  const p = props[key];
  if (!p?.specs) return;
  p.specs = p.specs.filter((e) => !(e.appearance === appearance && e.idiom === undefined));
  if (p.specs.length === 1 && isBaseEntry(p.specs[0]!) && Object.keys(p.specs[0]!).length === 1) {
    p.plain = { value: p.specs[0]!.value };
    delete p.specs;
  } else if (p.specs.length === 0) {
    delete p.specs;
  }
  if (!p.plain && !p.specs) delete props[key];
}

/** Removes an attribute entirely (both forms). */
export function deleteProp(props: PropMap, key: string): void {
  delete props[key];
}
