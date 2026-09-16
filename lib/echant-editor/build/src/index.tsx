/**
 * `window.EChantDemo` — the embeddable eChant neume editor.
 *
 * Mounts the real editor into a slide and hands back a handle a driver script
 * can steer. Steering goes through the DOM the app itself listens on (a
 * `mouseover` on a rendered neume, a `mousedown` where a click would land, a
 * `keydown` on the editor's input), so the demo shows the application behaving
 * rather than a script calling into its internals.
 */

import { createRoot, Root } from 'react-dom/client';

import { getEditorDocument, useDocument } from '@echant/editor/store';
import { AdiastematicEditState } from '@echant/editor/edit_states/AdiastematicEditState';
import { SylEditState } from '@echant/editor/edit_states/SylEditState';
import { deriveNameComponents } from '@echant/editor/deriveName';
import { getDoc, redo, undo, useDocStore } from '@echant/document/store';
import { useHoverLink } from '@echant/state/hoverLink';

import { DemoEditor } from './DemoEditor';
import { CHANT_ID, INLINE_FACSIMILE, setBlank, setFacsimileUrl } from './demoApi';
import { deriveNeumeNameOffline } from './deriveName';
import { entrySequence, firstPhrase } from './entrySequence';
import './demo.css';

const DRAFT_KEY = `echant-doc-draft:${CHANT_ID}`;

export interface MountOptions {
  /** Override the folio image. The default is the copy inlined in the bundle;
   *  `facsimile.jpg` next to the bundle is the same picture, but reading it back
   *  from a `file://` page taints the canvas (see README). */
  facsimile?: string;
  /** CSS width of the facsimile pane. */
  facsimileWidth?: string;
  /** Start with the keyboard handed to the editor. Default: false. */
  active?: boolean;
  /** The app's editing-hints overlay, which sits over the music pane. Default:
   *  false, because a slide showing the notation does not want a bar on it. */
  hints?: boolean;
  /** 'chant' opens the annotated chant; 'blank' opens the same folio with its
   *  text and syllables but no neumes, ready to be entered. Default 'chant'. */
  start?: 'chant' | 'blank';
  /** Undo reveal.js's slide scale so the editor's pointer maths stays exact.
   *  'auto' measures it; a number forces it; false leaves the scale alone. */
  counterScale?: 'auto' | number | false;
  onReady?: () => void;
  onActiveChange?: (active: boolean) => void;
}

export interface NeumeRef {
  id: string;
  typeKey: string;
  syllable: string;
}

export interface NeumeEncoding {
  id: string;
  typeKey: string;
  syllable: string;
  notes: Record<string, unknown>[];
  litterae: { letter: string; place: string }[];
  name: string;
}

export interface SelectionInfo {
  kind: 'neume' | 'nc' | 'syllable' | 'none';
  neumeId?: string;
  neumeName?: string;
  typeKey?: string;
  syllable?: string;
  ncIndex?: number;
  specials?: string[];
}

