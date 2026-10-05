#!/usr/bin/env node
/**
 * Copies the two font files the page uses from the @fontsource packages into
 * src/assets/fonts, Latin only, the same cuts the portfolio serves:
 * Bricolage Grotesque (with its optical-size axis) for headlines and
 * Instrument Sans for everything else. Both are SIL Open Font License 1.1.
 * Run it again only if the font packages are updated: npm run fonts
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'src', 'assets', 'fonts');

const files = [
  ['@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2', 'bricolage-grotesque-latin-opsz-normal.woff2'],
  ['@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2', 'instrument-sans-latin-wght-normal.woff2'],
  ['@fontsource-variable/bricolage-grotesque/LICENSE', 'LICENSE-bricolage-grotesque.txt'],
  ['@fontsource-variable/instrument-sans/LICENSE', 'LICENSE-instrument-sans.txt'],
];

await mkdir(out, { recursive: true });
for (const [from, to] of files) {
  await copyFile(join(nm, from), join(out, to));
  console.log('copied', to);
}
