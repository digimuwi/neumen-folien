/**
 * Offline port of the backend's `derive_neume_name`
 * (`backend/src/echant/projection/mei.py`), which the neume inspector calls on
 * every edit to read out the traditional name of a neume's `<nc>` structure.
 *
 * The backend reads its registry only through `neume_marks`,
 * `neume_visual_attrs`, `canonical_neume_type` and `_structural_marks_of`, and
 * always at the registry name's own contour length — so every lookup it can
 * make is precomputed into `data/neume-naming.json` by `export_naming.py`. What
 * is ported here is the scoring and spelling choice on top of that table.
 */

import table from '../data/neume-naming.json';

interface Entry {
  name: string;
  contour: string[];
  base: string;
  order: number;
  structMarks: Record<string, string>;
  visual: Record<string, unknown>[];
  suffixes: string[];
}

export interface NameComponent {
  intm?: string | null;
  specials?: string[];
  curve?: string | null;
  con?: string | null;
  rellen?: string | null;
  s_shape?: string | null;
  waves?: number | null;
  hooked?: boolean | null;
  angled?: boolean | null;
  tilt?: string | null;
}

const ENTRIES = table.entries as Entry[];
const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]));
const MARK_WORDS = table.markWords as string[];
const STRUCTURAL = new Set(table.structuralSpecials as string[]);
const SUFFIX_MARKS = table.suffixMarks as string[];
const SHAPE_DEFINING = new Set(table.shapeDefiningVisual as string[]);
const VISUAL_FIELDS = table.visualAttrFields as (keyof NameComponent)[];

const normalizeTypeKey = (key: string): string =>
  key.trim().toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

const canonicalNeumeType = (key: string): string => {
  const stripped = MARK_WORDS.reduce((name, word) => name.split(word).join(' '), normalizeTypeKey(key));
  return stripped.split(/\s+/).filter(Boolean).join(' ') || normalizeTypeKey(key);
};

const sameContour = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** The head nc reads as 's' — its `intm` is the editor's "no preceding motion". */
const componentContour = (components: readonly NameComponent[]): string[] =>
  components.length === 0
    ? ['s']
    : components.map((c, i) => (i === 0 || c.intm == null ? 's' : c.intm));

const componentMarks = (components: readonly NameComponent[]): Set<string> =>
  new Set(components.flatMap((c) => c.specials ?? []));

const componentVisual = (component: NameComponent): Record<string, unknown> =>
  Object.fromEntries(
    VISUAL_FIELDS.filter((field) => component[field] != null).map((field) => [field, component[field]]),
  );

/** An nc meaningfully carries at most one base-defining mark; the first wins. */
const structuralMarksByIndex = (components: readonly NameComponent[]): Map<number, string> =>
  new Map(
    components
      .map((c, i) => [i, (c.specials ?? []).find((m) => STRUCTURAL.has(m))] as const)
      .filter((pair): pair is readonly [number, string] => pair[1] !== undefined),
  );

/** Whether a visual attr may DISCRIMINATE the name: `@con` only via a gap,
 *  `@tilt` only on a single-note stroke, where it is the shape. */
const isNamingAttr = (attr: string, value: unknown, n: number): boolean =>
  SHAPE_DEFINING.has(attr) || (attr === 'con' ? value === 'g' : attr === 'tilt' && n === 1);

interface Candidate {
  base: string;
  structScore: number;
  visualScore: number;
  rank: number;
}

/** Score one registry spelling against the components: base-defining marks must
 *  match exactly (dominant), shape-defining visual attrs score secondarily. */
function scoreEntry(
  entry: Entry,
  structOfComponents: Map<number, string>,
  visualOfComponents: Record<string, unknown>[],
  n: number,
): { structScore: number; visualScore: number } {
  const structScore = Object.entries(entry.structMarks).filter(
    ([index, mark]) => structOfComponents.get(Number(index)) === mark,
  ).length;
  const visualScore = entry.visual
    .slice(0, visualOfComponents.length)
    .reduce(
      (sum, attrs, i) =>
        sum +
        Object.entries(attrs).filter(
          ([attr, value]) => isNamingAttr(attr, value, n) && visualOfComponents[i][attr] === value,
        ).length,
      0,
    );
  return { structScore, visualScore };
}

