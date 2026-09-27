/**
 * A word-level trigram language model, trained by counting.
 *
 * "Training" is nothing more than tallying, for every pair of words in the
 * books, which word came next. To predict, the model looks up the last two
 * words you typed and turns those tallies into probabilities.
 *
 * Unseen combinations are the hard part: most three-word sequences never
 * appear in a small library. Witten–Bell smoothing blends three estimates:
 *
 *   P(w | u v) = λ₃ · count(u v w)/count(u v)  +  (1 − λ₃) · P(w | v)
 *   P(w | v)   = λ₂ · count(v w)/count(v)      +  (1 − λ₂) · P(w)
 *   P(w)       = count(w) / N
 *
 * where λ = count(context) / (count(context) + distinct words seen after it).
 * A context followed by many different words trusts itself less and leans on
 * the shorter context more. Each line mixes two distributions that sum to 1,
 * so the result always sums to 1 over the whole vocabulary.
 */
import { scan, SENTENCE_END } from './tokenizer';
import { applyTemperature, nucleus, sampleIndex, topK } from './sampling';
import type { Rng } from './rng';

/** Contexts are packed into one number: u * KEY_BASE + v. Vocabulary must stay below this. */
const KEY_BASE = 1 << 20;

interface Followers {
  ids: Int32Array; // next-word ids, most frequent first
  counts: Int32Array; // how often each followed the context
  total: number; // count(context)
}

export interface NextWord {
  token: string;
  display: string;
  p: number;
  /** times this word followed the last two words / the last word in the books */
  trigramCount: number;
  bigramCount: number;
}

export interface Generated {
  tokens: string[];
  /** probability (after temperature) of each token at the moment it was chosen */
  probs: number[];
}

export interface GenerateOptions {
  rng: Rng;
  temperature?: number;
  maxTokens?: number;
  /** stop at the first sentence end after this many tokens */
  minTokens?: number;
  /** nucleus sampling: ignore the long tail beyond this cumulative probability (1 = off) */
  topP?: number;
}

export class NgramModel {
  readonly vocab: string[] = [];
  readonly index = new Map<string, number>();
  private counts: number[] = [];
  private surfaces: Array<Map<string, number>> = [];
  private bigramBuild = new Map<number, Map<number, number>>();
  private trigramBuild = new Map<number, Map<number, number>>();
  private bigram = new Map<number, Followers>();
  private trigram = new Map<number, Followers>();
  private displayForms: string[] = [];
  private prev1 = -1;
  private prev2 = -1;
  private finalized = false;
  unigram = new Float64Array(0);
  totalTokens = 0;

  /** Count every token in a document. Context never spans two documents. */
  addText(text: string): number {
    if (this.finalized) throw new Error('Model is finalized; create a new one to add text.');
    this.prev1 = -1;
    this.prev2 = -1;
    return scan(text, ({ token, surface, sentenceInitial }) => {
      const id = this.intern(token);
      this.counts[id] = this.counts[id]! + 1;
      this.totalTokens += 1;
      if (!sentenceInitial) {
        const forms = this.surfaces[id]!;
        forms.set(surface, (forms.get(surface) ?? 0) + 1);
      }
      if (this.prev1 >= 0) bump(this.bigramBuild, this.prev1, id);
      if (this.prev2 >= 0 && this.prev1 >= 0) bump(this.trigramBuild, this.prev2 * KEY_BASE + this.prev1, id);
      this.prev2 = this.prev1;
      this.prev1 = id;
    });
  }

  /** Freeze the counts into compact, sorted arrays and compute word probabilities. */
  finalize(): this {
    if (this.finalized) return this;
    this.bigram = compact(this.bigramBuild);
    this.trigram = compact(this.trigramBuild);
    this.bigramBuild.clear();
    this.trigramBuild.clear();
    const n = this.vocab.length;
    this.unigram = new Float64Array(n);
    for (let i = 0; i < n; i += 1) this.unigram[i] = this.counts[i]! / this.totalTokens;
    this.displayForms = this.vocab.map((token, i) => chooseDisplay(token, this.surfaces[i]!));
    this.surfaces = [];
    this.finalized = true;
    return this;
  }

  get vocabularySize(): number {
    return this.vocab.length;
  }

  /** Distinct (context → next word) pairs the model has tallied. */
  get patternCount(): number {
    let total = 0;
    for (const f of this.bigram.values()) total += f.ids.length;
    for (const f of this.trigram.values()) total += f.ids.length;
    return total;
  }

  idOf(token: string): number {
    return this.index.get(token) ?? -1;
  }

  /** How a token is usually written in the books ("alice" → "Alice", "i" → "I"). */
  display(token: string): string {
    const id = this.idOf(token);
    return id >= 0 ? this.displayForms[id]! : token;
  }

  countOf(token: string): number {
    const id = this.idOf(token);
    return id >= 0 ? this.counts[id]! : 0;
  }

  /** Which contexts the model can actually use for these words. */
  contextInfo(context: string[]): { u: number; v: number; usesTrigram: boolean; usesBigram: boolean } {
    const [u, v] = lastTwoIds(this, context);
    const usesBigram = v >= 0 && this.bigram.has(v);
    const usesTrigram = u >= 0 && v >= 0 && this.trigram.has(u * KEY_BASE + v);
    return { u, v, usesTrigram, usesBigram };
  }

