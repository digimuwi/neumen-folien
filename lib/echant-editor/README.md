# eChant neume editor, embedded

`echant-editor.js` — the eChant chant editor as one script, for a slide. It runs from
`file://`, makes no network request, and talks to no backend. The chant it opens is
„Diffusa est“, St. Gallen, Stiftsbibliothek, Cod. Sang. 338, S. 75 — the same one in
`assets/editor/editor-demo.mp4`.

| | |
|---|---|
| source | `digimuwi/neumes-playground`, branch `main`, commit `b8d25c9`, and the corpus after `clear_seeded_loops` |
| Verovio | the deck's own `lib/verovio/verovio-toolkit-wasm.js` (6.3.0-dev-5c3ee0e), reused |
| chant | `def918df-96d6-4fef-9c12-c2eaefc7db90` — 3 lines, 26 syllables, 56 neumes, 3 significative letters |
| size | `echant-editor.js` 1,124,699 bytes (432 kB gzipped), `facsimile.jpg` 130,278 bytes, this directory 1.4 MB |

`example.html` is a working page: open it from the Finder and the demo plays, a click
hands the editor over. It is also the shortest description of the API.

## Use

```html
<script defer src="lib/verovio/verovio-toolkit-wasm.js"></script>
<script defer src="lib/echant-editor/echant-editor.js"></script>
<script defer src="your-driver.js"></script>
```

All three must be external files with `defer`, and in this order. An *inline*
`<script defer>` ignores the attribute and runs before the bundles have defined their
globals. The editor needs Verovio, and it reuses the deck's copy rather than shipping a
second one, so `verovio-toolkit-wasm.js` has to be on the page.

```js
const demo = EChantDemo.mount(element, options);
```

`element` is the box the editor fills; it must have a size (`position: relative` and a
height). `mount` returns immediately. If the element has no box yet — a host with
`display: none` — the editor waits for one before laying itself out, because measuring a
pane at zero and never re-measuring is how an embedded editor comes back blank.

### `options`

| option | default | |
|---|---|---|
| `facsimile` | the inlined copy | URL of the folio image, see *The facsimile* below |
| `facsimileWidth` | `'38%'` | CSS width of the facsimile pane |
| `active` | `false` | hand the editor the keyboard straight away |
| `hints` | `false` | the app's editing-hints bar. It sits over the music pane, so a slide showing the notation wants it off |
| `start` | `'chant'` | `'blank'` opens the same folio with its text and syllables but no neumes — the state a page is in once its text has been read and before anyone has annotated the notation |
| `counterScale` | `'auto'` | undo reveal.js's slide scale, see *Reveal.js* below |
| `onReady` | | called once the chant is loaded and the panes are up. Once per mount: a `reset()` does not call it again, so a driver may safely reset from inside it |
| `onActiveChange` | | called with `true`/`false` when the keyboard changes hands |

### The handle

Driving goes through the DOM the app itself listens on: a `mouseover` on a rendered
neume, a `mousedown` where a click would land, a `keydown` on the editor's input, a
`click` on a real inspector button. So what the audience sees is the application
reacting, not a script writing into its state. The two exceptions are `undo`/`redo`,
which press the toolbar buttons but fall back to the store's own functions when a
button is disabled, and the read-only `selection()` / `neumes()`.

