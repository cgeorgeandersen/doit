/**
 * Chapter 2: Confidently Wrong.
 *
 *  1. A ten-question quiz. The reader picks an answer, says how sure they are,
 *     and only then sees the truth (predict, then reveal, ten times).
 *  2. Their calibration curve, redrawn after every answer.
 *  3. "Grade the machine": why a test that never charges for wrong answers
 *     turns guessing into the winning strategy.
 */
import { scaleLinear, scaleSqrt } from 'd3-scale';
import { line } from 'd3-shape';
import { h, s, qs } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { cite, renderCitations } from '../lib/citations';
import { pct } from '../lib/format';
import { QUIZ, type QuizQuestion } from '../content/quiz';
import { calibrationCurve, summarize, type Answer, type CalibrationBin, type CalibrationSummary } from '../engine/calibration';
import { dataTable, onWidth, tableToggle, tooltip } from '../components/chart';

interface Saved {
  choice: number;
  /** stated probability of being right, 0.5–1 */
  confidence: number;
  correct: boolean;
}

type Answers = Record<string, Saved>;

export function mountCalibration(section: HTMLElement): void {
  const answers: Answers = { ...(caseFile.get().calibration?.answers ?? {}) };
  const chart = calibrationChart(qs('#calib-chart', section));
  const summaryHost = qs('#calib-summary', section);

  const refresh = () => {
    const list = answerList(answers);
    chart.update(list);
    renderSummary(summaryHost, list);
  };

  createQuiz(qs('#quiz', section), answers, {
    answered(question, saved) {
      answers[question.id] = saved;
      const list = answerList(answers);
      caseFile.update((f) => {
        f.calibration = { answers: { ...answers }, summary: summarize(list) };
      });
      refresh();
      renderCitations(section);
    },
    reset() {
      for (const id of Object.keys(answers)) delete answers[id];
      caseFile.update((f) => {
        delete f.calibration;
      });
      refresh();
    },
    finished() {
      qs('#calib-figure', section).scrollIntoView({ block: 'start' });
      summaryHost.setAttribute('tabindex', '-1');
      summaryHost.focus({ preventScroll: true });
    },
  });

  refresh();
  mountGrading(qs('#grading-body', section));
}

/** Answers in quiz order, as the calibration engine expects them. */
function answerList(answers: Answers): Answer[] {
  return QUIZ.flatMap((q) => {
    const a = answers[q.id];
    return a ? [{ confidence: a.confidence, correct: a.correct }] : [];
  });
}

/* ------------------------------------------------------------------ */
/* The quiz                                                            */
/* ------------------------------------------------------------------ */

interface QuizHandlers {
  answered(question: QuizQuestion, saved: Saved): void;
  reset(): void;
  finished(): void;
}

function confidenceWords(percent: number): string {
  if (percent <= 50) return 'a coin flip';
  if (percent <= 65) return 'leaning one way';
  if (percent <= 80) return 'fairly sure';
  if (percent < 100) return 'very sure';
  return 'certain';
}

