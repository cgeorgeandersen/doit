import { describe, expect, it } from 'vitest';
import { NgramModel, trainModel } from '../src/engine/ngram';
import { detokenize, tokenize } from '../src/engine/tokenizer';
import { applyTemperature, entropyBits } from '../src/engine/sampling';
import { mulberry32 } from '../src/engine/rng';
import { libraryModel, sum } from './helpers';

const CONTEXTS: string[][] = [
  ['said', 'the'], // a well-worn trigram
  ['i', 'am'],
  ['mr.', 'darcy'],
  ['the', 'machine'], // rare: mostly backs off to shorter contexts
  ['xyzzy', 'plugh'], // words the model has never seen
  [], // no context at all
];

describe('n-gram model: next-word probabilities', () => {
  const model = libraryModel();

  it('sum to 1 over the whole vocabulary, for seen, rare, unseen and empty contexts', () => {
    for (const ctx of CONTEXTS) {
      const dist = model.distribution(ctx);
      expect(dist.length).toBe(model.vocabularySize);
      expect(sum(dist)).toBeCloseTo(1, 10);
      for (const p of dist) expect(p).toBeGreaterThan(0); // smoothing leaves no word impossible
    }
  });

  it('still sum to 1 after any temperature is applied', () => {
    for (const ctx of CONTEXTS) {
      for (const t of [0, 0.1, 0.5, 1, 1.7, 3]) {
        expect(sum(applyTemperature(model.distribution(ctx), t))).toBeCloseTo(1, 10);
      }
    }
  });

  it('agree with hand-computed Witten–Bell probabilities on a tiny corpus', () => {
    // Tokens: a b a c a b .   (7 tokens: a×3, b×2, c×1, .×1)
    const tiny = trainModel(['a b a c a b.']);
    const id = (t: string) => tiny.idOf(t);
    // Unigram: P(b) = 2/7
    const uni = tiny.distribution([]);
    expect(uni[id('b')]).toBeCloseTo(2 / 7, 12);
    // Bigram context "a" was followed by b, c, b: count 3, distinct 2 → λ = 3/5
    // P(b | a) = 3/5 · 2/3 + 2/5 · 2/7
    const afterA = tiny.distribution(['a']);
    expect(afterA[id('b')]).toBeCloseTo((3 / 5) * (2 / 3) + (2 / 5) * (2 / 7), 12);
    expect(sum(afterA)).toBeCloseTo(1, 12);
  });

  it('learns the obvious patterns of its library', () => {
    const top = model.topNext(['said', 'the'], 5).map((w) => w.token);
    expect(top).toContain('king'); // Alice's Adventures in Wonderland, again and again
    expect(model.display('alice')).toBe('Alice');
    expect(model.display('i')).toBe('I');
  });
});

describe('temperature', () => {
  const model = libraryModel();

  it('higher temperature increases entropy', () => {
    const temps = [0.25, 0.5, 1, 1.5, 2, 3];
    for (const ctx of CONTEXTS) {
      const base = model.distribution(ctx);
      const h = temps.map((t) => entropyBits(applyTemperature(base, t)));
      for (let i = 1; i < h.length; i += 1) expect(h[i]!).toBeGreaterThan(h[i - 1]!);
    }
  });

  it('near zero, always picks the single most likely word', () => {
    const dist = applyTemperature(model.distribution(['i', 'am']), 0);
    expect(Math.max(...dist)).toBe(1);
    expect(model.topNext(['i', 'am'], 1, 0)[0]!.token).toBe(model.topNext(['i', 'am'], 1, 1)[0]!.token);
  });
});

describe('generator', () => {
  const model = libraryModel();
  const prompt = tokenize('The Queen');

  it('is deterministic under a fixed seed', () => {
    for (const temperature of [0.3, 1, 2]) {
      const a = model.generate(prompt, { rng: mulberry32(42), temperature });
      const b = model.generate(prompt, { rng: mulberry32(42), temperature });
      expect(a).toEqual(b);
    }
  });

  it('is deterministic with nucleus sampling too', () => {
    const a = model.generate(prompt, { rng: mulberry32(3), temperature: 1, topP: 0.9 });
    const b = model.generate(prompt, { rng: mulberry32(3), temperature: 1, topP: 0.9 });
    expect(a).toEqual(b);
  });

  it('gives different continuations for different seeds', () => {
    const outputs = new Set(
      [1, 2, 3, 4, 5].map((seed) => model.generate(prompt, { rng: mulberry32(seed), temperature: 1 }).tokens.join(' ')),
    );
    expect(outputs.size).toBeGreaterThan(3);
  });

  it('reports the probability of every word it chose', () => {
    const g = model.generate(prompt, { rng: mulberry32(7), temperature: 1, maxTokens: 15 });
    expect(g.probs.length).toBe(g.tokens.length);
    for (const p of g.probs) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('refuses to predict before training is finished', () => {
    const m = new NgramModel();
    m.addText('Some words.');
    expect(() => m.distribution(['some'])).toThrow();
  });
});

describe('tokenizer', () => {
  it('keeps contractions, hyphens and abbreviations intact', () => {
    expect(tokenize("“I don’t know,” said Mr. Darcy—a daisy-chain.")).toEqual([
      'i', "don't", 'know', ',', 'said', 'mr.', 'darcy', '—', 'a', 'daisy-chain', '.',
    ]);
  });

  it('turns tokens back into readable text', () => {
    expect(detokenize(['the', 'queen', 'said', ',', 'i', 'am', 'sure', '.', 'and'], (t) => (t === 'i' ? 'I' : t))).toBe(
      'The queen said, I am sure. And',
    );
  });
});