| | |
|---|---|
| `hoverNeume(id \| null)` | hover a neume in the music pane; its zone lights up on the facsimile. `null` clears |
| `selectNeume(id)` | select the whole neume — the inspector then shows the derived name and the significative-letter grid |
| `selectNote(id, index)` | select one note inside it — the inspector then shows that note's marks |
| `selectSyllable(id \| index)` | put the caret at a syllable's start by clicking above its lyric. How entry begins on a blank chant, where there is no neume to click. **async** — it waits for the music pane to paint |
| `clickInspector(field, value)` | click a control in the note inspector by the field's own label and the control's value: `('Marks','episema')`, `('Tilt','se')`, `('Flags','angled')`, `('Connection','g')`, `('Curve','c')`, `('Length','l')`. Everything the keyboard cannot set is set here |
| `toggleMark(mark)` | `clickInspector('Marks', mark)` |
| `setLittera(place, letter)` | put a littera significativa on the selected **neume** through the inspector's placement grid. The caret must be on the neume, not inside it — one Space after the last note gets there. **async** — the picker is a popover that has to render first |
| `key(key, modifiers?)` | send one keystroke to the editor. `*` begins a neume, `u`/`s`/`d` append a note, `Space` leaves the neume (a second one moves to the next syllable), `r` rotates the tilt, arrows move the caret, `Backspace`/`Delete` remove |
| `type(keys, delayMs?)` | the same, as a sequence, awaitable |
| `undo()` / `redo()` | the document's single undo timeline, shared by both panes |
| `selection()` | `{ kind: 'neume' \| 'nc' \| 'syllable' \| 'none', neumeId, neumeName, typeKey, syllable, ncIndex, specials }` |
| `neumes()` | `[{ id, typeKey, syllable }]` — what there is to address |
| `encoding()` | the live encoding: `[{ id, typeKey, syllable, notes, litterae, name }]`, each note's attributes as stored. The read-back that makes an entry sequence checkable against the corpus |
| `activate()` / `deactivate()` / `isActive()` | who has the keyboard |
| `isReady()` | whether the chant is loaded |
| `reset({ blank? })` | throw the edits away and reload the chant; resolves once it is back. `{ blank: true }` reloads it without its neumes, `{ blank: false }` with them, omitted keeps the current mode. It reloads the document in place, so a looping demo does not blink the panes out, and overlapping resets all resolve — a loop awaiting one while a slide change fires another keeps running |
| `relayout()` | re-measure after the host box changed; done automatically on resize |
| `onChange(listener)` | fires on every document edit and every caret move; returns an unsubscribe |
| `unmount()` | remove everything, including the listeners on `document` |
| `element` | the stage element the editor renders into |

Mount one instance per page. The editor's canvas keeps its hidden input focused by
asking `#root` whether the focus is inside the app, so `mount` gives its stage that id;
a second mount would find the id taken and warns.

## Entering the chant: `EChantDemo.entrySequence`

