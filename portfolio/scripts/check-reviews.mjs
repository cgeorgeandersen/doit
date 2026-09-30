/**
 * Which frameworks and posts are due for review?
 *
 *   npm run check:reviews            list everything, flag what's past the window
 *   npm run check:reviews -- --strict   same, but exit 1 when anything is due
 *
 * A framework's review date is `lastReviewed`; a post's is `lastReviewed` or,
 * if it has none, its `date`. The window (180 days) comes from
 * src/config/site.ts, the same number the amber stamps on the site use.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const siteTs = readFileSync(join(root, 'src/config/site.ts'), 'utf8');
const windowDays = Number(siteTs.match(/staleAfterDays:\s*(\d+)/)?.[1] ?? 180);
const strict = process.argv.includes('--strict');
const today = new Date();
const DAY = 86_400_000;

function field(frontmatter, name) {
  return frontmatter.match(new RegExp(`^${name}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm'))?.[1]?.trim();
}

const rows = [];
for (const collection of ['frameworks', 'writing']) {
  const dir = join(root, 'src/content', collection);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    continue;
  }
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (field(frontmatter, 'draft') === 'true') continue;
    const reviewed = field(frontmatter, 'lastReviewed') ?? (collection === 'writing' ? field(frontmatter, 'date') : undefined);
    const days = reviewed ? Math.floor((today - new Date(`${reviewed}T00:00:00Z`)) / DAY) : NaN;
    rows.push({ file: `${collection}/${file}`, reviewed: reviewed ?? '(none)', days, due: !(days <= windowDays) });
  }
}

rows.sort((a, b) => (b.days || 0) - (a.days || 0));
const width = Math.max(...rows.map((r) => r.file.length), 10);
console.log(`Review stamps: window ${windowDays} days, today ${today.toISOString().slice(0, 10)}\n`);
for (const r of rows) {
  const age = Number.isNaN(r.days) ? 'no date' : `${r.days} days ago`;
  console.log(`  ${r.due ? '!' : '✓'} ${r.file.padEnd(width)}  reviewed ${r.reviewed} (${age})${r.due ? '  ← due: re-read it, then set lastReviewed to today' : ''}`);
}

const due = rows.filter((r) => r.due).length;
console.log(due === 0 ? '\nEverything is within the review window.' : `\n${due} ${due === 1 ? 'item is' : 'items are'} due for review. Readers see an amber "may be out of date" stamp on ${due === 1 ? 'it' : 'them'}.`);
if (strict && due > 0) process.exit(1);
