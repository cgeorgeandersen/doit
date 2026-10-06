#!/usr/bin/env node
/**
 * Lists the drafts still marked TODO REVIEW in the assessment's and the
 * playbook's words (src/assessment/content.ts, src/playbook/content.ts), with
 * the line to find each one and the start of its text. Delete a marker once
 * the words under it sound like you.
 *
 *   npm run drafts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['src/assessment/content.ts', 'src/playbook/content.ts'];

const isCode = (l) => l.trim() !== '' && !/^\s*(\/\/|\/\*\*?|\*)/.test(l);

/** The markers in one file: the line, the marker's note, and the key and text it covers. */
function draftsIn(file) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
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
  return found;
}

let total = 0;
for (const file of FILES) {
  const found = draftsIn(file);
  total += found.length;
  if (found.length === 0) {
    console.log(`Nothing left to review in ${file}.\n`);
    continue;
  }
  console.log(`${found.length} draft${found.length === 1 ? '' : 's'} to review in ${file}:\n`);
  for (const { line, note, what } of found) console.log(`  line ${String(line).padStart(3)}  ${what}${note ? `   (${note})` : ''}`);
  console.log('');
}
if (total > 0) console.log('Rewrite what doesn’t sound like you, then delete the TODO REVIEW line above it.');