`start: 'blank'` opens the folio with its text and syllables and no neumes.
`EChantDemo.entrySequence` is how the chant would then be entered, read off its
own stored encoding rather than invented — one entry per syllable, in reading
order, with `EChantDemo.firstPhrase` the first four („Dif-fu-sa est").

```js
{ syllable: 'sa', syllableId: '…',
  keys: ['*', 'u', ' ', ' '],
  keysWithTilt: ['*', 'r','r','r','r', 'u', 'r','r', ' ', ' '],
  steps: [ { kind: 'key', key: '*' },
           { kind: 'inspector', field: 'Tilt', value: 'se' },
           { kind: 'inspector', field: 'Flags', value: 'angled' },
           { kind: 'key', key: 'u' },
           { kind: 'inspector', field: 'Tilt', value: 'ne' },
           { kind: 'inspector', field: 'Length', value: 'l' },
           { kind: 'key', key: ' ' } ],
  neumes: [ { id, typeKey: 'pes quadratus', keys, keysWithTilt, steps,
              expect: 'pes', afterInspector: 'pes quadratus', target: 'pes quadratus' } ] }
```

`steps` is the order to perform things in. After a `key` the caret sits on the
note that key just made, so the `inspector` steps that follow apply to it with
no selection call; a `littera` step follows the Space that leaves the neume,
where the placement grid is. `keys` alone types the contour and nothing else.

What the keyboard reaches in an adiastematic layer:

| | |
|---|---|
| `*` | begin a neume; from inside one, begin the next |
| `u` / `s` / `d` | append a note moving up, level or down |
| Space | leave the neume; **a second Space moves to the next syllable** |
| `r` | rotate the caret note's `@tilt` one step round the compass |
| Shift+↑/↓ | raise or lower the caret note's interval |

Note that Space *ends* a neume rather than beginning one; `*` begins one.

A note's `@tilt` takes three or four `r` presses and one click on the
inspector's compass, so `keys` leaves it to the inspector and `keysWithTilt` is
the keyboard-only route. Everything else an nc carries — its marks and its
calligraphic attributes — is inspector-only, and a littera significativa is
entered in the neume inspector's placement grid.

**Two things neither route sets.** A neume's stored base shape (`type_key`) is
not editable in the editor at all: a typed neume takes the first registry shape
for its contour. That is usually invisible, because the traditional name is
derived from the structure and the structure is reproduced exactly — a typed
`punctum` with `@tilt="e"` still reads `tractulus`, and with `@angled` a typed
`pes` reads `pes quadratus`. It shows in one place in this phrase: the stored
`bivirga` on „fu-" comes out as a `bistropha`, because at two notes the naming
model ignores `@tilt` and only the stored shape separates the two.

Running `firstPhrase` from a blank start reproduces the corpus encoding
attribute for attribute, litterae included (the `c` above „est"'s porrectus
flexus), and the five neumes read out as `tractulus episema`, `bistropha`,
`pes quadratus`, `porrectus flexus`, `bistropha`.

**How long it takes**, measured on a `file://` page:

| | |
|---|---|
| „Dif-fu-sa est", every step, 550 ms apart | 22 s (40 steps) |
| „Dif-fu-sa est", every step, 800 ms apart | 32 s |
| „Dif-fu-sa est", `keys` only, 800 ms apart | 16 s (20 steps) |
| „Dif-fu-sa", every step, 550 ms apart | 11 s (20 steps) |

The whole chant is 209 keys and 380 steps, so around three and a half minutes at
550 ms. `example.js` plays the first phrase at 550 ms and loops.

## What is real and what is mocked

Real, and the app's own code, unchanged: the music pane (`editor/Canvas.tsx` over the
calligraphic Verovio fork), the inspector (`editor/inspector/*`), the facsimile pane
(`components/AnnotationCanvas.tsx`), the document store with its single undo timeline
(`document/store.ts`), the editor's caret and edit states, the cross-pane hover link,
the editing-hints overlay, and the whole service layer above the network
(`services/chantService.ts`, `services/chantDocumentService.ts`,
`document/pageDocumentService.ts`, `services/neumeClassService.ts`).

There is exactly one mocked seam. Every eChant service reaches the backend through
`services/apiFetch.ts`, so the build redirects that module to `build/src/demoApi.ts`,
which answers from data compiled into the bundle:

| request | answered with |
|---|---|
| `GET /chants/{id}` | the chant record, dumped from the local DB |
| `GET /chants/{id}/document` | the chant document (lines, syllables, neumes, zones) |
| `GET /pages/{id}/document` | the folio record, with the bundled image |
| `POST /neume-classes/derive-name` | computed in the browser, see below |
| `GET /neume-classes` | eChant's own bundled fallback list |
| `GET /manuscripts/{id}/{chants,pages}` | the one chant, the one folio |
| `PUT /chants/{id}/document`, anything `/recognize` | HTTP 501 with a readable message |
| anything else | HTTP 501, and a console warning naming the request |

Left out because it needs a backend or makes no sense in a slide: the library and
navigation, save and reload, publish, chant split/move, the notation-mode switch,
recognition (region and whole folio) and its engine dialog, settings, login. The
toolbar carries the chant's name, its shelfmark and undo/redo, nothing else.

`POST /neume-classes/derive-name` is the one call that could not simply be dropped: the
inspector asks for it on every edit, and it is what makes the name read
„pes quadratus liquescens“ when a note is marked liquescent. The backend derives it in
Python from the neume-class registry. `build/src/deriveName.ts` is a port of
`backend/src/echant/projection/mei.py::derive_neume_name`, scoring against the registry
frozen into `build/data/neume-naming.json` by `build/export_naming.py`. Port and
original agree on all 7,584 cases `build/gen_cases.py` generates — every registry shape
against every base type, exhaustive 1- and 2-note structures over the structural marks
and tilts, and 6,000 random structures up to five notes. Run
`build/check_derive.mjs` to re-check it after a registry change. If a case ever slipped
through, the inspector would show a wrong traditional name; the encoding itself does not
depend on it.

