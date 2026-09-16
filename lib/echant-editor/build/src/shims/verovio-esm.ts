/** Stands in for `verovio/esm`. The page global's `toolkit` already extends the
 *  real `VerovioToolkit` with the default module, and accepts one explicitly. */

import { verovioToolkitClass } from './verovio-wasm';

export class VerovioToolkit {
  constructor(module?: unknown) {
    return new (verovioToolkitClass())(module) as VerovioToolkit;
  }
}
