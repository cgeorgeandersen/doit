/**
 * Chapter 5: When Trust Scales.
 *
 * A live hiring screener, trained in the browser on a synthetic history
 * (src/engine/hiring.ts), shows how a proxy carries bias forward; then three
 * dilemmas and the principles they illustrate.
 */
import { createScrolly } from '../lib/scrolly';
import { h, qs, idle } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { cite, renderCitations } from '../lib/citations';
import { pct } from '../lib/format';
import { sigmoid } from '../engine/logistic';
import {
  FEATURES,
  buildScenario,
  runScenario,
  type Applicant,
  type FeatureKey,
  type Group,
  type Scenario,
  type ScenarioResult,
} from '../engine/hiring';
import { DILEMMAS, PRINCIPLES, type Dilemma } from '../content/dilemmas';

const ORDER: FeatureKey[] = ['skill', 'experience', 'eastfield', 'groupB'];
const WITH_PROXY: FeatureKey[] = ['skill', 'experience', 'eastfield'];
const WITHOUT_PROXY: FeatureKey[] = ['skill', 'experience'];
const SWITCH_LABELS: Record<FeatureKey, string> = {
  skill: 'Skills-test score',
  experience: 'Years of experience',
  eastfield: 'Zip code (Eastfield or Westfield)',
  groupB: 'Group (A or B)',
};
/** Weight bars share one fixed scale so toggling features never rescales them. */
const WEIGHT_MAX = 1.5;

type Prediction = 'equal' | 'unequal' | 'unsure';

export function mountResponsible(section: HTMLElement): void {
  mountBiasDemo(section);
  mountDilemmas(qs('#dilemma-list', section));
  mountPrinciples(qs('#principles', section));
  renderCitations(section);
}

/* ------------------------------------------------------------------ */
/* The screener                                                        */
/* ------------------------------------------------------------------ */