/** Canonical base shapes for this contour, ranked by structural fit (best first).
 *  A base keeps its BEST score across the spellings that collapse to it, and its
 *  EARLIEST registry position as the tiebreaker. */
function candidateBases(contour: string[], components: readonly NameComponent[]): Candidate[] {
  const structOfComponents = structuralMarksByIndex(components);
  const visualOfComponents = components.map(componentVisual);
  const n = contour.length;
  const best = new Map<string, Candidate>();

  for (const entry of ENTRIES) {
    if (!sameContour(entry.contour, contour)) continue;
    const { structScore, visualScore } = scoreEntry(entry, structOfComponents, visualOfComponents, n);
    const previous = best.get(entry.base);
    const wins =
      !previous ||
      structScore > previous.structScore ||
      (structScore === previous.structScore && visualScore > previous.visualScore);
    best.set(entry.base, {
      base: entry.base,
      structScore: wins ? structScore : previous!.structScore,
      visualScore: wins ? visualScore : previous!.visualScore,
      rank: Math.min(previous?.rank ?? entry.order, entry.order),
    });
  }

  return [...best.values()].sort(
    (a, b) => b.structScore - a.structScore || b.visualScore - a.visualScore || a.rank - b.rank,
  );
}

const composeWords = (base: string, added: Set<string>): string =>
  [base, ...(added.has('episema') ? ['episematus'] : []), ...(added.has('liquescent') ? ['liquescens'] : [])].join(' ');

/** Fallback spelling, guarded against aliasing a DIFFERENT-contour registry key
 *  (a one-note `virga liquescens` would name the registry's two-note neume). */
function composeName(base: string, added: Set<string>, contour: string[]): string {
  const composed = composeWords(base, added);
  const aliased = BY_NAME.get(composed);
  return aliased && !sameContour(aliased.contour, contour) ? base : composed;
}

const sameSet = (a: readonly string[], b: Set<string>): boolean =>
  a.length === b.size && a.every((v) => b.has(v));

/** The traditional name a neume's `<nc>` structure reads out to. `baseType` (the
 *  stored `type_key`) only breaks a genuine tie between equally-fitting bases. */
export function deriveNeumeNameOffline(
  components: readonly NameComponent[],
  baseType?: string | null,
): string {
  const contour = componentContour(components);
  const stored = baseType && baseType.trim() ? canonicalNeumeType(baseType) : null;
  const ranked = candidateBases(contour, components);

  let base: string;
  if (ranked.length === 0) {
    base = stored ?? 'punctum';
  } else {
    const top = ranked
      .filter((c) => c.structScore === ranked[0].structScore && c.visualScore === ranked[0].visualScore)
      .map((c) => c.base);
    base = top.length === 1 ? top[0] : (stored !== null && top.includes(stored) ? stored : top[0]);
  }

  const added = new Set([...componentMarks(components)].filter((m) => SUFFIX_MARKS.includes(m)));
  const byBase = ENTRIES.filter((e) => e.base === base);
  const withContour = byBase.filter((e) => sameContour(e.contour, contour));
  const candidates = withContour.length > 0 ? withContour : byBase;
  if (candidates.length === 0) return composeName(base, added, contour);

  const exact = candidates.filter((e) => sameSet(e.suffixes, added));
  if (exact.length === 0) return composeName(base, added, contour);

  // Prefer the base name itself, then the fewest extra words, then shortest.
  const pool = [...exact].sort(
    (a, b) =>
      Number(a.name !== base) - Number(b.name !== base) ||
      a.name.split(' ').length - b.name.split(' ').length ||
      a.name.length - b.name.length,
  );
  return pool[0].name;
}
