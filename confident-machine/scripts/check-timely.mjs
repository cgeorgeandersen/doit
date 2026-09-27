#!/usr/bin/env node
/**
 * Freshness check for src/content/timely.json.
 *
 *   npm run check:facts            report entries older than meta.staleAfterDays
 *   npm run check:facts -- --strict   exit 1 if any entry is stale (for CI)
 *   npm run check:facts -- --today 2027-01-31   pretend it is another day
 *
 * "Stale" means the claim has not been re-checked against its source for too
 * long, not that it is wrong. Re-read the source, update the claim if needed,
 * and set lastChecked to today.
 */
import { readFileSync } from 'node:fs';

const file = new URL('../src/content/timely.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : null;
const today = todayArg ? new Date(`${todayArg}T00:00:00Z`) : new Date();
const limit = data.meta.staleAfterDays;

const days = (iso) => Math.floor((today.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);

const rows = [
  ...data.entries.map((e) => ({ id: e.id, kind: 'entry', lastChecked: e.lastChecked, source: e.sourceUrl })),
  ...data.halfLife.claims.map((c) => ({ id: c.id, kind: 'half-life', lastChecked: c.lastChecked, source: c.updateUrl })),
].map((r) => ({ ...r, age: days(r.lastChecked) }));

const stale = rows.filter((r) => r.age > limit).sort((a, b) => b.age - a.age);
console.log(`timely.json: ${rows.length} dated claims, freshness window ${limit} days, today ${today.toISOString().slice(0, 10)}.`);
if (!stale.length) {
  console.log('All claims were checked within the window.');
} else {
  console.log(`${stale.length} claim(s) need re-checking:`);
  for (const r of stale) console.log(`  ${r.id.padEnd(26)} ${String(r.age).padStart(4)} days  ${r.source}`);
}
if (strict && stale.length) process.exit(1);