function mountBiasDemo(section: HTMLElement): void {
  const stage = qs('#bias-stage', section);
  const scenario: Scenario = buildScenario();
  const cache = new Map<string, ScenarioResult>();
  const run = (features: FeatureKey[]): ScenarioResult => {
    const key = ORDER.filter((f) => features.includes(f)).join('+');
    let result = cache.get(key);
    if (!result) {
      result = runScenario(scenario, ORDER.filter((f) => features.includes(f)));
      cache.set(key, result);
    }
    return result;
  };

  let features: FeatureKey[] = [...WITH_PROXY];
  let prediction: Prediction | null = caseFile.get().bias?.prediction ?? null;

  /* ---------- Panel 1: history ---------- */
  const historyRates = groupRates(scenario.history, (a) => a.hired === 1);
  const stat = (list: Applicant[], g: Group, f: (a: Applicant) => number) => {
    const xs = list.filter((a) => a.group === g).map(f);
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const historyPanel = h(
    'div',
    { class: 'panel panel-history' },
    h('p', { class: 'panel-title' }, 'The history: 2,000 past applicants'),
    h(
      'div',
      { class: 'waffles' },
      waffle('Group A', historyRates.A, 'hired', 'human'),
      waffle('Group B', historyRates.B, 'hired', 'human'),
    ),
    h('p', { class: 'waffle-caption' }, 'Hired by past managers, per 100 applicants in each group'),
    h(
      'table',
      { class: 'data-table bias-compare' },
      h('caption', {}, 'Same qualifications, different neighbourhoods'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), h('th', { scope: 'col' }, 'Group A'), h('th', { scope: 'col' }, 'Group B'))),
      h(
        'tbody',
        {},
        compareRow('Average skills-test score', stat(scenario.history, 'A', (a) => a.skill).toFixed(1), stat(scenario.history, 'B', (a) => a.skill).toFixed(1)),
        compareRow(
          'Average years of experience',
          stat(scenario.history, 'A', (a) => a.experience).toFixed(1),
          stat(scenario.history, 'B', (a) => a.experience).toFixed(1),
        ),
        compareRow('Live in Eastfield', pct(stat(scenario.history, 'A', (a) => a.eastfield), 0), pct(stat(scenario.history, 'B', (a) => a.eastfield), 0)),
      ),
    ),
  );

  /* ---------- Panel 2: prediction ---------- */
  const PREDICTIONS: Array<[Prediction, string]> = [
    ['equal', 'It will treat both groups the same. It can’t see the group.'],
    ['unequal', 'It will still favour one group.'],
    ['unsure', 'I’m not sure.'],
  ];
  const predictButtons = PREDICTIONS.map(([id, label]) =>
    h(
      'button',
      { type: 'button', class: 'choice bias-predict', 'aria-pressed': String(prediction === id), 'data-id': id },
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
      h('span', {}, label),
    ),
  );
  const predictNote = h('p', { class: 'bias-predict-note', 'aria-live': 'polite' });
  const predictPanel = h(
    'div',
    { class: 'panel panel-predict' },
    h('p', { class: 'panel-title', id: 'bias-predict-q' }, 'The screener never sees the group. Will it treat A and B equally?'),
    h('div', { class: 'bias-predict-options', role: 'group', 'aria-labelledby': 'bias-predict-q' }, ...predictButtons),
    predictNote,
  );
  predictButtons.forEach((b) =>
    b.addEventListener('click', () => {
      prediction = b.dataset.id as Prediction;
      predictButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      caseFile.update((f) => {
        f.bias = { prediction: prediction! };
      });
      predictNote.textContent = 'Noted. Go to the next step to see what it does.';
      renderScreen();
    }),
  );
  if (prediction) predictNote.textContent = 'Your prediction is saved. Go to the next step to see what it does.';

  /* ---------- Panel 3: the screener ---------- */
  const switches = ORDER.map((key) =>
    h(
      'button',
      { type: 'button', class: `switch switch--${key}`, 'aria-pressed': 'false', 'data-key': key },
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })),
      h('span', { class: 'switch-label' }, SWITCH_LABELS[key]),
    ),
  );
  const yours = h('p', { class: 'bias-yours' });
  const screenWaffles = h('div', { class: 'waffles' });
  const ratio = h('div', { class: 'ratio' });
  const weights = h('ul', { class: 'weights', 'aria-label': 'What the screener learned: weight on each feature' });
  const agreement = h('p', { class: 'agreement' });
  const busy = h('p', { class: 'bias-busy small muted', hidden: true }, 'Retraining…');

  const screenPanel = h(
    'div',
    { class: 'panel panel-screen' },
    h(
      'div',
      { class: 'switches', role: 'group', 'aria-label': 'What the screener can see' },
      h('p', { class: 'switches-title' }, 'What the screener can see'),
      ...switches,
    ),
    yours,
    h(
      'div',
      { class: 'screen-grid' },
      h(
        'div',
        { class: 'screen-rates' },
        h('p', { class: 'panel-sub' }, 'Advanced by the screener, per 100 new applicants'),
        screenWaffles,
        ratio,
      ),
      h(
        'div',
        { class: 'screen-model' },
        h('p', { class: 'panel-sub' }, 'What it learned'),
        weights,
        agreement,
      ),
    ),
    busy,
  );

  switches.forEach((sw) =>
    sw.addEventListener('click', () => {
      const key = sw.dataset.key as FeatureKey;
      const on = features.includes(key);
      if (on && features.length === 1) {
        announce('The screener needs at least one thing to look at.');
        return;
      }
      features = on ? features.filter((f) => f !== key) : [...features, key];
      busy.hidden = cache.has(ORDER.filter((f) => features.includes(f)).join('+'));
      // Let the "Retraining…" note paint before the synchronous training runs.
      requestAnimationFrame(() =>
        setTimeout(() => {
          renderScreen();
          busy.hidden = true;
          const r = run(features);
          announce(
            `Retrained. Group A advanced at ${pct(r.fairness.rates.A.rate, 0)}, group B at ${pct(r.fairness.rates.B.rate, 0)}. Ratio ${r.fairness.impactRatio.toFixed(2)}, ${r.fairness.passesFourFifths ? 'above' : 'below'} the four-fifths line.`,
          );
        }, 0),
      );
    }),
  );

  function renderScreen(): void {
    const r = run(features);
    switches.forEach((sw) => sw.setAttribute('aria-pressed', String(features.includes(sw.dataset.key as FeatureKey))));
    const rates = r.fairness.rates;
    screenWaffles.replaceChildren(waffle('Group A', rates.A.rate, 'advanced', 'machine'), waffle('Group B', rates.B.rate, 'advanced', 'machine'));

    // Impact ratio against the four-fifths line.
    const lowGroup = r.fairness.disadvantaged;
    const highGroup = lowGroup === 'A' ? 'B' : 'A';
    const x = Math.max(0, Math.min(1, r.fairness.impactRatio));
    const marker = h('span', { class: 'ratio-marker' }, h('span', { class: 'ratio-value' }, r.fairness.impactRatio.toFixed(2)));
    marker.style.left = `${x * 100}%`;
    ratio.replaceChildren(
      h('p', { class: 'ratio-title' }, 'Impact ratio: the lower rate divided by the higher'),
      h(
        'div',
        { class: 'ratio-track', 'aria-hidden': 'true' },
        h('span', { class: 'ratio-below' }),
        h('span', { class: 'ratio-line' }, h('span', { class: 'ratio-line-label' }, 'four-fifths')),
        marker,
      ),
      h(
        'p',
        { class: `ratio-verdict ${r.fairness.passesFourFifths ? 'is-pass' : 'is-fail'}` },
        r.fairness.passesFourFifths
          ? `Above the line: group ${lowGroup} is advanced at ${pct(r.fairness.impactRatio, 0)} of group ${highGroup}’s rate.`
          : `Below the line: group ${lowGroup} is advanced at only ${pct(r.fairness.impactRatio, 0)} of group ${highGroup}’s rate.`,
      ),
    );

    // Weights on standardized features.
    weights.replaceChildren(
      ...r.model.featureNames.map((name, i) => {
        const w = r.model.weights[i]!;
        const width = (Math.min(Math.abs(w), WEIGHT_MAX) / WEIGHT_MAX) * 50;
        const bar = h('span', { class: `weight-bar ${w < 0 ? 'is-neg' : 'is-pos'}` });
        bar.style.width = `${width}%`;
        bar.style.left = w < 0 ? `${50 - width}%` : '50%';
        return h(
          'li',
          { class: 'weight' },
          h('span', { class: 'weight-name' }, FEATURES[name as FeatureKey].label),
          h('span', { class: 'weight-track', 'aria-hidden': 'true' }, h('span', { class: 'weight-zero' }), bar),
          h('span', { class: 'weight-value' }, `${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(2)}`),
        );
      }),
    );

    const withProxy = run(WITH_PROXY);
    const same = r === withProxy;
    agreement.replaceChildren(
      h('strong', {}, `Agrees with past decisions: ${Math.round(r.agreement * 100)} in 100`),
      h(
        'span',
        { class: 'agreement-note' },
        ' Pick one past hire and one past rejection at random: this is how often the screener ranks the hire higher.',
        same ? '' : ` With the zip code it was ${Math.round(withProxy.agreement * 100)} in 100.`,
      ),
    );

    if (prediction) {
      const unequal = !r.fairness.passesFourFifths;
      const said = { equal: 'treat both groups the same', unequal: 'still favour one group', unsure: 'you weren’t sure' }[prediction];
      yours.textContent =
        prediction === 'unsure'
          ? `You weren’t sure. ${unequal ? 'With these inputs, it favours one group.' : 'With these inputs, it stays above the line.'}`
          : `You predicted it would ${said}. ${
              (prediction === 'unequal') === unequal ? 'With these inputs, that’s what happens.' : 'With these inputs, it doesn’t.'
            }`;
      yours.hidden = false;
    } else {
      yours.hidden = true;
    }
  }

  /* ---------- Panel 4: one applicant ---------- */
  const personPanel = h('div', { class: 'panel panel-person' });
  function renderPerson(): void {
    const r = run(WITH_PROXY);
    const cf = r.counterfactual;
    if (!cf) {
      personPanel.replaceChildren(h('p', {}, 'In this draw, no applicant’s result depended on their address alone.'));
      return;
    }
    const a = cf.applicant;
    const skillRank = scenario.pool.filter((p) => p.skill < a.skill).length / scenario.pool.length;
    const probNow = sigmoid(cf.scoreNow);
    const probMoved = sigmoid(cf.scoreIfMoved);
    const probCut = sigmoid(cf.cutoff);
    const lo = Math.min(probNow, probCut, probMoved);
    const hi = Math.max(probNow, probCut, probMoved);
    const span = hi - lo || 1;
    const at = (p: number) => `${8 + ((p - lo) / span) * 84}%`;
    const mark = (cls: string, p: number, label: string) => {
      const el = h('span', { class: `cf-mark ${cls}` }, h('span', { class: 'cf-mark-label' }, label));
      el.style.left = at(p);
      return el;
    };
    personPanel.replaceChildren(
      h('p', { class: 'panel-title' }, `Applicant #${a.id}`),
      h(
        'dl',
        { class: 'cf-facts' },
        fact('Group', a.group),
        fact('Lives in', a.eastfield ? 'Eastfield' : 'Westfield'),
        fact('Skills test', `${a.skill.toFixed(1)}, higher than ${Math.round(skillRank * 100)}% of applicants`),
        fact('Experience', `${a.experience.toFixed(1)} years`),
      ),
      h(
        'div',
        { class: 'cf-scale', 'aria-hidden': 'true' },
        h('span', { class: 'cf-axis' }),
        mark('cf-cut', probCut, `cutoff ${pct(probCut, 0)}`),
        mark('cf-now', probNow, `as is ${pct(probNow, 0)}`),
        mark('cf-moved', probMoved, `if in Westfield ${pct(probMoved, 0)}`),
      ),
      h(
        'p',
        { class: 'cf-verdict' },
        h('strong', {}, 'Screened out. '),
        `The screener put this applicant’s chance of having been hired in the past at ${pct(probNow, 0)}, below the cutoff of ${pct(
          probCut,
          0,
        )}. With a Westfield address and everything else the same, it would have been ${pct(probMoved, 0)}: `,
        h('strong', {}, 'advanced.'),
      ),
    );
  }

  /* ---------- Assemble ---------- */
  stage.replaceChildren(historyPanel, predictPanel, screenPanel, personPanel);

  const scrollyRoot = qs('#bias-scrolly', section);
  let rendered = false;
  const ensureRendered = () => {
    if (rendered) return;
    rendered = true;
    renderScreen();
    renderPerson();
  };
  createScrolly(scrollyRoot, (i) => {
    stage.dataset.step = String(i);
    if (i === 2) features = [...WITH_PROXY];
    if (i === 3) features = [...WITHOUT_PROXY];
    if (i >= 2) {
      rendered = true;
      renderScreen();
      renderPerson();
    }
  });
  // Train the two main screeners ahead of time, so the steps respond instantly.
  idle(() => {
    run(WITH_PROXY);
    run(WITHOUT_PROXY);
    ensureRendered();
  }, 2500);
}

