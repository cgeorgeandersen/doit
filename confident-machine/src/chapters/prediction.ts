/**
 * Chapter 1: a word-level n-gram model trained live in the browser on three
 * Gutenberg books. Five steps: read, guess, explore, temperature, generate.
 */
import { h, qs, nextFrame } from '../lib/dom';
import { createScrolly } from '../lib/scrolly';
import { NgramModel, type NextWord } from '../engine/ngram';
import { tokenize, detokenize, PUNCTUATION } from '../engine/tokenizer';
import { applyTemperature, effectiveChoices } from '../engine/sampling';
import { mulberry32, seedFromString } from '../engine/rng';
import { machineText } from '../components/shimmer';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { pct } from '../lib/format';
import { reducedMotion } from '../lib/motion';
import manifest from '../corpus/manifest.json';

const GUESS_CONTEXT = ['i', 'am'];
const GUESS_OPTIONS = ['afraid', 'sure', 'sorry', 'not'];
const DEFAULT_START = 'said the';
/** Like many real systems, sampling ignores the least likely 10% of probability. */
const TOP_P = 0.9;
const PUNCT_NAMES: Record<string, string> = {
  ',': 'comma',
  '.': 'full stop',
  '!': 'exclamation mark',
  '?': 'question mark',
  ';': 'semicolon',
  ':': 'colon',
  '—': 'dash',
};
const BOOK_LABELS: Record<string, string> = {
  alice: 'Alice’s Adventures in Wonderland',
  pride: 'Pride and Prejudice, ch. 1–34',
  holmes: 'Sherlock Holmes, 7 stories',
};

interface Picked {
  token: string;
  p: number;
}

