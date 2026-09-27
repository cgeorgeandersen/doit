#!/usr/bin/env node
/**
 * Copies the few font files the essay uses from @fontsource packages into
 * src/assets/fonts, so the build ships only Latin (+ Latin Extended for body text)
 * and the single-file preview can inline them. Fonts are SIL Open Font License 1.1.
 * Usage: node scripts/copy-fonts.mjs
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'src', 'assets', 'fonts');

const files = [
  ['@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-normal.woff2', 'bodoni-moda-latin-opsz-normal.woff2'],
  ['@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-italic.woff2', 'bodoni-moda-latin-opsz-italic.woff2'],
  ['@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2', 'newsreader-latin-opsz-normal.woff2'],
  ['@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2', 'newsreader-latin-opsz-italic.woff2'],
  ['@fontsource-variable/newsreader/files/newsreader-latin-ext-opsz-normal.woff2', 'newsreader-latin-ext-opsz-normal.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-400-normal.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-italic.woff2', 'ibm-plex-mono-latin-400-italic.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2'],
  ['@fontsource-variable/bodoni-moda/LICENSE', 'LICENSE-bodoni-moda.txt'],
  ['@fontsource-variable/newsreader/LICENSE', 'LICENSE-newsreader.txt'],
  ['@fontsource/ibm-plex-mono/LICENSE', 'LICENSE-ibm-plex-mono.txt'],
];

await mkdir(out, { recursive: true });
for (const [from, to] of files) {
  await copyFile(join(nm, from), join(out, to));
  console.log('copied', to);
}
