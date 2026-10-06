#!/usr/bin/env node
/**
 * Makes public/playbook.pdf from the playbook page, exactly as it prints, and
 * saves that page's fingerprint in src/playbook/pdf.json. The page offers the
 * download only while the two match (see src/playbook/pdf.ts), so run this
 * after any change to the playbook's words, markup or styles, then commit both
 * files.
 *
 *   npm run playbook:pdf
 *
 * It builds the site, serves dist/ on a spare local port, prints /playbook on
 * Letter paper with Chromium, and checks the result is two pages. Chromium for
 * Playwright is needed once on a new machine:
 *
 *   npx playwright-core install chromium
 */
import { spawnSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PDF = join(ROOT, 'public', 'playbook.pdf');
const STAMP = join(ROOT, 'src', 'playbook', 'pdf.json');
const PAGES = 2;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// 1. A fresh build, so the PDF is printed from the page as it is now.
console.log('Building the site…');
const build = spawnSync('npx', ['astro', 'build'], { cwd: ROOT, stdio: 'inherit' });
if (build.status !== 0) fail('The build failed, so there is no page to print. Fix the error above and run this again.');

// 2. Serve dist/ the way Vercel does: /playbook is dist/playbook/index.html.
async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html'), `${clean}.html`]) {
    const file = join(DIST, candidate);
    if (!file.startsWith(DIST)) continue;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      // Try the next form.
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  const file = await resolveFile(request.url ?? '/');
  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  response.end(await readFile(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

// 3. Print it.
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  server.close();
  fail('Playwright is missing. Run npm ci in portfolio/ first.');
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  server.close();
  fail(`Chromium isn't installed for Playwright yet. Run this once, then try again:\n\n  npx playwright-core install chromium\n\n(${String(error).split('\n')[0]})`);
}

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/playbook`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fingerprint = await page.locator('[data-fingerprint]').getAttribute('data-fingerprint');
  if (!fingerprint) fail('The playbook page has no data-fingerprint, so the PDF could not be matched to it.');

  const bytes = await page.pdf({ format: 'Letter', printBackground: true, tagged: true, outline: true });
  // Each page object is written as "/Type /Page"; "/Pages" is the list that holds them.
  const pages = (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  if (pages !== PAGES) {
    fail(`The playbook printed on ${pages} pages, not ${PAGES}, so the PDF was not saved. Shorten the words or adjust the print styles in src/playbook/playbook.css, then run this again.`);
  }

  await writeFile(PDF, bytes);
  await writeFile(STAMP, `${JSON.stringify({ fingerprint, pages, paper: 'Letter' }, null, 2)}\n`);
  console.log(`\nSaved public/playbook.pdf (${pages} pages, ${Math.round(bytes.length / 1024)} KB) and src/playbook/pdf.json.`);
  console.log('Commit both files. The next build offers the download again.');
} finally {
  await browser.close();
  server.close();
}
