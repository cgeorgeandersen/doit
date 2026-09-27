#!/usr/bin/env node
/**
 * Prepares the public-domain training library for the in-browser n-gram model.
 *
 * Downloads three Project Gutenberg books (cached in scripts/.cache), strips the
 * Gutenberg header/footer, front matter, chapter headings and illustration notes,
 * then trims each book at a chapter boundary so the bundle stays small.
 *
 * Output (committed, so builds never need the network):
 *   src/corpus/alice.txt, src/corpus/pride.txt, src/corpus/holmes.txt
 *   src/corpus/manifest.json   (what was kept, word counts)
 *
 * Usage: node scripts/prepare-corpus.mjs
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, '.cache');
const outDir = join(here, '..', 'src', 'corpus');

const BOOKS = [
  {
    id: 'alice',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    year: 1865,
    gutenberg: 11,
    // Body starts at the first chapter heading after the table of contents.
    // The contents list is indented and carries titles, so it never matches.
    startPattern: /^CHAPTER I\.\s*$/m,
    startOccurrence: 1,
    headingPattern: /^CHAPTER [IVXLC]+\.\s*$/,
    headingHasTitleLine: true,
    unit: 'chapter',
    targetWords: Infinity, // keep the whole book
  },
  {
    id: 'pride',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    year: 1813,
    gutenberg: 1342,
    startPattern: /^It is a truth universally acknowledged/m,
    startOccurrence: 1,
    headingPattern: /^\s*CHAPTER [IVXLC]+\.?\s*$/i,
    headingHasTitleLine: false,
    unit: 'chapter',
    targetWords: 62000,
  },
  {
    id: 'holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    year: 1892,
    gutenberg: 1661,
    startPattern: /^I\. A SCANDAL IN BOHEMIA\s*$/m,
    startOccurrence: 1,
    // Story titles ("II. THE RED-HEADED LEAGUE") and section numerals ("II.")
    headingPattern: /^(?:[IVXLC]+\.(?:\s+[A-Z’' -]+)?)\s*$/,
    storyPattern: /^[IVXLC]+\.\s+[A-Z’' -]{4,}\s*$/,
    headingHasTitleLine: false,
    unit: 'story',
    targetWords: 62000,
  },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchBook(book) {
  const cached = join(cacheDir, `pg${book.gutenberg}.txt`);
  if (await exists(cached)) return readFile(cached, 'utf8');
  const url = `https://www.gutenberg.org/cache/epub/${book.gutenberg}/pg${book.gutenberg}.txt`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed for ${url}: ${res.status}`);
  const text = await res.text();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, text);
  return text;
}

function stripGutenberg(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  const start = text.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK');
  const end = text.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK');
  if (start < 0 || end < 0) throw new Error('Gutenberg markers not found');
  return text.slice(text.indexOf('\n', start) + 1, end);
}

function nthMatchIndex(text, pattern, n) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m;
  let count = 0;
  while ((m = re.exec(text))) {
    count += 1;
    if (count === n) return m.index;
  }
  throw new Error(`Start pattern ${pattern} occurrence ${n} not found`);
}

/** Remove "[Illustration ...]" notes, which can span several lines. */
function removeIllustrations(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf('[Illustration', i);
    if (j < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, j);
    // find the matching close bracket, allowing one level of nesting
    let depth = 0;
    let k = j;
    for (; k < text.length; k += 1) {
      if (text[k] === '[') depth += 1;
      else if (text[k] === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = k + 1;
  }
  return out;
}

const countWords = (s) => (s.match(/[A-Za-z’']+/g) || []).length;

function cleanBook(book, raw) {
  let body = stripGutenberg(raw);
  body = body.slice(nthMatchIndex(body, book.startPattern, book.startOccurrence));
  body = removeIllustrations(body);

  // Split into units (chapters or stories) at headings, dropping heading lines.
  const lines = body.split('\n');
  const units = [];
  let current = [];
  let skipNextNonEmpty = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^THE END\.?$/i.test(trimmed)) break;
    const isStory = book.storyPattern ? book.storyPattern.test(trimmed) : false;
    const isHeading = book.headingPattern.test(line) || isStory;
    const startsUnit = book.unit === 'story' ? isStory : isHeading;
    if (isHeading) {
      if (startsUnit && current.join('').trim()) {
        units.push(current.join('\n'));
        current = [];
      }
      skipNextNonEmpty = book.headingHasTitleLine;
      continue;
    }
    if (skipNextNonEmpty && trimmed) {
      skipNextNonEmpty = false;
      continue; // the chapter title line under "CHAPTER II."
    }
    current.push(line);
  }
  if (current.join('').trim()) units.push(current.join('\n'));

  // Keep whole units until the word target is reached.
  const kept = [];
  let words = 0;
  for (const unit of units) {
    const w = countWords(unit);
    if (kept.length > 0 && words + w > book.targetWords) break;
    kept.push(unit);
    words += w;
  }

  let text = kept.join('\n\n');
  text = text
    .replace(/_/g, '') // italics markers
    .replace(/--/g, '—')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+/gm, '')
    .trim();

  return { text, unitsKept: kept.length, unitsTotal: units.length, words: countWords(text) };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const manifest = { generated: new Date().toISOString().slice(0, 10), source: 'Project Gutenberg (public domain in the USA)', books: [] };
  for (const book of BOOKS) {
    const raw = await fetchBook(book);
    const { text, unitsKept, unitsTotal, words } = cleanBook(book, raw);
    await writeFile(join(outDir, `${book.id}.txt`), text + '\n');
    manifest.books.push({
      id: book.id,
      title: book.title,
      author: book.author,
      year: book.year,
      gutenbergId: book.gutenberg,
      url: `https://www.gutenberg.org/ebooks/${book.gutenberg}`,
      unit: book.unit,
      unitsKept,
      unitsTotal,
      words,
      bytes: Buffer.byteLength(text, 'utf8'),
    });
    console.log(`${book.id.padEnd(7)} ${unitsKept}/${unitsTotal} ${book.unit === 'story' ? 'stories' : 'chapters'}, ${words.toLocaleString()} words, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
  }
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