export interface DemoHandle {
  readonly element: HTMLElement;
  hoverNeume(id: string | null): boolean;
  /** Select the whole neume — the state whose inspector carries the derived
   *  name and the significative-letter grid. */
  selectNeume(id: string): boolean;
  /** Select one note inside a neume — the state whose inspector carries that
   *  note's marks (liquescent, episema, oriscus, quilisma, tilt …). */
  selectNote(id: string, index: number): boolean;
  /** Put the music caret at the start of a syllable, by clicking above its
   *  lyric the way a user would. This is how entry begins on a blank chant,
   *  where there is no neume to click. Async: it waits for the music pane to
   *  have painted, which a load does not wait for. */
  selectSyllable(idOrIndex: string | number): Promise<boolean>;
  /** Click a control in the note inspector, by the field's own label and the
   *  control's value — e.g. ('Marks', 'episema'), ('Flags', 'angled'),
   *  ('Connection', 'g'). This is where everything the keyboard cannot set is
   *  set; see `EChantDemo.entrySequence`. */
  clickInspector(field: string, value: string): boolean;
  /** Click the selected note's mark toggle in the inspector. */
  toggleMark(mark: 'oriscus' | 'quilisma' | 'strophicus' | 'liquescent' | 'episema'): boolean;
  /** Put a littera significativa on the selected NEUME, through the neume
   *  inspector's placement grid. The caret must be on the neume, not inside it
   *  — one Space after the last note gets there. Async: the picker is a popover
   *  that has to render before its field can be typed into. */
  setLittera(place: string, letter: string): Promise<boolean>;
  key(key: string, modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean;
  type(keys: readonly string[], delayMs?: number): Promise<void>;
  undo(): void;
  redo(): void;
  selection(): SelectionInfo;
  neumes(): NeumeRef[];
  /** The live encoding, neume by neume: each note's attributes as stored, its
   *  significative letters, and its derived name. The read-back that makes an
   *  entry sequence checkable against the corpus. */
  encoding(): NeumeEncoding[];
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
  isReady(): boolean;
  /** Throw the edits away and reload the chant. Resolves once it is back;
   *  `onReady` is not called again. `{ blank: true }` reloads it without its
   *  neumes, `{ blank: false }` with them; omitted keeps the current mode. */
  reset(options?: { blank?: boolean }): Promise<void>;
  relayout(): void;
  onChange(listener: () => void): () => void;
  unmount(): void;
}

const raf = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The placement grid's cells, in document order; its centre is not a button.
 *  Mirrors `GRID_PLACES` in the neume inspector. */
const LITTERA_PLACES = [
  'above-left', 'above', 'above-right',
  'left', 'right',
  'below-left', 'below', 'below-right',
];
const GRID_CELL = 34;
/** How long a driver may wait for Verovio to paint before giving up. */
const PAINT_TIMEOUT_MS = 5000;

/** Write into a React-controlled input the way typing does, so its onChange
 *  fires — React tracks the value on the DOM node and skips a plain assignment. */
function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A real click at a point, which is how the editor decides where its caret
 *  goes. `detail` is the click count: a second click lifts the caret from the
 *  note under the pointer to the whole neume. */
const click = (target: Element, clientX: number, clientY: number, detail: number): boolean => {
  const init = { bubbles: true, cancelable: true, clientX, clientY, detail };
  target.dispatchEvent(new MouseEvent('mousedown', init));
  window.dispatchEvent(new MouseEvent('mouseup', init));
  return true;
};

const dropDraft = (): void => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode — a missing draft costs nothing here */
  }
};

/** The document store arms `window.onbeforeunload` while the document is dirty.
 *  In the app that guards unsaved work; in a slide deck it would ask the
 *  presenter to confirm leaving the page after any demo edit. Registered after
 *  the store's own subscriber, so it runs second and wins. */
const suppressUnloadPrompt = (): (() => void) =>
  useDocStore.subscribe(() => {
    window.onbeforeunload = null;
  });

/** Canvas.tsx keeps its hidden input focused by asking `#root` whether the
 *  active element is inside the app. Off the SPA there is no such element, and
 *  the lookup would throw on every render. */
function ensureRootId(element: HTMLElement): void {
  const existing = document.getElementById('root');
  if (existing === element) return;
  if (existing) {
    console.warn('[EChantDemo] another #root exists; the editor may fight it for focus');
    return;
  }
  element.id = 'root';
}