function groupRates(list: Applicant[], pick: (a: Applicant) => boolean): Record<Group, number> {
  const out = { A: 0, B: 0 } as Record<Group, number>;
  for (const g of ['A', 'B'] as const) {
    const members = list.filter((a) => a.group === g);
    out[g] = members.filter(pick).length / members.length;
  }
  return out;
}

function waffle(label: string, rate: number, verb: string, tone: 'human' | 'machine'): HTMLElement {
  const filled = Math.round(rate * 100);
  return h(
    'figure',
    { class: `waffle waffle--${tone}` },
    h('figcaption', { class: 'waffle-label' }, h('span', { class: 'waffle-group' }, label), h('span', { class: 'waffle-n' }, String(filled))),
    h(
      'div',
      { class: 'waffle-grid', role: 'img', 'aria-label': `${label}: ${filled} of every 100 ${verb}` },
      ...Array.from({ length: 100 }, (_, i) => h('span', { class: i < filled ? 'cell is-on' : 'cell' })),
    ),
  );
}

function compareRow(label: string, a: string, b: string): HTMLTableRowElement {
  return h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, a), h('td', {}, b));
}

function fact(term: string, value: string): HTMLElement {
  return h('div', { class: 'cf-fact' }, h('dt', {}, term), h('dd', {}, value));
}

