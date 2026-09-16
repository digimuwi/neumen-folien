/**
 * How „Diffusa est" would be entered.
 *
 * Read off the chant's own stored encoding rather than invented: for every
 * syllable, the keys a user presses to build its neumes, and — where the
 * keyboard cannot reach — the inspector control that sets the rest.
 *
 * What the keyboard reaches in an adiastematic layer (`editor/Canvas.tsx`):
 *
 *   `*`        begin a neume; from inside one, begin the next
 *   `u/s/d`    append a note moving up / level / down
 *   Space      leave the neume; a second Space moves to the next syllable
 *   `r`        rotate the caret note's @tilt one step round the compass
 *   Shift+↑/↓  raise or lower the caret note's interval
 *
 * `keys` uses the first three, which is the contour — what the demo is about.
 * A note's @tilt is one click on the inspector's compass and three or four `r`
 * presses, so it rides with the other inspector steps; `keysWithTilt` is the
 * keyboard-only route for anyone who wants it.
 *
 * Two things neither route sets. A neume's stored base shape (`type_key`) is
 * not editable in the editor at all: a typed neume takes the first registry
 * shape for its contour, which is why this chant's `bivirga` comes out named
 * `bistropha`. And a littera significativa is entered in the neume inspector's
 * placement grid, so it appears as a `littera` step.
 */

import payloads from '../data/payloads-cropped.json';
import authoredByNeume from '../data/authored.json';
import { determineNeumeType } from '@echant/editor/Music';
import { deriveNeumeNameOffline, NameComponent } from './deriveName';

/** What the published corpus (`echant-data`) has for a neume, matched to the
 *  stored one by its facsimile zone. This chant's MEI carries a contour plus the
 *  marks and letters the annotator set, and no visual attributes at all, so it
 *  is the authority on which of a stored component's values someone typed. */
interface Authored {
  contour: (string | null)[];
  marks: string[][];
  attrs: Record<string, string>[];
  litterae: { letter: string; place: string }[];
  /** False where the two stores disagree about the note count; the marks then
   *  cannot be lined up note by note, so only the letters stand. */
  contourMatches: boolean;
}

const AUTHORED = authoredByNeume as Record<string, Authored | undefined>;

/** `r` steps through this from no tilt at all (Canvas.tsx's TILT_CYCLE). */
const TILT_CYCLE = [undefined, 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Stored nc attribute → the inspector field a user would click. `tilt` is in
 *  here rather than among the keys; see the note above. */
const FIELD_OF: Record<string, string> = {
  tilt: 'Tilt',
  curve: 'Curve',
  con: 'Connection',
  rellen: 'Length',
  s_shape: 'S-shape',
  waves: 'Waves',
  hooked: 'Flags',
  angled: 'Flags',
  looped: 'Looped',
  episema_form: 'Episema form',
  episema_place: 'Episema place',
};

/** …and back, so an authored step can be replayed onto a component. A `Flags`
 *  button carries its attribute as its value and sets it true. */
const FIELD_TO_ATTR: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_OF)
    .filter(([, field]) => field !== 'Flags')
    .map(([attr, field]) => [field, attr]),
);

const asAttr = (field: string, value: string): [string, unknown] =>
  field === 'Flags' ? [value, true] : [FIELD_TO_ATTR[field] ?? '', value];

/** One thing to do, in order. After a `key` the caret sits on the note that key
 *  made, so the `inspector` steps that follow apply to it; a `littera` step
 *  follows the Space that leaves the neume, where the placement grid is. */
export type EntryStep =
  | { kind: 'key'; key: string }
  | { kind: 'inspector'; field: string; value: string; seeded: boolean }
  | { kind: 'littera'; place: string; letter: string; seeded: boolean };

/** `seeded` marks a value the system supplied rather than a person: the class
 *  seed materialised onto the stored components, or an older backfill. Filtering
 *  those out leaves what an annotator actually entered — see `stepsAuthored`. */
const authoredOnly = (steps: EntryStep[]): EntryStep[] =>
  steps.filter((step) => step.kind === 'key' || !step.seeded);

export interface NeumeEntry {
  /** The stored neume's id. A typed neume gets a fresh one, so drive the
   *  inspector off the caret (`selection()`), not off this. */
  id: string;
  /** The shape stored in the corpus. Neither route sets this. */
  typeKey: string;
  /** `*`, the contour keys, and the Space that ends the neume. */
  keys: string[];
  /** The same, with the `r` presses that set each note's tilt. */
  keysWithTilt: string[];
  /** Keys and inspector clicks interleaved, in the order to perform them. */
  steps: EntryStep[];
  /** The same, without the values the system supplied — what a person types. */
  stepsAuthored: EntryStep[];
  /** The traditional name after `keys` alone… */
  expect: string;
  /** …after the authored steps… */
  expectAuthored: string;
  /** …after every step… */
  afterInspector: string;
  /** …and the name the stored neume itself reads out to. */
  target: string;
}

export interface SyllableEntry {
  syllable: string;
  syllableId: string;
  /** Every key for this syllable, including the Space that moves on. */
  keys: string[];
  keysWithTilt: string[];
  steps: EntryStep[];
  stepsAuthored: EntryStep[];
  neumes: NeumeEntry[];
}

const key = (k: string): EntryStep => ({ kind: 'key', key: k });

const tiltKeys = (tilt: string | null | undefined): string[] => {
  const steps = TILT_CYCLE.indexOf(tilt ?? undefined);
  return steps > 0 ? Array<string>(steps).fill('r') : [];
};

/** The inspector clicks one note needs, shape first, then marks, each tagged
 *  with whether the published corpus has it or the system supplied it. */