export function mount(element: HTMLElement, options: MountOptions = {}): DemoHandle {
  const {
    facsimile = INLINE_FACSIMILE,
    facsimileWidth = '38%',
    active: startActive = false,
    hints = false,
    start = 'chant',
    counterScale = 'auto',
    onReady,
    onActiveChange,
  } = options;

  setFacsimileUrl(facsimile);
  setBlank(start === 'blank');
  dropDraft();

  element.classList.add('echant-demo');
  const stage = document.createElement('div');
  stage.className = 'echant-demo-stage';
  element.replaceChildren(stage);
  ensureRootId(stage);

  // Parked focus: somewhere outside `#root` that is neither <body> nor an input,
  // which is exactly the state in which Canvas.tsx leaves the keyboard alone —
  // so the deck keeps its arrow keys until the editor is handed the focus.
  const parking = document.createElement('span');
  parking.className = 'echant-demo-parking';
  parking.tabIndex = -1;
  document.body.appendChild(parking);

  let active = false;
  let ready = false;
  let firstLoadDone = false;
  /** Everyone awaiting a reload. A list, not a slot: a driver that resets on a
   *  loop while the slide change resets too has two in flight, and a single
   *  slot would drop the first one's resolver and hang its `await` for good. */
  let reloadWaiters: (() => void)[] = [];
  let root: Root | null = null;
  let revision = 0;
  let reloadToken = 0;
  const listeners = new Set<() => void>();

  const editorInput = (): HTMLInputElement | null => stage.querySelector('input.canvas-input');
  const editorSvg = (): Element | null => stage.querySelector('.canvas-embedding');

  const park = (): void => {
    if (document.activeElement !== parking) parking.focus({ preventScroll: true });
  };

  const setActive = (next: boolean): void => {
    if (active === next) return;
    active = next;
    element.classList.toggle('echant-demo-active', active);
    if (active) editorInput()?.focus({ preventScroll: true });
    else park();
    onActiveChange?.(active);
  };

  // Reveal scales the slide, which desynchronises the annotation canvas's
  // `getBoundingClientRect` (scaled) from its backing store (unscaled). Undoing
  // the scale on our own subtree restores a 1:1 chain without touching the deck.
  const applyCounterScale = (): void => {
    if (counterScale === false) return;
    stage.style.transform = '';
    stage.style.width = '';
    stage.style.height = '';
    const measured =
      typeof counterScale === 'number'
        ? counterScale
        : element.offsetWidth
          ? element.getBoundingClientRect().width / element.offsetWidth
          : 1;
    if (!Number.isFinite(measured) || measured <= 0 || Math.abs(measured - 1) < 0.005) return;
    stage.style.transformOrigin = 'top left';
    stage.style.transform = `scale(${1 / measured})`;
    stage.style.width = `${measured * 100}%`;
    stage.style.height = `${measured * 100}%`;
  };

  const notify = (): void => listeners.forEach((listener) => listener());

  const settleReloads = (): void => {
    const waiting = reloadWaiters;
    reloadWaiters = [];
    waiting.forEach((resolve) => resolve());
  };

  /** The chant has finished loading — on the first mount and after every
   *  `reset`. `onReady` is the caller's once-per-mount signal, so a reset must
   *  not re-fire it: a driver that resets from inside `onReady` would loop. */
  const onLoaded = (): void => {
    const first = !firstLoadDone;
    firstLoadDone = true;
    ready = true;
    if (active) editorInput()?.focus({ preventScroll: true });
    settleReloads();
    if (!first) return;
    if (startActive) setActive(true);
    onReady?.();
  };

  const render = (): void => {
    revision += 1;
    root?.render(
      <DemoEditor
        facsimileWidth={facsimileWidth}
        hints={hints}
        revision={revision}
        reloadToken={reloadToken}
        onCaretChange={notify}
        onReady={onLoaded}
      />,
    );
  };

  const relayout = (): void => {
    applyCounterScale();
    if (root) render();
  };

  // Hold the render back until the slide is actually on screen: laying the panes
  // out inside a `display: none` section measures everything as zero, and reveal
  // shows the slide again without anything re-rendering.
  const startWhenVisible = (): void => {
    if (root || !element.offsetWidth || !element.offsetHeight) return;
    applyCounterScale();
    root = createRoot(stage);
    render();
  };

  const observer = new ResizeObserver(() => {
    if (!root) startWhenVisible();
    else if (element.offsetWidth) relayout();
  });
  observer.observe(element);
  startWhenVisible();

  const onPointerDown = (event: PointerEvent): void => {
    if (!ready) return;
    setActive(stage.contains(event.target as Node));
  };
  const onFocusChange = (): void => {
    if (active) return;
    const activeElement = document.activeElement;
    if (activeElement === null || activeElement === document.body || stage.contains(activeElement)) park();
  };
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && active) setActive(false);
  };

  const onFocusOut = (): void => queueMicrotask(onFocusChange);

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusin', onFocusChange);
  document.addEventListener('focusout', onFocusOut);
  stage.addEventListener('keydown', onKeyDownCapture, true);
  park();

  const unsubscribeUnload = suppressUnloadPrompt();
  const unsubscribeDoc = useDocStore.subscribe(notify);

  // --- driving ------------------------------------------------------------

  const neumeGroup = (id: string): Element | null =>
    editorSvg()?.querySelector(`.neume[data-id="${CSS.escape(id)}"]`) ?? null;

  const handle: DemoHandle = {
    element: stage,

    hoverNeume(id) {
      const svg = editorSvg();
      if (!svg) return false;
      if (id === null) {
        svg.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        return true;
      }
      const group = neumeGroup(id);
      if (!group) return false;
      group.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return true;
    },

    selectNeume(id) {
      const group = neumeGroup(id);
      if (!group) return false;
      const box = group.getBoundingClientRect();
      // Above the lyric and inside the neume is where Canvas.tsx puts a music
      // caret; the second click is what lifts it from a note to the neume.
      return click(group, box.left + box.width / 2, box.top + box.height / 2, 2);
    },

    selectNote(id, index) {
      const group = neumeGroup(id);
      const note = group?.querySelectorAll('.nc')[index];
      if (!group || !note) return false;
      const box = note.getBoundingClientRect();
      // The caret advances past each note's midpoint, so land just beyond it.
      return click(group, box.left + box.width / 2 + 1, box.top + box.height / 2, 1);
    },

    async selectSyllable(idOrIndex) {
      // A load resolves before Verovio has painted, and entry usually starts the
      // moment it does, so wait for the syllable rather than miss it.
      const find = (): Element | undefined => {
        const groups = [...(editorSvg()?.querySelectorAll('.syllable') ?? [])];
        return typeof idOrIndex === 'number'
          ? groups[idOrIndex]
          : groups.find((g) => g.querySelector('.syl')?.getAttribute('data-id') === idOrIndex);
      };
      const deadline = Date.now() + PAINT_TIMEOUT_MS;
      let group = find();
      while (!group && Date.now() < deadline) {
        await raf();
        group = find();
      }
      const lyric = group?.querySelector('.syl');
      if (!lyric) return false;
      const box = lyric.getBoundingClientRect();
      // Above the lyric is the music caret's territory; with no neume there yet
      // the click lands at the syllable's start, which is where entry begins.
      return click(group!, box.left + box.width / 2, box.top - 12, 1);
    },

    clickInspector(field, value) {
      const inspector = stage.querySelector('.echant-demo-inspector');
      if (!inspector) return false;
      const label = [...inspector.querySelectorAll('.MuiTypography-caption')].find(
        (node) => node.textContent?.trim() === field,
      );
      const button = label?.parentElement?.querySelector(
        `button[value="${CSS.escape(value)}"]`,
      ) as HTMLButtonElement | null;
      if (!button) return false;
      button.click();
      return true;
    },

    toggleMark(mark) {
      return handle.clickInspector('Marks', mark);
    },

    async setLittera(place, letter) {
      // The grid is on the NEUME inspector, so the caret has to be on the neume
      // rather than inside it — one Space after the last note gets there.
      const cells = [...stage.querySelectorAll('.echant-demo-inspector .MuiButtonBase-root')].filter(
        (button) => (button as HTMLElement).offsetWidth === GRID_CELL,
      );
      const cell = cells[LITTERA_PLACES.indexOf(place)] as HTMLElement | undefined;
      if (!cell) return false;
      cell.click();
      await raf();
      await raf();

      // The field writes straight through on input, so the letter is set as
      // soon as it is typed; picking the option is what closes the popover.
      const portal = stage.ownerDocument;
      const input = portal.querySelector('.MuiPopover-paper input') as HTMLInputElement | null;
      if (!input) return false;
      setNativeValue(input, letter);
      await raf();
      await raf();

      const option = [...portal.querySelectorAll('.MuiAutocomplete-option')].find(
        (li) => li.textContent?.trim().startsWith(letter),
      ) as HTMLElement | undefined;
      if (option) option.click();
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await raf();
      return true;
    },

    key(key, modifiers = {}) {
      const input = editorInput();
      if (!input) return false;
      if (!active) input.focus({ preventScroll: true });
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
      return true;
    },

    async type(keys, delayMs = 260) {
      for (const key of keys) {
        handle.key(key);
        await wait(delayMs);
      }
      await raf();
    },

    undo() {
      const button = stage.querySelector('[data-demo="undo"]') as HTMLButtonElement | null;
      if (button && !button.disabled) button.click();
      else undo();
    },

    redo() {
      const button = stage.querySelector('[data-demo="redo"]') as HTMLButtonElement | null;
      if (button && !button.disabled) button.click();
      else redo();
    },

    selection() {
      const music = getEditorDocument().music;
      if (music instanceof SylEditState) {
        return {
          kind: 'syllable',
          syllable: music.layer.children[music.focus.inLayer]?.syl.text.toString(),
        };
      }
      if (!(music instanceof AdiastematicEditState)) return { kind: 'none' };
      const neume = music.currentNeume;
      if (!neume) return { kind: 'none' };
      const position = music.pos;
      const ncIndex =
        'inNeume' in position && typeof position.inNeume === 'number' ? position.inNeume : undefined;
      const nc = ncIndex === undefined ? undefined : ncIndex === 0 ? neume.head : neume.tail[ncIndex - 1];
      return {
        kind: nc ? 'nc' : 'neume',
        neumeId: neume.facs,
        typeKey: neume.neumeType,
        neumeName: deriveNeumeNameOffline(deriveNameComponents(neume), neume.neumeType),
        syllable: music.layer.children[music.inLayer]?.syl.text.toString(),
        ncIndex,
        specials: nc ? [...nc.specials] : undefined,
      };
    },

    neumes() {
      const document = getDoc();
      if (!document) return [];
      const syllableText = new Map(
        document.lines.flatMap((line) => line.syllables.map((s) => [s.id ?? '', s.text] as const)),
      );
      return document.neumes
        .filter((neume): neume is typeof neume & { id: string } => Boolean(neume.id))
        .map((neume) => ({
          id: neume.id,
          typeKey: neume.type_key,
          syllable: syllableText.get(neume.assignment ?? '') ?? '',
        }));
    },

    encoding() {
      const document = getDoc();
      if (!document) return [];
      const syllableText = new Map(
        document.lines.flatMap((line) => line.syllables.map((s) => [s.id ?? '', s.text] as const)),
      );
      return document.neumes.map((neume) => ({
        id: neume.id ?? '',
        typeKey: neume.type_key,
        syllable: syllableText.get(neume.assignment ?? '') ?? '',
        // Only the attributes an nc actually carries, so a typed neume and a
        // stored one compare directly.
        notes: neume.components.map((component) =>
          Object.fromEntries(
            Object.entries(component).filter(
              ([field, value]) =>
                value !== null &&
                value !== undefined &&
                field !== 'pname' &&
                field !== 'oct' &&
                field !== 'stroke_idx' &&
                !(Array.isArray(value) && value.length === 0),
            ),
          ),
        ),
        litterae: (neume.signif_letters ?? []).map(({ letter, place }) => ({ letter, place })),
        name: deriveNeumeNameOffline(neume.components as never, neume.type_key),
      }));
    },

    activate: () => setActive(true),
    deactivate: () => setActive(false),
    isActive: () => active,
    isReady: () => ready,

    reset(options = {}) {
      if (options.blank !== undefined) setBlank(options.blank);
      dropDraft();
      ready = false;
      useHoverLink.getState().clear();
      const reloaded = new Promise<void>((resolve) => {
        reloadWaiters.push(resolve);
        // A host that never gets a box would otherwise leave the caller
        // awaiting for good; a demo loop must not be able to stall on this.
        setTimeout(resolve, PAINT_TIMEOUT_MS);
      });
      // Reload the document in place. Tearing the React root down and building
      // it again would work too, but a looping demo would then blink the panes
      // out on every pass.
      reloadToken += 1;
      if (root) render();
      else startWhenVisible();
      return reloaded;
    },

    relayout,

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    unmount() {
      observer.disconnect();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusOut);
      stage.removeEventListener('keydown', onKeyDownCapture, true);
      unsubscribeUnload();
      unsubscribeDoc();
      settleReloads();
      listeners.clear();
      root?.unmount();
      root = null;
      parking.remove();
      if (stage.id === 'root') stage.removeAttribute('id');
      element.classList.remove('echant-demo', 'echant-demo-active');
      element.replaceChildren();
      dropDraft();
    },
  };

  return handle;
}

export const chantId = CHANT_ID;
export { entrySequence, firstPhrase };
export type { EntryStep, NeumeEntry, SyllableEntry } from './entrySequence';
