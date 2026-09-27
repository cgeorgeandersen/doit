/**
 * Turns raw text into the word-level tokens the n-gram model counts.
 *
 * Real language models split text into sub-word pieces ("tokens"); this model
 * uses whole words and a few punctuation marks, which is easier to read and
 * enough to show the idea. Everything is lower-cased for counting, and a
 * separate table remembers how each word is usually written ("Alice", "I").
 */

export const SENTENCE_END = new Set(['.', '!', '?']);
export const PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', '—']);

// Abbreviations keep their period, so "Mr. Darcy" is not read as a sentence end.
const ABBREVIATIONS = new Set(['mr', 'mrs', 'dr', 'st', 'messrs', 'mme', 'esq']);

// Words, allowing inner apostrophes and hyphens (don't, o'clock, daisy-chain),
// or one of the punctuation marks the model keeps.
const TOKEN_RE = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[.,!?;:—]/g;

/** Straighten curly quotes and unify dashes before tokenizing. */
export function normalize(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*(?:—|–|--)\s*/g, ' — ');
}

export interface ScannedToken {
  /** lower-cased form used for counting */
  token: string;
  /** the word as it appeared in the text */
  surface: string;
  /** true when the token starts a sentence (so its capital letter is not informative) */
  sentenceInitial: boolean;
}

/** Walk through text, reporting every token with its original spelling. */
export function scan(text: string, onToken: (t: ScannedToken) => void): number {
  const norm = normalize(text);
  TOKEN_RE.lastIndex = 0;
  let sentenceInitial = true;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(norm))) {
    let surface = m[0];
    let token = surface.toLowerCase();
    if (ABBREVIATIONS.has(token) && norm[TOKEN_RE.lastIndex] === '.' && /[A-Z]/.test(surface[0] ?? '')) {
      surface += '.';
      token += '.';
      TOKEN_RE.lastIndex += 1;
    }
    onToken({ token, surface, sentenceInitial });
    count += 1;
    sentenceInitial = SENTENCE_END.has(token);
  }
  return count;
}

/** Tokenize text into lower-cased tokens. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  scan(text, (t) => out.push(t.token));
  return out;
}

/**
 * Join tokens back into readable text: no space before punctuation, a capital
 * letter after a sentence ends, and each word in its usual spelling.
 */
export function detokenize(tokens: string[], display?: (token: string) => string, startOfSentence = true): string {
  let out = '';
  let capitalize = startOfSentence;
  for (const token of tokens) {
    let word = display ? display(token) : token;
    if (capitalize && /^[a-z]/.test(word)) word = word[0]!.toUpperCase() + word.slice(1);
    if (token === '—') out += ' —';
    else if (PUNCTUATION.has(token)) out += word;
    else out += (out.length ? ' ' : '') + word;
    if (token !== '—' && !PUNCTUATION.has(token)) capitalize = false;
    if (SENTENCE_END.has(token)) capitalize = true;
  }
  return out;
}

/** Spacing rule used when rendering tokens one span at a time. */
export function needsSpaceBefore(token: string, isFirst: boolean): boolean {
  if (isFirst) return false;
  if (token === '—') return true;
  return !PUNCTUATION.has(token);
}