## The facsimile

`facsimile.jpg` is the folio cropped to the chant's neighbourhood (page pixels
330–2720 × 2620–3980 of 3328 × 4992) and scaled to 1400 × 797. Every polygon and bbox
in the bundled chant document is translated and scaled to match, so the zones still sit
on the ink.

The same picture is also inlined in the bundle as a data URL, and that inlined copy is
what `mount` uses by default. The annotation canvas reads the image back with
`getImageData` (for margin detection and box tightening), and on a `file://` page an
`<img>` loaded from a separate file taints the canvas, so that read throws. A data URL
is same-origin everywhere. Pass `facsimile: 'lib/echant-editor/facsimile.jpg'` to use
the file instead; over `http(s)` that is fine, from `file://` it costs an uncaught
`SecurityError` per mount and disables box tightening, which this demo does not use.

## Reveal.js

Reveal scales a slide with a CSS transform. The annotation canvas sizes its backing
store from `clientWidth` (unscaled) but hit-tests against `getBoundingClientRect`
(scaled), so inside a scaled slide every pointer position on the facsimile would be off
by the scale factor. `counterScale: 'auto'` measures the accumulated scale on the mount
element and undoes it on the editor's own subtree, which leaves the editor the same size
on screen and the two measurements in agreement. Pass a number to force a factor, or
`false` to leave the scale alone.

Reveal hides a slide with `visibility`, not `display`, so the editor has its true size
from the start and comes back unchanged when the slide is shown again.

The deck keeps its keyboard until someone clicks into the editor. eChant's canvas keeps
its hidden input focused whenever the focus is on `<body>`, which would swallow the
deck's arrow keys, so `mount` parks the focus on a hidden, focusable element outside
`#root` — the one state in which that canvas leaves the focus alone. A pointerdown
inside the editor hands it the keyboard, Escape and a click outside give it back.

The document store arms `window.onbeforeunload` while there are unsaved edits. Nothing
can be saved here, so `mount` disarms it again; otherwise the browser would ask the
presenter to confirm leaving the page after any demo edit.

## Known rough edges

- eChant's `Canvas.tsx` calls `console.trace('keydown')` on every keystroke, and Verovio
  logs `Missing @n on <layer>` on every render. Both are noise in the console only.
- The facsimile pane letterboxes the wide crop in grey (`#e0e0e0`, the app's own canvas
  background). `facsimileWidth` tunes the fit.
- A window resize while the slide is hidden can leave the music caret drawn at the wrong
  place until the next selection. `relayout()` does not fix that one; a click does.
- A scripted run that is stopped between an edit and its undo leaves that edit in the
  document, and over many passes the chant drifts away from the manuscript's reading.
  A driver that loops should `reset()` when it stops.
- Nothing is typed until the caret is somewhere. On a blank chant there is no neume to
  click, so a driver has to `await selectSyllable(0)` before its first key — without it
  the keystrokes land in `DefaultEditState` and are silently dropped.
- `reset()` resolves after five seconds even if the editor never got a box to render in,
  so an awaiting loop cannot stall on a host that stays hidden. The reload has then not
  happened, and the next `selectSyllable` returns false.
- Drawing a box on the facsimile is still wired to region recognition and will report
  „Recognition is not part of this offline demo.“ Select Zone in the inspector works.
- Only one instance per page (see `#root` above).
- Nor one per frame of the same window: `mount` parks the focus again whenever its
  document loses it, so two instances in same-origin frames take it from each other in
  an endless microtask loop and freeze every window on that thread. Reveal's speaker
  view is exactly that (two `?receiver` iframes), so the deck does not mount the editor
  there. Parking only while `document.hasFocus()` would fix it in the bundle.