function createQuiz(host: HTMLElement, answers: Answers, handlers: QuizHandlers): void {
  const firstOpen = () => QUIZ.findIndex((q) => !answers[q.id]);

  const track = () =>
    h(
      'ol',
      { class: 'quiz-track', 'aria-hidden': 'true' },
      ...QUIZ.map((q, i) =>
        h('li', { class: answers[q.id] ? 'is-done' : i === firstOpen() ? 'is-current' : '' }),
      ),
    );

  function showQuestion(index: number, moveFocus: boolean): void {
    const q = QUIZ[index]!;
    let choice: number | null = null;

    const prompt = h('p', { class: 'quiz-prompt', id: `quiz-q-${q.id}`, tabindex: '-1' }, q.prompt);
    const options = q.options.map((label, k) =>
      h(
        'button',
        { type: 'button', class: 'choice quiz-option', 'aria-pressed': 'false', 'data-k': k },
        h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'quiz-option-label' }, label),
      ),
    );
    const slider = h('input', {
      type: 'range',
      id: 'quiz-confidence',
      min: 50,
      max: 100,
      step: 5,
      value: 75,
    });
    const value = h('span', { class: 'conf-value' });
    const words = h('span', { class: 'conf-words' });
    const lock = h('button', { type: 'button', class: 'btn btn--primary quiz-lock', disabled: true }, 'Lock in');
    const hint = h('p', { class: 'quiz-hint small muted', 'aria-live': 'polite' }, 'Pick an answer first.');
    const result = h('div', { class: 'quiz-result', hidden: true });

    const syncSlider = () => {
      const v = Number(slider.value);
      value.textContent = `${v}%`;
      words.textContent = confidenceWords(v);
      slider.setAttribute('aria-valuetext', `${v}%, ${confidenceWords(v)}`);
    };
    slider.addEventListener('input', syncSlider);
    syncSlider();

    options.forEach((button, k) =>
      button.addEventListener('click', () => {
        choice = k;
        options.forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
        lock.disabled = false;
        hint.textContent = 'Now say how sure you are, then lock it in.';
      }),
    );

    lock.addEventListener('click', () => {
      if (choice === null) return;
      const confidence = Number(slider.value) / 100;
      const correct = choice === q.answer;
      const saved: Saved = { choice, confidence, correct };

      options.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) {
          b.classList.add('is-correct');
          b.append(h('span', { class: 'quiz-tag quiz-tag--right' }, '✓ Right answer'));
        } else if (j === choice) {
          b.classList.add('is-wrong');
          b.append(h('span', { class: 'quiz-tag' }, '✗ Your answer'));
        }
      });
      slider.disabled = true;
      lock.hidden = true;
      hint.hidden = true;

      const last = QUIZ.every((x) => x.id === q.id || answers[x.id]);
      const next = h(
        'button',
        { type: 'button', class: 'btn quiz-next' },
        last ? 'See your calibration' : 'Next question',
        h('span', { 'aria-hidden': 'true' }, '→'),
      );
      const verdict = h(
        'p',
        { class: `quiz-verdict ${correct ? 'is-right' : 'is-wrong'}`, tabindex: '-1' },
        h('span', { class: 'quiz-mark', 'aria-hidden': 'true' }, correct ? '✓' : '✗'),
        h('strong', {}, correct ? 'Right.' : 'Wrong.'),
        ` You were ${Math.round(confidence * 100)}% sure.`,
      );
      result.replaceChildren(verdict, h('p', { class: 'quiz-explain' }, q.explanation, cite(...q.sources)), next);
      result.hidden = false;

      handlers.answered(q, saved);
      host.querySelector('.quiz-track')?.replaceWith(track());
      announce(
        `${correct ? 'Right' : 'Wrong'}. The answer is ${q.options[q.answer]}. You were ${Math.round(confidence * 100)}% sure. ${q.explanation}`,
      );
      verdict.focus({ preventScroll: true });

      next.addEventListener('click', () => {
        const open = firstOpen();
        if (open === -1) {
          showDone();
          handlers.finished();
        } else {
          showQuestion(open, true);
        }
      });
    });

    host.replaceChildren(
      h(
        'div',
        { class: 'quiz-head' },
        h('p', { class: 'quiz-count' }, `Question ${index + 1} of ${QUIZ.length}`),
        track(),
      ),
      prompt,
      h('div', { class: 'quiz-options', role: 'group', 'aria-labelledby': prompt.id }, ...options),
      h(
        'div',
        { class: 'quiz-confidence' },
        h(
          'div',
          { class: 'conf-head' },
          h('label', { class: 'field-label', for: 'quiz-confidence' }, 'How sure are you?'),
          h('p', { class: 'conf-readout', 'aria-hidden': 'true' }, value, words),
        ),
        slider,
        h(
          'div',
          { class: 'conf-ticks', 'aria-hidden': 'true' },
          h('span', {}, '50% · coin flip'),
          h('span', {}, '75%'),
          h('span', {}, '100% · certain'),
        ),
      ),
      h('div', { class: 'quiz-actions' }, lock, hint),
      result,
    );

    if (moveFocus) {
      prompt.focus({ preventScroll: true });
      const top = host.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) host.scrollIntoView({ block: 'start' });
    }
  }

  function showDone(): void {
    const right = QUIZ.filter((q) => answers[q.id]?.correct).length;
    const title = h('p', { class: 'quiz-done-title' }, `All ${QUIZ.length} answered. You got ${right} right.`);
    const again = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Take the quiz again');
    again.addEventListener('click', () => {
      handlers.reset();
      showQuestion(0, true);
    });
    host.replaceChildren(
      h('div', { class: 'quiz-head' }, h('p', { class: 'quiz-count' }, 'Your answers'), track()),
      title,
      h(
        'ol',
        { class: 'quiz-review' },
        ...QUIZ.map((q) => {
          const a = answers[q.id]!;
          return h(
            'li',
            { class: a.correct ? 'is-right' : 'is-wrong' },
            h('span', { class: 'quiz-mark', 'aria-hidden': 'true' }, a.correct ? '✓' : '✗'),
            h('span', { class: 'visually-hidden' }, a.correct ? 'Right: ' : 'Wrong: '),
            h('span', { class: 'review-q' }, q.prompt),
            h(
              'span',
              { class: 'review-a' },
              `You said ${q.options[a.choice]}, ${Math.round(a.confidence * 100)}% sure`,
              a.correct ? '' : `. Answer: ${q.options[q.answer]}`,
            ),
          );
        }),
      ),
      h('div', { class: 'quiz-actions' }, again),
    );
  }

  const open = firstOpen();
  if (open === -1) showDone();
  else showQuestion(open, false);
}

