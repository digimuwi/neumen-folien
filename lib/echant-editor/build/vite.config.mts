import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The eChant checkout to compile against; override with ECHANT_SRC.
const ECHANT = process.env.ECHANT_SRC ?? '/Users/nielspfeffer/Projects/neumes-playground/src';
const here = (p: string) => resolve(import.meta.dirname, p);

/**
 * The embed's one mocked seam: every eChant service reaches the backend through
 * `services/apiFetch.ts`, so redirecting that module — by resolved path, not by
 * specifier, since it is imported both as `./apiFetch` and `../services/apiFetch`
 * — puts the bundled payloads under the real service layer.
 */
const mockApiLayer = (): Plugin => ({
  name: 'echant-demo-api',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!source.endsWith('apiFetch')) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    return resolved?.id === `${ECHANT}/services/apiFetch.ts` ? here('src/demoApi.ts') : null;
  },
});

/** Fold the emitted stylesheet into the script so the deck needs one tag. */
const inlineCss = (): Plugin => ({
  name: 'echant-demo-inline-css',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const css = Object.entries(bundle).find(([name]) => name.endsWith('.css'));
    const script = Object.values(bundle).find((f) => f.type === 'chunk' && f.isEntry);
    if (!css || script?.type !== 'chunk') return;
    const [name, asset] = css;
    delete bundle[name];
    // The clef inspector's music font is served from the SPA's public root,
    // which does not exist here — carry it inline so nothing is fetched.
    const font = readFileSync(`${ECHANT}/../public/Leipzig.woff2`).toString('base64');
    const text = String(asset.type === 'asset' ? asset.source : '').replace(
      'url(/Leipzig.woff2)',
      `url(data:font/woff2;base64,${font})`,
    );
    const styles = JSON.stringify(text);
    script.code =
      `(function(){var s=document.createElement("style");s.textContent=${styles};` +
      `document.head.appendChild(s)})();\n` +
      script.code;
  },
});

export default defineConfig({
  root: here('.'),
  // A lib build does not define this for you; React and Emotion both read it.
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: {
    alias: [
      // Reuse the Verovio the deck already loaded instead of a second 7 MB copy.
      { find: 'verovio/wasm', replacement: here('src/shims/verovio-wasm.ts') },
      { find: 'verovio/esm', replacement: here('src/shims/verovio-esm.ts') },
      { find: /^verovio$/, replacement: here('src/shims/verovio-types.ts') },
      { find: '@echant', replacement: ECHANT },
    ],
  },
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: here('src/index.tsx'),
      name: 'EChantDemo',
      formats: ['iife'],
      fileName: () => 'echant-editor.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [mockApiLayer(), react({ jsxRuntime: "automatic" }), inlineCss()],
});