export function mountPrediction(section: HTMLElement): void {
  const stage = qs('#ngram-stage', section);
  const scrollyRoot = qs('#ngram-scrolly', section);
  let model: NgramModel | null = null;

  // ---------- Panel 1: training ----------
  const bookRows = manifest.books.map((book) => {
    const fill = h('span', { class: 'train-fill' });
    const count = h('span', { class: 'train-count mono' }, `${book.words.toLocaleString('en-US')} words`);
    const row = h(
      'li',
      { class: 'train-row' },
      h('span', { class: 'train-title' }, BOOK_LABELS[book.id] ?? book.title),
      h('span', { class: 'train-track', 'aria-hidden': 'true' }, fill),
      count,
    );
    return { row, fill };
  });
  const trainStats = h('p', { class: 'train-stats mono', role: 'status' }, 'Waiting to start…');
  const tallyPeek = h('div', { class: 'tally-peek', hidden: true });
  const trainPanel = h(
    'div',
    { class: 'panel panel-train' },
    h('p', { class: 'panel-title' }, 'Reading the library'),
    h('ol', { class: 'train-list' }, ...bookRows.map((b) => b.row)),
    trainStats,
    tallyPeek,
  );

  // ---------- Panel 2: guess ----------
  const guessButtons = GUESS_OPTIONS.map((word) =>
    h(
      'button',
      { type: 'button', class: 'choice guess-choice', 'aria-pressed': 'false', 'data-word': word },
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'mono' }, word),
    ),
  );
  const guessResult = h('div', { class: 'guess-result' });
  const guessPanel = h(
    'div',
    { class: 'panel panel-guess' },
    h('p', { class: 'panel-title' }, 'In these books, which word most often follows “I am”?'),
    h('div', { class: 'guess-grid', role: 'group', 'aria-label': 'Your guess' }, ...guessButtons),
    guessResult,
  );

  // ---------- Panel 3–5: explore, temperature, generate ----------
  const input = h('input', {
    id: 'ngram-input',
    type: 'text',
    value: DEFAULT_START,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-describedby': 'ngram-input-hint',
  });
  const sentence = h('p', { class: 'sentence', 'aria-live': 'polite' });
  const undoBtn = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Undo');
  const clearBtn = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Start over');
  const barsTitle = h('p', { class: 'bars-title' });
  const bars = h('ol', { class: 'bars', 'aria-label': 'Most likely next words' });
  const barsDesc = h('p', { class: 'chart-description', 'aria-live': 'polite' });
  const temp = h('input', {
    id: 'ngram-temp',
    type: 'range',
    min: '0.1',
    max: '2.5',
    step: '0.05',
    value: '1',
    'aria-describedby': 'ngram-temp-readout',
  });
  const tempReadout = h('p', { class: 'temp-readout mono', id: 'ngram-temp-readout' });
  const genBtn = h('button', { type: 'button', class: 'btn btn--primary' }, 'Continue five times');
  const genList = h('ol', { class: 'gen-list', 'aria-live': 'polite' });

  const explorePanel = h(
    'div',
    { class: 'panel panel-explore' },
    h(
      'div',
      { class: 'explore-input' },
      h('label', { class: 'field-label', for: 'ngram-input' }, 'Start a sentence'),
      input,
      h('p', { id: 'ngram-input-hint', class: 'visually-hidden' }, 'The chart below updates as you type.'),
    ),
    h(
      'div',
      { class: 'explore-sentence' },
      sentence,
      h('div', { class: 'sentence-actions' }, undoBtn, clearBtn),
    ),
    h('div', { class: 'explore-bars' }, barsTitle, bars, barsDesc),
    h(
      'div',
      { class: 'explore-temp' },
      h('label', { class: 'field-label', for: 'ngram-temp' }, 'Temperature'),
      temp,
      h(
        'div',
        { class: 'temp-ticks', 'aria-hidden': 'true' },
        h('span', { style: 'left:0%' }, 'Repetitive'),
        h('span', { style: 'left:37.5%' }, 'As trained'),
        h('span', { style: 'left:62.5%' }, 'Creative'),
        h('span', { style: 'left:100%' }, 'Nonsense'),
      ),
      tempReadout,
    ),
    h('div', { class: 'explore-gen' }, genBtn, genList),
  );

  stage.replaceChildren(trainPanel, guessPanel, explorePanel);

  // ---------- State ----------
  let typed = DEFAULT_START;
  let picked: Picked[] = [];
  let temperature = 1;
  let genRound = 0;

  const context = (): string[] => [...tokenize(typed), ...picked.map((p) => p.token)];
  const display = (t: string) => (model ? model.display(t) : t);
  /** A readable name for bars and descriptions: "," becomes ", (comma)". */
  const label = (t: string) => (PUNCT_NAMES[t] ? `${t} (${PUNCT_NAMES[t]})` : display(t));
  const spoken = (t: string) => PUNCT_NAMES[t] ?? display(t);

  function renderSentence(): void {
    const typedEl = h('span', { class: 'sentence-typed' }, typed.trim() || '…');
    const parts: Array<Node | string> = [typedEl];
    if (picked.length) {
      const first = picked[0]!.token;
      if (!PUNCTUATION.has(first) || first === '—') parts.push(' ');
      parts.push(machineText(picked.map((p) => ({ text: display(p.token), token: p.token, p: p.p })), { showProbabilities: true }));
    } else {
      parts.push(h('span', { class: 'sentence-hint' }, '  ← choose a bar to add a word'));
    }
    sentence.replaceChildren(...parts);
    undoBtn.disabled = picked.length === 0;
    clearBtn.disabled = picked.length === 0;
  }

  function renderBarList(target: HTMLElement, words: NextWord[], opts: { clickable: boolean; guess?: string; ctx: string[] }): void {
    const max = Math.max(0.05, ...words.map((w) => w.p));
    const lastTwo = opts.ctx.slice(-2).map(display).join(' ');
    target.replaceChildren(
      ...words.map((w, i) => {
        const width = (w.p / max) * 100;
        const tally = w.trigramCount
          ? `seen ${w.trigramCount}× after “${lastTwo}”`
          : w.bigramCount
            ? `seen ${w.bigramCount}× after “${display(opts.ctx[opts.ctx.length - 1] ?? '')}”`
            : 'from overall word frequency';
        const tags: HTMLElement[] = [];
        if (opts.guess && w.token === opts.guess) tags.push(h('span', { class: 'bar-tag bar-tag--you' }, 'your guess'));
        if (opts.guess && i === 0) tags.push(h('span', { class: 'bar-tag' }, 'most likely'));
        const inner = [
          h('span', { class: 'bar-word mono' }, label(w.token), ...tags),
          h(
            'span',
            { class: 'bar-track' },
            h('span', { class: 'bar-fill', style: `width:${width.toFixed(1)}%` }),
            h('span', { class: 'bar-value mono', style: `left:${width.toFixed(1)}%` }, pct(w.p)),
          ),
          h('span', { class: 'bar-tally' }, tally),
        ];
        const cls = `bar-row ${opts.guess && w.token === opts.guess ? 'is-guess' : ''}`;
        if (!opts.clickable) return h('li', { class: cls }, ...inner);
        const btn = h(
          'button',
          {
            type: 'button',
            class: cls,
            'aria-label': `${spoken(w.token)}, ${pct(w.p)}, ${tally}. Add to the sentence.`,
          },
          ...inner,
        );
        btn.addEventListener('click', () => {
          picked.push({ token: w.token, p: w.p });
          refresh();
          caseFile.update((f) => {
            f.sentence = sentenceText();
          });
          announce(`Added “${spoken(w.token)}”.`);
        });
        return h('li', {}, btn);
      }),
    );
  }

  function sentenceText(): string {
    return detokenize(context(), display, true);
  }

  function refreshBars(): void {
    if (!model) return;
    const ctx = context();
    const words = model.topNext(ctx, 10, temperature);
    const info = model.contextInfo(ctx);
    const lastTwo = ctx.slice(-2).map(display).join(' ');
    barsTitle.replaceChildren(
      'Most likely next words after ',
      h('span', { class: 'mono' }, `“${lastTwo || '(nothing)'}”`),
      temperature !== 1 ? h('span', { class: 'bars-temp' }, ` at temperature ${temperature.toFixed(2)}`) : '',
    );
    renderBarList(bars, words, { clickable: true, ctx });
    let note = '';
    if (!info.usesBigram) note = ' The books never use that word, so the model falls back on how common each word is overall.';
    else if (!info.usesTrigram) note = ' The books never use those two words together, so the model leans on the last word alone.';
    barsDesc.textContent =
      `After “${lastTwo}”, the most likely next words are ` +
      words
        .slice(0, 3)
        .map((w) => `${spoken(w.token)} (${pct(w.p, 0)})`)
        .join(', ') +
      '.' +
      note;
  }

  function refreshTemperature(): void {
    if (!model) return;
    const dist = applyTemperature(model.distribution(context()), temperature);
    const zone = temperature < 0.5 ? 'repetitive' : temperature <= 1.15 ? 'as trained' : temperature <= 1.8 ? 'creative' : 'nonsense';
    tempReadout.textContent = `T = ${temperature.toFixed(2)} · ${zone} · like choosing among ${Math.round(effectiveChoices(dist)).toLocaleString('en-US')} equally likely words`;
  }

  function refreshDeeper(): void {
    const target = section.querySelector<HTMLElement>('[data-ngram-live-example]');
    if (!target || !model) return;
    const ctx = tokenize(DEFAULT_START);
    const stats = model.contextStats(ctx);
    if (!stats.trigramTotal) return;
    const lambda = stats.trigramTotal / (stats.trigramTotal + stats.trigramDistinct);
    const top = model.topNext(ctx, 1)[0]!;
    target.textContent = `A live example from this model: “said the” appears ${stats.trigramTotal} times in the books, followed by ${stats.trigramDistinct} different words, so λ = ${stats.trigramTotal}/(${stats.trigramTotal}+${stats.trigramDistinct}) ≈ ${lambda.toFixed(2)}. Its favourite continuation, “${top.display}”, followed it ${top.trigramCount} times.`;
  }

  function refresh(): void {
    renderSentence();
    refreshBars();
    refreshTemperature();
  }

  function generate(): void {
    if (!model) return;
    genRound += 1;
    const ctx = context();
    const start = ctx.length ? ctx : ['the', 'queen'];
    const base = seedFromString(start.join(' ')) + genRound * 7919;
    const promptText = detokenize(start, display, true);
    genList.replaceChildren(
      ...[0, 1, 2, 3, 4].map((i) => {
        const g = model!.generate(start, { rng: mulberry32(base + i), temperature, maxTokens: 22, minTokens: 9, topP: TOP_P });
        const tokens = g.tokens.map((t, j) => ({ text: display(t), token: t, p: g.probs[j] }));
        return h(
          'li',
          {},
          h('span', { class: 'gen-prompt' }, promptText),
          ' ',
          machineText(tokens, { showProbabilities: true }),
        );
      }),
    );
    announce(`Five continuations generated at temperature ${temperature.toFixed(2)}.`);
  }

  // ---------- Events ----------
  let typingTimer = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => {
      typed = input.value;
      picked = [];
      refresh();
    }, 110);
  });
  undoBtn.addEventListener('click', () => {
    picked.pop();
    refresh();
  });
  clearBtn.addEventListener('click', () => {
    picked = [];
    refresh();
  });
  temp.addEventListener('input', () => {
    temperature = Number(temp.value);
    refreshBars();
    refreshTemperature();
  });
  genBtn.addEventListener('click', generate);

  function revealGuess(guess: string, fromUser: boolean): void {
    guessButtons.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.word === guess));
      b.disabled = true;
    });
    if (!model) {
      guessResult.replaceChildren(h('p', { class: 'small muted' }, 'Got it. The machine is still reading…'));
      return;
    }
    const words = model.topNext(GUESS_CONTEXT, 10);
    const top = words[0]!;
    const list = h('ol', { class: 'bars bars--static', 'aria-label': 'Most likely words after “I am”' });
    renderBarList(list, words, { clickable: false, guess, ctx: GUESS_CONTEXT });
    const correct = guess === top.token;
    guessResult.replaceChildren(
      h(
        'p',
        { class: 'guess-verdict' },
        correct
          ? `Yes. “${top.display}” is the machine’s favourite, at ${pct(top.p)}.`
          : `The machine’s favourite is “${top.display}”, at ${pct(top.p)}. You picked “${guess}”.`,
        ' In books full of confident narrators, “I am sure” is the most common way to go on.',
      ),
      list,
    );
    if (fromUser) {
      caseFile.update((f) => {
        f.prediction = { guess, correct };
      });
      announce(correct ? `Correct: “${top.display}”, ${pct(top.p)}.` : `The most likely word is “${top.display}”, ${pct(top.p)}.`);
    }
  }

  guessButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const word = b.dataset.word!;
      if (!model) {
        caseFile.update((f) => {
          f.prediction = { guess: word, correct: word === 'sure' };
        });
      }
      revealGuess(word, true);
    }),
  );

  // ---------- Scrolly ----------
  createScrolly(scrollyRoot, (i) => {
    stage.dataset.step = String(i);
    if (i === 4 && model && !genList.childElementCount) generate();
  });

  // ---------- Training ----------
  async function train(): Promise<void> {
    trainStats.textContent = 'Loading the books…';
    const texts = await Promise.all([
      import('../corpus/alice.txt?raw').then((m) => m.default),
      import('../corpus/pride.txt?raw').then((m) => m.default),
      import('../corpus/holmes.txt?raw').then((m) => m.default),
    ]);
    const m = new NgramModel();
    let tokens = 0;
    let elapsed = 0;
    for (let i = 0; i < texts.length; i += 1) {
      bookRows[i]!.row.classList.add('is-reading');
      trainStats.textContent = `Counting words in ${BOOK_LABELS[manifest.books[i]!.id]}…`;
      await nextFrame();
      const t0 = performance.now();
      tokens += m.addText(texts[i]!);
      elapsed += performance.now() - t0;
      bookRows[i]!.row.classList.remove('is-reading');
      bookRows[i]!.row.classList.add('is-done');
      await new Promise((r) => window.setTimeout(r, reducedMotion() ? 0 : 280));
    }
    const t0 = performance.now();
    m.finalize();
    elapsed += performance.now() - t0;
    model = m;
    trainStats.replaceChildren(
      h('strong', {}, tokens.toLocaleString('en-US')),
      ' words and marks read · ',
      h('strong', {}, m.vocabularySize.toLocaleString('en-US')),
      ' different words · ',
      h('strong', {}, m.patternCount.toLocaleString('en-US')),
      ' next-word patterns counted · ',
      h('strong', {}, `${(elapsed / 1000).toFixed(2)} s`),
    );
    stage.classList.add('is-ready');
    const peekCtx = tokenize(DEFAULT_START);
    const peek = m.topNext(peekCtx, 6);
    tallyPeek.replaceChildren(
      h('p', { class: 'tally-title' }, 'A peek at the tallies: what followed “said the” in the books'),
      h(
        'ol',
        { class: 'tally-list' },
        ...peek.map((w) => h('li', {}, h('span', { class: 'mono' }, w.display), h('span', { class: 'tally-n mono' }, `×${w.trigramCount}`))),
      ),
      h('p', { class: 'small muted' }, 'Every prediction on this page comes from counts like these, and nothing else.'),
    );
    tallyPeek.hidden = false;
    refresh();
    refreshDeeper();
    const saved = caseFile.get().prediction;
    if (saved) revealGuess(saved.guess, false);
    if (stage.dataset.step === '4') generate();
  }

  const saved = caseFile.get().prediction;
  if (saved) revealGuess(saved.guess, false);
  renderSentence();
  train().catch((err) => {
    console.error(err);
    trainStats.textContent = 'The library could not be loaded. Try reloading the page.';
  });
}