/* ------------------------------------------------------------------ */
/* The calibration curve                                               */
/* ------------------------------------------------------------------ */

function calibrationChart(host: HTMLElement): { update(list: Answer[]): void } {
  const plot = h('div', { class: 'calib-plot' });
  host.append(plot);
  const tip = tooltip(host);
  let answers: Answer[] = [];
  let width = 0;

  const binLabel = (b: CalibrationBin) =>
    `${Math.round(b.lo * 100)}–${b.hi === 1 ? 100 : Math.round(b.hi * 100) - 1}% sure`;

  const draw = () => {
    if (!width) return;
    const W = width;
    const H = Math.round(Math.min(430, Math.max(280, W * 0.7)));
    const m = { top: 30, right: 16, bottom: 48, left: 46 };
    const x = scaleLinear().domain([0.5, 1]).range([m.left, W - m.right]);
    const y = scaleLinear().domain([0, 1]).range([H - m.bottom, m.top]);
    const r = scaleSqrt().domain([1, QUIZ.length]).range([6, 16]);
    const bins = calibrationCurve(answers).filter((b) => b.n > 0);

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: 'group',
      'aria-label': 'Your calibration curve. The table view and the summary beside it give the same numbers.',
    });

    // Grid and axes
    const grid = s('g', { class: 'grid' });
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      grid.append(s('line', { x1: x(0.5), x2: x(1), y1: y(t), y2: y(t) }));
      svg.append(s('text', { class: 'chart-label', x: m.left - 8, y: y(t), dy: '0.32em', 'text-anchor': 'end' }, `${t * 100}%`));
    }
    for (const t of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      grid.append(s('line', { x1: x(t), x2: x(t), y1: y(0), y2: y(1) }));
      svg.append(s('text', { class: 'chart-label', x: x(t), y: H - m.bottom + 18, 'text-anchor': 'middle' }, `${Math.round(t * 100)}%`));
    }
    svg.prepend(grid);
    svg.append(
      s('text', { class: 'chart-label chart-label--strong', x: m.left - 8, y: 12, 'text-anchor': 'start' }, 'How often you were right'),
      s('text', { class: 'chart-label chart-label--strong', x: x(1), y: H - 8, 'text-anchor': 'end' }, 'How sure you said you were →'),
    );

    // Region labels sit under the data.
    svg.append(
      s('text', { class: 'calib-region', x: x(0.985), y: y(0.1), 'text-anchor': 'end' }, 'Overconfident'),
      s('text', { class: 'calib-region-sub', x: x(0.985), y: y(0.1) + 15, 'text-anchor': 'end' }, 'sure, but often wrong'),
      s('text', { class: 'calib-region', x: x(0.515), y: y(0.92), 'text-anchor': 'start' }, 'Underconfident'),
      s('text', { class: 'calib-region-sub', x: x(0.515), y: y(0.92) + 15, 'text-anchor': 'start' }, 'right more often than you said'),
    );

    // The diagonal: confidence equals accuracy.
    svg.append(s('line', { class: 'calib-diagonal', x1: x(0.5), y1: y(0.5), x2: x(1), y2: y(1) }));
    const angle = (Math.atan2(y(1) - y(0.5), x(1) - x(0.5)) * 180) / Math.PI;
    const lx = x(0.7);
    const ly = y(0.7);
    svg.append(
      s('text', { class: 'chart-label', x: lx, y: ly, dy: '-0.6em', transform: `rotate(${angle} ${lx} ${ly})`, 'text-anchor': 'middle' }, 'Perfectly calibrated'),
    );

    if (!bins.length) {
      svg.append(
        s('text', { class: 'chart-label', x: x(0.75), y: y(0.28), 'text-anchor': 'middle' }, 'Your dots appear here as you answer.'),
      );
    } else {
      const path = line<CalibrationBin>()
        .x((b) => x(b.meanConfidence))
        .y((b) => y(b.accuracy));
      if (bins.length > 1) svg.append(s('path', { class: 'calib-line', d: path(bins) ?? '' }));
      for (const b of bins) {
        const cx = x(b.meanConfidence);
        const cy = y(b.accuracy);
        const right = Math.round(b.accuracy * b.n);
        const label = `${binLabel(b)}: ${b.n} ${b.n === 1 ? 'answer' : 'answers'}, right ${right} of ${b.n} (${pct(b.accuracy, 0)}), average confidence ${pct(b.meanConfidence, 0)}.`;
        const hit = s('circle', { class: 'hit', cx, cy, r: Math.max(r(b.n) + 8, 22), tabindex: '0', role: 'img', 'aria-label': label });
        const show = () =>
          tip.show(
            [
              [binLabel(b)],
              [`Right ${right} of ${b.n}`, `${pct(b.accuracy, 0)} right, ${pct(b.meanConfidence, 0)} average confidence`],
            ],
            cx,
            cy - r(b.n),
          );
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('blur', () => tip.hide());
        svg.append(s('circle', { class: 'calib-dot', cx, cy, r: r(b.n) }), hit);
      }
    }
    plot.replaceChildren(svg);
  };

  onWidth(host, (w) => {
    width = w;
    draw();
  });
  tableToggle(host, 'Your calibration', () =>
    dataTable(
      'Your answers grouped by stated confidence',
      ['Stated confidence', 'Answers', 'Average confidence', 'Share right'],
      calibrationCurve(answers).map((b) => [
        binLabel(b),
        b.n,
        b.n ? pct(b.meanConfidence, 0) : '–',
        b.n ? pct(b.accuracy, 0) : '–',
      ]),
    ),
  );

  return {
    update(list) {
      answers = list;
      tip.hide();
      draw();
    },
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function verdictText(sm: CalibrationSummary): string {
  const so = sm.n < QUIZ.length ? `so far (${sm.n} of ${QUIZ.length}), ` : '';
  const said = pct(sm.meanConfidence, 0);
  const got = pct(sm.accuracy, 0);
  const gap = Math.round(Math.abs(sm.gap) * 100);
  switch (sm.verdict) {
    case 'overconfident':
      return capitalize(
        `${so}you are overconfident. You said you were ${said} sure on average and were right ${got} of the time, a gap of ${gap} points. That is a common pattern on tricky general-knowledge questions like these.`,
      );
    case 'underconfident':
      return capitalize(
        `${so}you are underconfident. You were right ${got} of the time but said you were ${said} sure on average. You knew more than you gave yourself credit for.`,
      );
    case 'well calibrated':
      return capitalize(
        `${so}you are well calibrated. Your average confidence (${said}) is within five points of how often you were right (${got}). That is exactly the skill this essay is about.`,
      );
    default:
      return '';
  }
}

function renderSummary(host: HTMLElement, list: Answer[]): void {
  if (!list.length) {
    host.replaceChildren(h('p', { class: 'small muted' }, 'Your numbers appear here as you answer.'));
    return;
  }
  const sm = summarize(list);
  const stat = (label: string, value: string) => h('div', { class: 'calib-stat' }, h('dt', {}, label), h('dd', {}, value));
  host.replaceChildren(
    h(
      'dl',
      { class: 'calib-stats' },
      stat('Answered', `${sm.n} of ${QUIZ.length}`),
      stat('Average confidence', pct(sm.meanConfidence, 0)),
      stat('Share right', pct(sm.accuracy, 0)),
      stat('Brier score', sm.brier.toFixed(2)),
    ),
    h(
      'p',
      { class: 'calib-verdict' },
      sm.n < 3 ? 'Answer a few more questions to see a pattern.' : verdictText(sm),
    ),
    h('p', { class: 'small muted' }, 'Brier score: 0 is perfect; answering 50% every time scores 0.25.'),
  );
}

/* ------------------------------------------------------------------ */
/* Grade the machine                                                   */
/* ------------------------------------------------------------------ */

/** Per 100 questions: the model knows 60; on the other 40 a four-way guess is right one time in four. */
const KNOWN = 60;
const UNKNOWN = 40;
const LUCKY = UNKNOWN / 4;
const WRONG = UNKNOWN - LUCKY;
/** The slider moves in twelfths of a point so the tie at exactly one third is reachable. */
const STEPS = 12;

type Strategy = 'guess' | 'abstain' | 'tie';

function mountGrading(host: HTMLElement): void {
  const PREDICTIONS: Array<[Strategy, string]> = [
    ['guess', 'Always guess'],
    ['abstain', 'Say “I don’t know”'],
    ['tie', 'They tie'],
  ];
  const buttons = PREDICTIONS.map(([id, label]) =>
    h(
      'button',
      { type: 'button', class: 'choice grading-choice', 'aria-pressed': 'false', 'data-id': id },
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
      h('span', {}, label),
    ),
  );
  const question = h(
    'p',
    { class: 'grading-q', id: 'grading-q' },
    'First, a prediction. Suppose a wrong answer costs nothing: it scores zero, the same as “I don’t know”. Which strategy earns the higher score?',
  );
  const feedback = h('p', { class: 'grading-feedback', tabindex: '-1' });

  const slider = h('input', { type: 'range', id: 'grading-penalty', min: 0, max: STEPS, step: 1, value: 0 });
  const penaltyValue = h('span', { class: 'grading-penalty-value' });
  const readout = h('p', { class: 'grading-readout', 'aria-live': 'polite' });

  const units = (cells: Array<[string, number]>) =>
    h(
      'div',
      { class: 'units', 'aria-hidden': 'true' },
      ...cells.flatMap(([kind, n]) => Array.from({ length: n }, () => h('span', { class: `unit unit--${kind}` }))),
    );
  const scoreBar = () => {
    const fill = h('span', { class: 'score-fill' });
    const value = h('span', { class: 'score-value' });
    return { el: h('div', { class: 'score' }, fill, value), fill, value };
  };
  const guessScore = scoreBar();
  const abstainScore = scoreBar();

  const row = (name: string, detail: string, grid: HTMLElement, score: ReturnType<typeof scoreBar>) =>
    h(
      'div',
      { class: 'grading-row' },
      h('div', { class: 'grading-name' }, h('strong', {}, name), h('span', { class: 'small muted' }, detail)),
      grid,
      score.el,
    );

  const live = h(
    'div',
    { class: 'grading-live', hidden: true },
    feedback,
    h(
      'div',
      { class: 'grading-control' },
      h(
        'div',
        { class: 'conf-head' },
        h('label', { class: 'field-label', for: 'grading-penalty' }, 'What a wrong answer costs'),
        h('p', { class: 'conf-readout', 'aria-hidden': 'true' }, penaltyValue),
      ),
      slider,
      h(
        'div',
        { class: 'conf-ticks grading-ticks', 'aria-hidden': 'true' },
        h('span', {}, 'Nothing'),
        h('span', { class: 'tick-third' }, '⅓ point'),
        h('span', {}, '1 point'),
      ),
    ),
    h(
      'div',
      { class: 'grading-rows' },
      h('div', { class: 'grading-row grading-row--head', 'aria-hidden': 'true' }, h('span', {}), h('span', {}, 'Per 100 questions'), h('span', {}, 'Score')),
      row('Always guesses', 'Answers every question', units([['known', KNOWN], ['lucky', LUCKY], ['wrong', WRONG]]), guessScore),
      row('Admits it', 'Says “I don’t know” when unsure', units([['known', KNOWN], ['idk', UNKNOWN]]), abstainScore),
    ),
    h(
      'ul',
      { class: 'legend grading-legend' },
      h('li', {}, h('span', { class: 'unit unit--known' }), 'Knew it'),
      h('li', {}, h('span', { class: 'unit unit--lucky' }), 'Lucky guess'),
      h('li', {}, h('span', { class: 'unit unit--wrong' }), 'Confident wrong answer'),
      h('li', {}, h('span', { class: 'unit unit--idk' }), '“I don’t know”'),
    ),
    readout,
  );

  const update = () => {
    const penalty = Number(slider.value) / STEPS;
    const guess = KNOWN + LUCKY - WRONG * penalty;
    const abstain = KNOWN;
    const cost = penalty === 0 ? 'nothing' : pointsLabel(penalty);
    penaltyValue.textContent = penalty === 0 ? 'Nothing' : `−${pointsLabel(penalty)}`;
    slider.setAttribute('aria-valuetext', `A wrong answer costs ${cost}`);
    // Bars share one scale: 100 points fills the track, leaving room for the label at the tip.
    guessScore.fill.style.width = `calc((100% - 6.5rem) * ${guess / 100})`;
    guessScore.value.textContent = `${fmtScore(guess)} points`;
    abstainScore.fill.style.width = `calc((100% - 6.5rem) * ${abstain / 100})`;
    abstainScore.value.textContent = `${fmtScore(abstain)} points`;
    const diff = Math.abs(guess - abstain);
    readout.textContent =
      diff < 0.01
        ? 'At a third of a point per wrong answer, the two strategies tie. Charge any more and admitting uncertainty wins.'
        : guess > abstain
          ? `Guessing wins by ${fmtScore(diff)} points, and it produces ${WRONG} confident wrong answers per 100 questions. A test like this trains a bluffer.`
          : `Admitting uncertainty now wins by ${fmtScore(diff)} points. The guesser still makes ${WRONG} confident errors, and now they cost it.`;
  };
  slider.addEventListener('input', update);
  update();

  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const id = button.dataset.id as Strategy;
      buttons.forEach((b) => {
        b.setAttribute('aria-pressed', String(b === button));
        b.disabled = true;
      });
      feedback.replaceChildren(
        h('strong', {}, id === 'guess' ? 'Right: guessing wins. ' : 'Not quite: guessing wins. '),
        'The model scores 60 points for what it knows either way. Guessing on the other 40 adds 10 lucky points and loses nothing for the 30 misses, so it finishes ahead, 70 to 60. Now make wrong answers cost something.',
      );
      live.hidden = false;
      feedback.focus({ preventScroll: true });
      announce(feedback.textContent ?? '');
    }),
  );

  host.replaceChildren(
    h('div', { class: 'grading-predict' }, question, h('div', { class: 'grading-choices', role: 'group', 'aria-labelledby': 'grading-q' }, ...buttons)),
    live,
  );
}

/** 1/3 → "⅓ point", 0.25 → "0.25 points", 1 → "1 point". */
function pointsLabel(p: number): string {
  if (Math.abs(p - 1 / 3) < 1e-9) return '⅓ point';
  if (Math.abs(p - 2 / 3) < 1e-9) return '⅔ point';
  if (p === 1) return '1 point';
  return `${p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} points`;
}

function fmtScore(x: number): string {
  return Number.isInteger(Math.round(x * 10) / 10) ? String(Math.round(x)) : x.toFixed(1);
}