## Rebuilding

The bundle is built from `~/Projects/neumes-playground` (not modified) and
`~/Projects/echant-data`; `build/` holds everything that is not in those two.

```sh
cd ~/Projects/slides-morent/lib/echant-editor/build
ln -s ~/Projects/neumes-playground/node_modules node_modules   # vite + the app's deps

# 1. the payloads, from a COPY of the local dev database
DB=$PWD/data/echant-copy.db
cp ~/Projects/neumes-playground/backend/var/echant.db "$DB"
# The pes seed's @con="l" correction (f8eefc0) was applied to the development
# database on 2026-09-16, so this is a safeguard, not a step you should need.
# It is re-runnable: on a corrected database it finds nothing to do, and running
# it on the COPY means an older database cannot quietly put the loops back.
(cd ~/Projects/neumes-playground/backend &&
  ECHANT_DB_PATH="$DB" .venv/bin/python -m echant.scripts.clear_seeded_loops --apply)
~/Projects/neumes-playground/backend/.venv/bin/python extract.py

# 2. crop the folio and rebase the geometry onto the crop (writes ../facsimile.jpg)
cp ~/Projects/neumes-playground/backend/var/iiif-cache/a64244eb…af88b64 data/page-75-full.jpg
~/Projects/neumes-playground/backend/.venv/bin/python crop.py

# 3. freeze the neume-naming registry, and check the port against it
~/Projects/neumes-playground/backend/.venv/bin/python export_naming.py
~/Projects/neumes-playground/backend/.venv/bin/python gen_cases.py && node check_derive.mjs

# 4. the bundle
node_modules/.bin/vite build && cp dist/echant-editor.js ..
```

`ECHANT_SRC` points the build at another eChant checkout; the paths in the Python
scripts are absolute and would need editing too. Step 4 on its own reproduces the
shipped `echant-editor.js` byte for byte from the `build/data/` files, so a rebuild
only needs steps 1–3 when the chant, the folio or the registry changed.

`extract.py` calls the backend's own service layer against a copy of the database, so
the JSON is what the SPA would have received. The folio image is not in `echant-data`
(that manuscript has no `pages/` directory); the copy in the backend's IIIF cache is the
one whose sha256 matches the `pages` row, and it came from e-codices.

## Licences and credits

- **eChant** — `digimuwi/neumes-playground` (Morent / Böttiger / Pfeffer). The
  repository carries no licence file; the editor core is Böttiger's. Most of this
  bundle is that code, compiled.
- **Verovio** — LGPL-3.0-or-later, Laurent Pugin and others; the adiastematic fork is
  `digimuwi/verovio-adiastematic`. Not included here: the bundle uses the copy the deck
  already loads from `lib/verovio/`.
- **Leipzig** — the SMuFL music font the clef inspector draws with, inlined in the
  bundle's stylesheet. It ships with Verovio, under the SIL Open Font License 1.1 as far
  as I can see; `neumes-playground` records no provenance for its `public/Leipzig.woff2`.
- **reveal.js** — MIT, Hakim El Hattab. The deck's, not bundled here.
- **Facsimile** — St. Gallen, Stiftsbibliothek, Cod. Sang. 338, S. 75, from e-codices,
  CC BY-NC 4.0. The crop is a derivative under the same terms.
- **Bundled npm packages** — MIT: `react`, `react-dom`, `scheduler`, `react-is`,
  `@mui/material`, `@mui/icons-material`, `@mui/system`, `@mui/utils`,
  `@mui/private-theming`, `@mui/styled-engine`, `@emotion/*`, `@popperjs/core`,
  `@babel/runtime`, `stylis`, `clsx`, `zustand`, `immer`, `uuid`, `graphemer`,
  `colorjs.io`, `fast-xml-parser`. BSD-3-Clause: `hoist-non-react-statics`,
  `react-transition-group`. ISC: `hyphen`, `iterator-helper`.