function noteSteps(component: NameComponent, published: Authored | undefined, note: number): EntryStep[] {
  const record = component as Record<string, unknown>;
  // `s_shape` is `@s-shape` in MEI; everything else spells the same.
  const publishedAttrs = published?.attrs[note] ?? {};
  const publishedMarks = published?.contourMatches ? published.marks[note] ?? [] : [];

  const attrs = Object.entries(FIELD_OF).flatMap(([attr, field]) => {
    const value = record[attr];
    if (value === null || value === undefined || value === false) return [];
    const written = value === true ? attr : String(value);
    const inCorpus = publishedAttrs[attr === 's_shape' ? 's-shape' : attr];
    return [
      {
        kind: 'inspector' as const,
        field,
        value: written,
        seeded: inCorpus !== (value === true ? 'true' : String(value)),
      },
    ];
  });
  const marks = (component.specials ?? []).map((mark) => ({
    kind: 'inspector' as const,
    field: 'Marks',
    value: mark,
    seeded: !publishedMarks.includes(mark),
  }));
  return [...attrs, ...marks];
}

/** What the document holds once only the contour has been typed. */
const typedComponents = (components: NameComponent[]): NameComponent[] =>
  components.map((c, i) => ({ intm: i === 0 ? null : c.intm, specials: [] }));

function neumeEntry(neume: {
  id?: string;
  type_key: string;
  components: Record<string, unknown>[];
  signif_letters?: { letter: string; place: string }[];
}): NeumeEntry {
  const components = neume.components as NameComponent[];
  const published = AUTHORED[neume.id ?? ''];
  const keys = ['*'];
  const keysWithTilt = ['*', ...tiltKeys(components[0]?.tilt)];
  const steps: EntryStep[] = [key('*'), ...noteSteps(components[0], published, 0)];

  components.slice(1).forEach((component, index) => {
    const motion = component.intm ?? 's';
    keys.push(motion);
    keysWithTilt.push(motion, ...tiltKeys(component.tilt));
    steps.push(key(motion), ...noteSteps(component, published, index + 1));
  });

  // The Space that leaves the neume; the placement grid is reachable after it.
  keys.push(' ');
  keysWithTilt.push(' ');
  steps.push(key(' '));
  for (const { letter, place } of neume.signif_letters ?? []) {
    const inCorpus = (published?.litterae ?? []).some((l) => l.letter === letter && l.place === place);
    steps.push({ kind: 'littera', place, letter, seeded: !inCorpus });
  }

  // A typed neume's base shape comes from its contour alone.
  const typed = typedComponents(components);
  const typedBase = determineNeumeType(typed.slice(1).map((c) => c.intm as 'u' | 's' | 'd')).at(0);

  // What the document holds once only the authored steps have been performed.
  const authoredComponents = components.map((component, note) => {
    const kept = authoredOnly(noteSteps(component, published, note));
    const attrs = Object.fromEntries(
      kept
        .filter((step) => step.kind === 'inspector' && step.field !== 'Marks')
        .map((step) => asAttr((step as { field: string }).field, (step as { value: string }).value)),
    );
    return {
      ...typed[note],
      ...attrs,
      specials: kept.filter((s) => s.kind === 'inspector' && s.field === 'Marks').map((s) => (s as { value: string }).value),
    } as NameComponent;
  });

  return {
    id: neume.id ?? '',
    typeKey: neume.type_key,
    keys,
    keysWithTilt,
    steps,
    stepsAuthored: authoredOnly(steps),
    expect: deriveNeumeNameOffline(typed, typedBase),
    expectAuthored: deriveNeumeNameOffline(authoredComponents, typedBase),
    afterInspector: deriveNeumeNameOffline(components, typedBase),
    target: deriveNeumeNameOffline(components, neume.type_key),
  };
}

function build(): SyllableEntry[] {
  const document = payloads.chantDocument;
  const bySyllable = new Map<string, typeof document.neumes>();
  for (const neume of document.neumes) {
    const owner = neume.assignment ?? '';
    bySyllable.set(owner, [...(bySyllable.get(owner) ?? []), neume]);
  }

  return document.lines.flatMap((line) =>
    line.syllables.map((syllable) => {
      const neumes = (bySyllable.get(syllable.id ?? '') ?? []).map(neumeEntry);
      // One more Space moves the caret on to the next syllable.
      return {
        syllable: syllable.text,
        syllableId: syllable.id ?? '',
        keys: [...neumes.flatMap((n) => n.keys), ' '],
        keysWithTilt: [...neumes.flatMap((n) => n.keysWithTilt), ' '],
        steps: [...neumes.flatMap((n) => n.steps), key(' ')],
        stepsAuthored: [...neumes.flatMap((n) => n.stepsAuthored), key(' ')],
        neumes,
      };
    }),
  );
}

/** The whole chant, syllable by syllable, in reading order. */
export const entrySequence: SyllableEntry[] = build();

/** „Dif-fu-sa est" — the phrase the slide types. */
export const firstPhrase: SyllableEntry[] = entrySequence.slice(0, 4);

/** The same, with `steps` narrowed to what a person typed. Handed out as its own
 *  array so a driver can take either without unpicking the flags itself. */
const withAuthoredSteps = (entry: SyllableEntry): SyllableEntry => ({
  ...entry,
  steps: entry.stepsAuthored,
  neumes: entry.neumes.map((n) => ({ ...n, steps: n.stepsAuthored, afterInspector: n.expectAuthored })),
});

export const entrySequenceAuthored: SyllableEntry[] = entrySequence.map(withAuthoredSteps);
export const firstPhraseAuthored: SyllableEntry[] = firstPhrase.map(withAuthoredSteps);