/* ------------------------------------------------------------------ */
/* Dilemmas and principles                                             */
/* ------------------------------------------------------------------ */

function mountDilemmas(host: HTMLElement): void {
  const saved = caseFile.get().dilemmas ?? {};
  host.replaceChildren(...DILEMMAS.map((d, i) => dilemmaView(d, i, saved[d.id])));
}

function dilemmaView(d: Dilemma, index: number, savedChoice: string | undefined): HTMLElement {
  const qid = `dilemma-${d.id}-q`;
  const outcome = h('div', { class: 'dilemma-outcome', 'aria-live': 'polite' });
  const buttons = d.choices.map((c) =>
    h(
      'button',
      { type: 'button', class: 'choice dilemma-choice', 'aria-pressed': 'false', 'data-id': c.id },
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
      h('span', {}, c.label),
    ),
  );

  const show = (choiceId: string | undefined) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === choiceId)));
    if (!choiceId) {
      outcome.replaceChildren(h('p', { class: 'dilemma-placeholder' }, 'Choose an option to see what it gains and what it risks.'));
      return;
    }
    const ordered = [...d.choices].sort((a, b) => (a.id === choiceId ? -1 : b.id === choiceId ? 1 : 0));
    outcome.replaceChildren(
      h(
        'ul',
        { class: 'tradeoffs' },
        ...ordered.map((c) =>
          h(
            'li',
            { class: c.id === choiceId ? 'is-chosen' : '' },
            h('p', { class: 'tradeoff-name' }, c.id === choiceId ? h('span', { class: 'tradeoff-yours' }, 'Your choice') : '', c.short),
            h('p', { class: 'tradeoff-line' }, h('span', { class: 'tradeoff-k' }, 'Gains'), c.gains),
            h('p', { class: 'tradeoff-line' }, h('span', { class: 'tradeoff-k' }, 'Risks'), c.risks),
          ),
        ),
      ),
      h('p', { class: 'dilemma-lesson' }, d.lesson, cite(...d.sources)),
    );
    renderCitations(outcome);
  };

  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.id!;
      caseFile.update((f) => {
        f.dilemmas = { ...(f.dilemmas ?? {}), [d.id]: id };
      });
      show(id);
      const c = d.choices.find((x) => x.id === id)!;
      announce(`${c.short}. Gains: ${c.gains} Risks: ${c.risks}`);
    }),
  );

  const article = h(
    'article',
    { class: 'dilemma', id: `dilemma-${d.id}` },
    h(
      'div',
      { class: 'dilemma-main' },
      h('p', { class: 'dilemma-kicker' }, `${index + 1} · ${d.principle}`),
      h('p', { class: 'dilemma-scenario' }, d.scenario),
      h('p', { class: 'dilemma-question', id: qid }, d.question),
      h('div', { class: 'dilemma-choices', role: 'group', 'aria-labelledby': qid }, ...buttons),
    ),
    outcome,
  );
  show(savedChoice);
  return article;
}

function mountPrinciples(host: HTMLElement): void {
  host.replaceChildren(
    ...PRINCIPLES.map((p) =>
      h('div', { class: 'principle' }, h('dt', {}, p.name), h('dd', {}, h('span', { class: 'principle-k' }, 'Prevents '), p.prevents)),
    ),
  );
}
