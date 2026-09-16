/**
 * Stands in for `verovio/wasm` so the embed uses the Verovio the deck already
 * loaded (`lib/verovio/verovio-toolkit-wasm.js`, global `verovio`) instead of
 * bundling a second 7 MB copy.
 *
 * Readiness is polled on `module.calledRun` rather than hooked on
 * `onRuntimeInitialized`: that hook is a single slot, and the deck's own
 * `live-neume.js` assigns it too — whichever script ran last would silently win.
 * The Emscripten build sets `calledRun` immediately before calling the hook, so
 * polling sees the same moment without taking the slot from anyone.
 */

const POLL_TIMEOUT_MS = 20000;

type VerovioGlobal = { module: { calledRun?: boolean }; toolkit: new (module?: unknown) => unknown };

const globalVerovio = (): VerovioGlobal | undefined =>
  (window as unknown as { verovio?: VerovioGlobal }).verovio;

let pending: Promise<unknown> | null = null;

export const verovioToolkitClass = (): new (module?: unknown) => unknown => {
  const verovio = globalVerovio();
  if (!verovio) throw new Error('Verovio is not loaded — include lib/verovio/verovio-toolkit-wasm.js first');
  return verovio.toolkit;
};

/** Resolves with the runtime-initialized Verovio module of the page's global. */
export default function createVerovioModule(): Promise<unknown> {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const poll = () => {
      const verovio = globalVerovio();
      if (verovio?.module?.calledRun) {
        resolve(verovio.module);
      } else if (Date.now() > deadline) {
        reject(new Error('Verovio did not become ready — is lib/verovio/verovio-toolkit-wasm.js loaded?'));
      } else {
        requestAnimationFrame(poll);
      }
    };
    poll();
  });
  return pending;
}