  /** Raw tallies behind a context, for explaining the smoothing weights. */
  contextStats(context: string[]): { trigramTotal: number; trigramDistinct: number; bigramTotal: number; bigramDistinct: number } {
    const { u, v } = this.contextInfo(context);
    const tri = u >= 0 && v >= 0 ? this.trigram.get(u * KEY_BASE + v) : undefined;
    const bi = v >= 0 ? this.bigram.get(v) : undefined;
    return {
      trigramTotal: tri?.total ?? 0,
      trigramDistinct: tri?.ids.length ?? 0,
      bigramTotal: bi?.total ?? 0,
      bigramDistinct: bi?.ids.length ?? 0,
    };
  }

  /** P(next word | the last two words of the context) for every word in the vocabulary. */
  distribution(context: string[]): Float64Array {
    this.assertFinal();
    const dist = Float64Array.from(this.unigram);
    const { u, v } = this.contextInfo(context);
    if (v >= 0) {
      const f = this.bigram.get(v);
      if (f) mix(dist, f);
    }
    if (u >= 0 && v >= 0) {
      const f = this.trigram.get(u * KEY_BASE + v);
      if (f) mix(dist, f);
    }
    return dist;
  }

  /** The k most likely next words, with the tallies behind them. */
  topNext(context: string[], k = 10, temperature = 1): NextWord[] {
    const dist = applyTemperature(this.distribution(context), temperature);
    const { u, v } = this.contextInfo(context);
    const tri = u >= 0 && v >= 0 ? this.trigram.get(u * KEY_BASE + v) : undefined;
    const bi = v >= 0 ? this.bigram.get(v) : undefined;
    return topK(dist, k).map(({ index, p }) => ({
      token: this.vocab[index]!,
      display: this.displayForms[index]!,
      p,
      trigramCount: tri ? countIn(tri, index) : 0,
      bigramCount: bi ? countIn(bi, index) : 0,
    }));
  }

  /** Continue a prompt one sampled word at a time. */
  generate(prompt: string[], options: GenerateOptions): Generated {
    const { rng, temperature = 1, maxTokens = 24, minTokens = 10, topP = 1 } = options;
    // An empty prompt is treated as the start of a sentence.
    const context = prompt.length ? [...prompt] : ['.'];
    const tokens: string[] = [];
    const probs: number[] = [];
    for (let step = 0; step < maxTokens; step += 1) {
      const dist = applyTemperature(this.distribution(context), temperature);
      const id = sampleIndex(topP < 1 ? nucleus(dist, topP) : dist, rng);
      const token = this.vocab[id]!;
      tokens.push(token);
      probs.push(dist[id]!); // the model's own odds for the word, before the tail was cut
      context.push(token);
      if (tokens.length >= minTokens && SENTENCE_END.has(token)) break;
    }
    return { tokens, probs };
  }

  private intern(token: string): number {
    let id = this.index.get(token);
    if (id === undefined) {
      id = this.vocab.length;
      if (id >= KEY_BASE) throw new Error('Vocabulary too large for context packing.');
      this.vocab.push(token);
      this.index.set(token, id);
      this.counts.push(0);
      this.surfaces.push(new Map());
    }
    return id;
  }

  private assertFinal(): void {
    if (!this.finalized) throw new Error('Call finalize() before predicting.');
  }
}

/** Train on several documents at once (used by tests and the build-free path). */
export function trainModel(texts: string[]): NgramModel {
  const model = new NgramModel();
  for (const t of texts) model.addText(t);
  return model.finalize();
}

function lastTwoIds(model: NgramModel, context: string[]): [number, number] {
  const n = context.length;
  const v = n >= 1 ? model.idOf(context[n - 1]!) : -1;
  const u = n >= 2 ? model.idOf(context[n - 2]!) : -1;
  return [u, v];
}

function bump(table: Map<number, Map<number, number>>, key: number, next: number): void {
  let row = table.get(key);
  if (!row) {
    row = new Map();
    table.set(key, row);
  }
  row.set(next, (row.get(next) ?? 0) + 1);
}

function compact(table: Map<number, Map<number, number>>): Map<number, Followers> {
  const out = new Map<number, Followers>();
  for (const [key, row] of table) {
    const entries = [...row.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const ids = new Int32Array(entries.length);
    const counts = new Int32Array(entries.length);
    let total = 0;
    entries.forEach(([id, c], i) => {
      ids[i] = id;
      counts[i] = c;
      total += c;
    });
    out.set(key, { ids, counts, total });
  }
  return out;
}

/** Witten–Bell step: dist ← λ · (tallies after this context) + (1 − λ) · dist. */
function mix(dist: Float64Array, f: Followers): void {
  const distinct = f.ids.length;
  const lambda = f.total / (f.total + distinct);
  const keep = 1 - lambda;
  for (let i = 0; i < dist.length; i += 1) dist[i] = dist[i]! * keep;
  for (let k = 0; k < distinct; k += 1) dist[f.ids[k]!] = dist[f.ids[k]!]! + (lambda * f.counts[k]!) / f.total;
}

function countIn(f: Followers, id: number): number {
  for (let k = 0; k < f.ids.length; k += 1) if (f.ids[k] === id) return f.counts[k]!;
  return 0;
}

function chooseDisplay(token: string, forms: Map<string, number>): string {
  if (token === 'i') return 'I';
  let best = token;
  let bestCount = 0;
  for (const [form, c] of forms) {
    if (c > bestCount) {
      best = form;
      bestCount = c;
    }
  }
  return best;
}
