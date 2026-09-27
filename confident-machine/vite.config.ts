import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const htmlDir = resolve(import.meta.dirname, 'src/html');

/**
 * Lets index.html pull in one partial per chapter:  <!-- @include ch1-prediction.html -->
 * Keeps the essay's prose in readable HTML files instead of one enormous page.
 */
function htmlIncludes(): Plugin {
  const pattern = /<!--\s*@include\s+([\w./-]+)\s*-->/g;
  const expand = (html: string, depth = 0): string =>
    html.replace(pattern, (_match, file: string) => {
      if (depth > 4) throw new Error(`@include nested too deeply at ${file}`);
      return expand(readFileSync(resolve(htmlDir, file), 'utf8'), depth + 1);
    });
  return {
    name: 'html-includes',
    transformIndexHtml: { order: 'pre', handler: (html) => expand(html) },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(htmlDir)) server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  // Relative asset URLs, so the same build works at a domain root (Vercel)
  // and under a sub-path (GitHub Pages project sites).
  base: './',
  plugins: [htmlIncludes()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
