/**
 * Check the offline neume-naming port against the backend's own answers.
 *
 * Run `export_naming.py` and `gen_cases.py` first: the one freezes the registry
 * the port reads, the other records what `derive_neume_name` says for every
 * case. Needs `node_modules` (the symlink the README's rebuild sets up).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundled = resolve(here, 'data/derive-check.mjs');

execFileSync(resolve(here, 'node_modules/.bin/esbuild'), [
  resolve(here, 'src/deriveName.ts'),
  '--bundle',
  '--format=esm',
  '--loader:.json=json',
  `--outfile=${bundled}`,
  '--log-level=warning',
]);

const { deriveNeumeNameOffline } = await import(bundled);
rmSync(bundled);

const cases = JSON.parse(readFileSync(resolve(here, 'data/derive-cases.json'), 'utf8'));
const wrong = cases
  .map((c) => ({ ...c, got: deriveNeumeNameOffline(c.components, c.base_type) }))
  .filter((c) => c.got !== c.expected);

console.log(`${cases.length - wrong.length}/${cases.length} match`);
for (const c of wrong.slice(0, 6)) console.log(JSON.stringify(c));
process.exit(wrong.length ? 1 : 0);
