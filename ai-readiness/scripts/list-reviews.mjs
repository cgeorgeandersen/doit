#!/usr/bin/env node
/**
 * Lists the drafts in src/content.ts still marked TODO REVIEW, with the line
 * to find each one and the start of its text. Delete a marker once the words
 * under it sound like you.   npm run review
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content.ts');
const lines = readFileSync(file, 'utf8').split('\n');

const isCode = (l) => l.trim() !== '' && !/^\s*(\/\/|\/\*\*?|\*)/.test(l);

const found = [];
lines.forEach((line, i) => {
  const marker = line.match(/^\s*\/\/\s*TODO REVIEW:?\s*(.*)$/);
  if (!marker) return;
  // What the marker covers: the key on the next line of code, and the first piece of text from there on.
  const start = lines.findIndex((l, j) => j > i && isCode(l));
  const key = start < 0 ? '' : (lines[start].match(/^\s*"?([\w-]+)"?\s*:/)?.[1] ?? '');
  // A value on the key's own line (a number, say) is the thing to review; otherwise the first text that follows.
  const own = start < 0 ? '' : lines[start].slice(lines[start].indexOf(':') + 1).trim().replace(/,$/, '');
  const quoted = (from) => lines.slice(from, from + 6).join(' ').match(/"((?:[^"\\]|\\.)*)"/)?.[1];
  const value = own && !/^["[{]/.test(own) ? own : `"${quoted(start) ?? ''}"`;
  const what = [key, value].filter(Boolean).join(': ');
  found.push({ line: i + 1, note: marker[1].trim(), what: what.length > 96 ? `${what.slice(0, 95)}…"` : what });
});

if (found.length === 0) {
  console.log('Nothing left to review in src/content.ts.');
} else {
  console.log(`${found.length} draft${found.length === 1 ? '' : 's'} to review in src/content.ts:\n`);
  for (const { line, note, what } of found) console.log(`  line ${String(line).padStart(3)}  ${what}${note ? `   (${note})` : ''}`);
  console.log('\nRewrite what doesn’t sound like you, then delete the TODO REVIEW line above it.');
}
