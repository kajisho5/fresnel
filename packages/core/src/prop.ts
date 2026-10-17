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
  let fromFile = true;
  const emit = (rawKey: string) => {
    if (emitted.has(rawKey)) return;
    if (rawKey in structural) {
      out[rawKey] = structural[rawKey];
      emitted.add(rawKey);
      return;
    }
    // a "*-specializations" key that wasn't a valid list is kept verbatim under its own name
    const literal = props[rawKey];
    if (rawKey.endsWith(SPEC_SUFFIX) && literal?.plain) {
      out[rawKey] = structuredClone(literal.plain.value);
      emitted.add(rawKey);
      return;
    }
    const isSpec = rawKey.endsWith(SPEC_SUFFIX);
    const base = isSpec ? rawKey.slice(0, -SPEC_SUFFIX.length) : rawKey;
    const p = props[base];
    if (!p) return;
    // an empty list that was in the file stays (keys from `order` only); new empty lists are not written
    if (isSpec ? p.specs && (p.specs.length > 0 || fromFile) : p.plain) {
      out[rawKey] = structuredClone(isSpec ? p.specs : p.plain!.value);
      emitted.add(rawKey);
    }
  };
  for (const k of order) emit(k);
  fromFile = false;
  for (const [base, p] of Object.entries(props)) {
    if (base.endsWith(SPEC_SUFFIX) && p.plain) {
      emit(base);
      continue;
    }
    if (p.plain) emit(base);
    if (p.specs?.length) emit(base + SPEC_SUFFIX);
  }
  for (const k of Object.keys(structural)) emit(k);
  return out;
}

const isBaseEntry = (e: SpecEntry) => e.appearance === undefined && e.idiom === undefined;

/** A variant of an attribute: an appearance, a platform (idiom), or both. Empty = base value. */
export interface Variant {
  appearance?: AppearanceKey;
  idiom?: Idiom;
}

export type VariantArg = AppearanceKey | Variant | undefined;

export function toVariant(v: VariantArg): Variant {
  if (!v) return {};
  return typeof v === 'string' ? { appearance: v } : v;
}

const sameVariant = (e: SpecEntry, v: Variant) => e.appearance === v.appearance && e.idiom === v.idiom;
const isEmpty = (v: Variant) => v.appearance === undefined && v.idiom === undefined;

export interface ResolveCtx {
  appearance: Appearance;
  /** platform being previewed: iOS, macOS or watchOS */
  idiom?: Idiom;
}

/** Idioms that apply to a platform, most specific first ("square" = shared iOS + macOS). */
export function idiomsFor(idiom: Idiom | undefined): Idiom[] {
  if (!idiom) return [];
  if (idiom === 'iOS' || idiom === 'macOS') return [idiom, 'square'];
  return [idiom];
}

/**
 * Resolves a prop for an appearance and platform.
 * Order: appearance+idiom > appearance only > idiom only > base entry > plain > fallback.
 */
export function resolveProp<T>(p: Prop | undefined, ctx: ResolveCtx, fallback: T): T {
  if (!p) return fallback;
  const keys = appearanceKeys(ctx.appearance);
  const idioms = idiomsFor(ctx.idiom);
  const specs = p.specs ?? [];
  for (const a of keys)
    for (const i of idioms) {
      const hit = specs.find((e) => e.appearance === a && e.idiom === i);
      if (hit) return hit.value as T;
    }
  for (const a of keys) {
    const hit = specs.find((e) => e.appearance === a && e.idiom === undefined);
    if (hit) return hit.value as T;
  }
  for (const i of idioms) {
    const hit = specs.find((e) => e.appearance === undefined && e.idiom === i);
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

/** Value stored for exactly this variant (no fallback), or undefined. */
export function variantValue(p: Prop | undefined, v: VariantArg): unknown {
  const vv = toVariant(v);
  if (isEmpty(vv)) return baseValue(p);
  return p?.specs?.find((e) => sameVariant(e, vv))?.value;
}

export function hasVariant(p: Prop | undefined, v: VariantArg): boolean {
  const vv = toVariant(v);
  return !isEmpty(vv) && !!p?.specs?.some((e) => sameVariant(e, vv));
}

/** @deprecated use hasVariant */
export function hasOverride(p: Prop | undefined, key: AppearanceKey): boolean {
  return hasVariant(p, { appearance: key });
}

/** All non-base variants stored for a prop. */
export function variantsOf(p: Prop | undefined): Variant[] {
  return (p?.specs ?? [])
    .filter((e) => !isBaseEntry(e))
    .map((e) => ({ ...(e.appearance ? { appearance: e.appearance as AppearanceKey } : {}), ...(e.idiom ? { idiom: e.idiom as Idiom } : {}) }));
}

export function overriddenAppearances(p: Prop | undefined): AppearanceKey[] {
  return variantsOf(p)
    .filter((v) => v.appearance && !v.idiom)
    .map((v) => v.appearance!);
}

/** Sets a value for all appearances, or for one variant (appearance and/or platform). */
export function setPropValue(props: PropMap, key: string, value: unknown, variant?: VariantArg): void {
  const v = toVariant(variant);
  const p = (props[key] ??= {});
  if (isEmpty(v)) {
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
  // Icon Composer writes variants as specializations with the base entry first.
  if (!p.specs) p.specs = [];
  if (p.plain) {
    if (!p.specs.some(isBaseEntry)) p.specs.unshift({ value: p.plain.value });
    delete p.plain;
  }
  const hit = p.specs.find((e) => sameVariant(e, v));
  if (hit) hit.value = structuredClone(value);
  else p.specs.push({ ...(v.appearance ? { appearance: v.appearance } : {}), ...(v.idiom ? { idiom: v.idiom } : {}), value: structuredClone(value) });
}

/** Removes a variant. Collapses back to the plain key when only a base entry remains. */
export function clearOverride(props: PropMap, key: string, variant: VariantArg): void {
  const v = toVariant(variant);
  const p = props[key];
  if (!p?.specs || isEmpty(v)) return;
  p.specs = p.specs.filter((e) => !sameVariant(e, v));
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
