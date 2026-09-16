# Verovio toolkit, adiastematic fork

`verovio-toolkit-wasm.js` — the calligraphic adiastematic neume renderer, built for this deck.

| | |
|---|---|
| source | `digimuwi/verovio-adiastematic`, branch `adiastematic`, commit `5c3ee0e` |
| reports | `6.3.0-dev-5c3ee0e` (`toolkit.getVersion()`) |
| built with | emscripten 6.0.0, `./buildToolkit -w -H` |
| size | 7,101,664 bytes (2.3 MB gzipped) |

The build is `SINGLE_FILE=1`, so the WebAssembly binary is embedded in the JavaScript as a
data URI. Nothing is fetched at runtime, which is why the deck works from `file://` with no
server and no browser flags. There is no resource path to configure: the fonts and data
Verovio needs are compiled in. Humdrum support is excluded.

## Use

```html
<script defer src="lib/verovio/verovio-toolkit-wasm.js"></script>
<script defer src="live-neume.js"></script>
```

Both tags must be external files with `defer`. An *inline* `<script defer>` ignores the
attribute and runs before the toolkit has defined the global.

```js
verovio.module.onRuntimeInitialized = () => {
  const toolkit = new verovio.toolkit();
  toolkit.setOptions({ neumeCalligraphic: true, /* … */ });
  toolkit.loadData(mei);
  element.innerHTML = toolkit.renderToSVG(1);
};
```

`neumeCalligraphic` is what selects the pen renderer; without it Verovio falls back to the
square notation glyphs of the DDMAL neume module.

## Rebuilding

```sh
git -C ~/Projects/verovio worktree add /tmp/vrv-adia adiastematic
cd /tmp/vrv-adia/emscripten
source ~/emsdk/emsdk_env.sh
./buildToolkit -w -H
cp build/verovio-toolkit-wasm.js ~/Projects/slides-morent/lib/verovio/
git -C ~/Projects/verovio worktree remove /tmp/vrv-adia
```

Roughly ten minutes on an M-series Mac. Do not build inside `~/Projects/verovio` itself; it
is usually checked out on another branch.
