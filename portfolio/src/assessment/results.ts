/**
 * The results screen: the stage, the score by dimension, the biggest gaps
 * with a next step each, what the result is and isn't, ways to keep or share
 * it and the optional email form. The contact band after it is the site's
 * own ContactBand, written by Assessment.astro.
 *
 * The dimension chart never relies on color: each row has its name and the
 * framework's symbol, the points as text ("6 of 9"), the bar's length and
 * its stage in words. Gaps are tagged "Gap 1", "Gap 2"… in text too.
 */
import { PLAYBOOK } from '../playbook/content.ts';
import { PLAYBOOK_PATH } from '../playbook/model.ts';
import { ASSESSMENT } from './content.ts';
import { announce, h } from './dom.ts';
import { looksLikeEmail, type EmailAdapter, type EmailRequest } from './email.ts';
import type { Frameworks } from './frameworks.ts';
import { say, type Mode } from './model.ts';
import type { DimensionScore, Result } from './scoring.ts';
import type { Snapshot } from './share.ts';
import { formatDate, numberWord, oneDecimal, steps, tx } from './text.ts';

export interface ResultsScreen {
  result: Result;
  snapshot: Snapshot;
  /** True when someone else's link was opened. */
  shared: boolean;
  /** The address of this result, answers included. */
  url: string;
  email: EmailAdapter;
  frameworks: Frameworks;
}

export interface ResultsActions {
  startOver(): void;
  takeIt(): void;
}

const R = ASSESSMENT.results;
const stageName = (index: number) => ASSESSMENT.stages[index]?.name ?? '';

/** A "Read more →" link in the site's style. A no-break space keeps the arrow with the last word. */
function moreLink(href: string, label: string): HTMLAnchorElement {
  return h('a', { href, class: 'more' }, `${label}\u00a0`, h('span', { 'aria-hidden': 'true' }, '→'));
}

function sectionTitle(id: string, text: string): HTMLHeadingElement {
  return h('h2', { id, class: 'r-h2' }, tx(text));
}

// ---------- The head: stage, scale, points ----------

function head(screen: ResultsScreen): HTMLElement {
  const { result, snapshot, shared } = screen;
  const mode = snapshot.mode;
  const stage = ASSESSMENT.stages[result.stageIndex]!;
  const last = ASSESSMENT.stages.length - 1;
  const isTop = result.stageIndex === last;

  const track = h(
    'ol',
    { class: 'track', 'aria-label': tx(R.trackLabel) },
    ASSESSMENT.stages.map((s, i) =>
      h(
        'li',
        { class: `track-step${i === result.stageIndex ? ' track-step--here' : ''}${i === last ? ' track-step--goal' : ''}`, 'aria-current': i === result.stageIndex ? 'step' : null },
        h('span', { class: 'track-name' }, s.name),
        i === result.stageIndex ? h('span', { class: 'track-here' }, tx(R.youAreHere)) : null,
      ),
    ),
  );

  const capped = result.cappedBy
    ? h(
        'p',
        { class: 'r-capped' },
        tx(R.capped, {
          uncapped: stageName(result.averageStageIndex),
          dimension: result.cappedBy.dimension.name,
          weakStage: stageName(result.cappedBy.stageIndex),
          steps: steps(ASSESSMENT.rules.weakestLinkCap ?? 1),
        }),
      )
    : null;

  return h(
    'header',
    { class: 'r-head' },
    h(
      'p',
      { class: 'kicker' },
      h('span', null, tx(shared ? R.kicker.shared : R.kicker.own)),
      h('span', null, tx(R.snapshot)),
      snapshot.date
        ? h(
            'span',
            null,
            h('span', { class: 'stamp' }, h('span', { class: 'stamp-dot', 'aria-hidden': 'true' }), h('span', null, tx(R.stamp, { date: formatDate(snapshot.date) }))),
          )
        : null,
    ),
    h(
      'h1',
      { class: 'r-title', tabindex: '-1' },
      h('span', { class: 'r-lead' }, `${tx(say(shared ? R.lead.shared : R.lead.own, mode))} `),
      h('span', { class: `r-stage${isTop ? ' emphasis' : ''}` }, stage.name),
    ),
    h('p', { class: 'dek r-definition' }, tx(stage.definition)),
    track,
    h('p', { class: 'r-points' }, tx(R.points, { points: result.points, max: result.max, average: oneDecimal(result.average) })),
    capped,
    h('p', { class: 'r-next' }, h('span', { class: 'key' }, tx(isTop ? R.nextLabel.top : R.nextLabel.up)), ' ', tx(stage.next)),
  );
}

// ---------- The chart: points by dimension ----------

function dimensionRow(d: DimensionScore, gapNumber: number | null, frameworks: Frameworks): HTMLElement {
  const framework = frameworks.info(d.dimension.framework);
  const segments = Array.from({ length: d.max }, (_, i) => h('i', { class: i < d.points ? 'on' : null }));
  return h(
    'li',
    { class: 'dim', 'data-fw': framework.color },
    h(
      'div',
      { class: 'dim-head' },
      h('span', { class: 'dim-name' }, frameworks.chip(d.dimension.framework), h('span', null, tx(d.dimension.name))),
      h('span', { class: 'dim-points' }, tx(R.dimensionPoints, { points: d.points, max: d.max }), h('span', { class: 'visually-hidden' }, ` ${ASSESSMENT.pointsWord}`)),
    ),
    h('span', { class: 'dim-bar', 'aria-hidden': 'true' }, segments),
    h(
      'p',
      { class: 'dim-meta' },
      h('span', { class: 'dim-stage' }, stageName(d.stageIndex)),
      gapNumber !== null ? h('span', { class: 'gap-tag' }, tx(R.gapTag, { n: gapNumber })) : null,
    ),
  );
}

function dimensions(result: Result, frameworks: Frameworks): HTMLElement {
  const gapNumber = (d: DimensionScore) => {
    const at = result.gaps.indexOf(d);
    return at < 0 ? null : at + 1;
  };
  const max = result.dimensions[0]?.max ?? 9;
  return h(
    'section',
    { class: 'r-section r-dims', 'aria-labelledby': 'dims-title' },
    sectionTitle('dims-title', R.dimensionsHeading),
    h('p', { class: 'r-intro' }, tx(R.dimensionsIntro, { max })),
    h('ol', { class: 'dims' }, result.dimensions.map((d) => dimensionRow(d, gapNumber(d), frameworks))),
  );
}

// ---------- The gaps ----------

function gapCard(d: DimensionScore, n: number, mode: Mode, frameworks: Frameworks): HTMLElement {
  // The dimension's play in the playbook: what good looks like there, and how to close the gap.
  const play = PLAYBOOK.plays.find((p) => p.dimension === d.dimension.id);
  const framework = frameworks.info(d.dimension.framework);
  const { question, answer } = d.weakest;
  const option = question.options[answer];
  return h(
    'li',
    { class: 'gap', 'data-fw': framework.color },
    h(
      'div',
      { class: 'gap-head' },
      h('span', { class: 'gap-num', 'aria-hidden': 'true' }, String(n).padStart(2, '0')),
      h('h3', { class: 'gap-title' }, h('span', { class: 'visually-hidden' }, `${tx(R.gapTag, { n })}: `), frameworks.chip(d.dimension.framework), h('span', null, tx(d.dimension.name))),
      h('span', { class: 'gap-points' }, tx(R.dimensionPoints, { points: d.points, max: d.max }), h('span', { class: 'visually-hidden' }, ` ${ASSESSMENT.pointsWord}`)),
    ),
    h(
      'div',
      { class: 'gap-body' },
      h(
        'div',
        { class: 'gap-said' },
        h('p', { class: 'key' }, tx(R.gaps.said)),
        h('p', { class: 'gap-q' }, tx(say(question.prompt, mode))),
        option !== undefined ? h('p', { class: 'gap-a' }, `“${tx(say(option, mode))}”`) : null,
      ),
      h('div', { class: 'gap-step' }, h('p', { class: 'key' }, tx(R.gaps.step)), h('p', null, tx(say(question.nextStep, mode)))),
    ),
    h(
      'p',
      { class: 'gap-read' },
      play ? moreLink(`${PLAYBOOK_PATH}#${play.dimension}`, tx(R.gaps.play, { play: play.title })) : null,
      moreLink(framework.path, tx(R.gaps.read, { framework: framework.title })),
    ),
  );
}

function gaps(screen: ResultsScreen): HTMLElement {
  const { result, shared, snapshot, frameworks } = screen;
  const count = result.gaps.length;
  const who = shared ? 'shared' : 'own';
  const heading = count === 1 ? R.gaps.headingOne[who] : tx(R.gaps.heading[who], { count: numberWord(count) });
  return h(
    'section',
    { class: 'r-section r-gaps', 'aria-labelledby': 'gaps-title' },
    sectionTitle('gaps-title', count === 0 ? R.gaps.heading[who].replace(/\s*\{count\}/, '') : heading),
    count === 0
      ? h('p', { class: 'r-intro' }, tx(R.gaps.none))
      : [h('p', { class: 'r-intro' }, tx(R.gaps.intro)), h('ol', { class: 'gaps' }, result.gaps.map((d, i) => gapCard(d, i + 1, snapshot.mode, frameworks)))],
  );
}

// ---------- What this is, and how it's scored ----------

function thresholds(): string {
  const stages = ASSESSMENT.stages;
  return stages
    .map((stage, i) =>
      i === 0
        ? tx(R.about.thresholdFirst, { stage: stage.name, next: String(stages[1]?.minAverage ?? 3) })
        : tx(R.about.thresholdOther, { stage: stage.name, min: String(stage.minAverage) }),
    )
    .join(', ');
}

function about(result: Result): HTMLElement {
  const cap = ASSESSMENT.rules.weakestLinkCap;
  const values = { questions: result.answers.length, max: result.dimensions[0]?.max ?? 9, thresholds: thresholds(), steps: steps(cap ?? 1) };
  // Lines can be reordered or added in content.ts; the weakest-link line (the one with {steps}) goes when the rule is off.
  const method = R.about.method.filter((line) => cap !== null || !line.includes('{steps}')).map((line) => tx(line, values));

  return h(
    'section',
    { class: 'r-section r-about', 'aria-labelledby': 'about-title' },
    sectionTitle('about-title', R.about.heading),
    h('div', { class: 'r-about-text' }, R.about.paragraphs.map((p) => h('p', null, tx(p)))),
    h('details', { class: 'method' }, h('summary', null, tx(R.about.methodHeading)), h('ul', null, method.map((line) => h('li', null, line)))),
  );
}

// ---------- Keep or share ----------

async function copyText(text: string, input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard access: select the link so it can be copied by hand.
    input.focus();
    input.select();
    return false;
  }
}

function actions(screen: ResultsScreen, act: ResultsActions): HTMLElement {
  const A = R.actions;
  const status = h('p', { class: 'r-status', role: 'status' });
  const report = (message: string) => {
    status.textContent = message;
    announce(message);
  };
  const input = h('input', { id: 'share-link', class: 'share-input', type: 'text', readonly: true, value: screen.url, 'aria-describedby': 'share-note' });
  input.addEventListener('focus', () => input.select());

  const canShare = typeof navigator.share === 'function';
  return h(
    'section',
    { class: 'r-section r-actions', 'aria-labelledby': 'actions-title' },
    sectionTitle('actions-title', A.heading),
    h(
      'div',
      { class: 'share-field' },
      h('label', { class: 'label', for: 'share-link' }, tx(A.linkLabel)),
      h(
        'div',
        { class: 'share-row' },
        input,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => {
              void copyText(screen.url, input).then((ok) => report(tx(ok ? A.copied : A.copyFailed)));
            },
          },
          tx(A.copy),
        ),
      ),
      h('p', { id: 'share-note', class: 'share-note' }, tx(A.linkNote)),
    ),
    h(
      'p',
      { class: 'r-buttons' },
      h('button', { type: 'button', class: 'btn', onclick: () => window.print() }, tx(A.print)),
      canShare
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                navigator.share({ title: tx(ASSESSMENT.name), url: screen.url }).catch(() => {
                  // Closing the share sheet rejects too; nothing to report.
                });
              },
            },
            tx(A.share),
          )
        : null,
      h('button', { type: 'button', class: 'btn', onclick: () => (screen.shared ? act.takeIt() : act.startOver()) }, tx(screen.shared ? R.shared.takeIt : A.startOver)),
    ),
    status,
  );
}

// ---------- Email (only with a ready adapter) ----------

function emailForm(screen: ResultsScreen): HTMLElement | null {
  if (!screen.email.ready || screen.shared) return null;
  const E = ASSESSMENT.email;
  const { result, snapshot } = screen;
  const input = h('input', { id: 'email-input', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', required: true, 'aria-describedby': 'email-consent email-status' });
  const notes = h('input', { type: 'checkbox', name: 'notes' });
  const status = h('p', { id: 'email-status', class: 'r-status', role: 'status' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, tx(E.submit));

  const form = h(
    'form',
    {
      class: 'email-form',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        const email = input.value.trim();
        if (!looksLikeEmail(email)) {
          input.setAttribute('aria-invalid', 'true');
          status.textContent = tx(E.invalid);
          input.focus();
          return;
        }
        input.removeAttribute('aria-invalid');
        const request: EmailRequest = {
          email,
          wantsNotes: notes.checked,
          resultUrl: screen.url,
          summary: {
            mode: snapshot.mode,
            stage: stageName(result.stageIndex),
            points: result.points,
            max: result.max,
            gaps: result.gaps.map((g) => g.dimension.name),
            date: snapshot.date,
          },
        };
        submit.disabled = true;
        status.textContent = tx(E.sending);
        void screen.email.send(request).then((outcome) => {
          submit.disabled = false;
          status.textContent = tx(outcome.ok ? E.sent : E.failed);
          if (outcome.ok) form.reset();
        });
      },
    },
    h('label', { class: 'label', for: 'email-input' }, tx(E.label)),
    input,
    h('label', { class: 'check' }, notes, h('span', null, tx(E.notes))),
    h('p', { id: 'email-consent', class: 'consent' }, tx(E.consent)),
    h('p', null, submit),
    status,
  );

  return h('section', { class: 'r-section r-email', 'aria-labelledby': 'email-title' }, sectionTitle('email-title', E.heading), h('p', { class: 'r-intro' }, tx(E.intro)), form);
}

export function renderResults(root: HTMLElement, screen: ResultsScreen, act: ResultsActions): void {
  const banner = screen.shared
    ? h(
        'div',
        { class: 'shared-banner' },
        h('p', null, tx(R.shared.banner)),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => act.takeIt() }, `${tx(R.shared.takeIt)} `, h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')),
      )
    : null;

  root.replaceChildren(
    ...[
      banner,
      head(screen),
      dimensions(screen.result, screen.frameworks),
      gaps(screen),
      about(screen.result),
      actions(screen, act),
      emailForm(screen),
      h('p', { class: 'print-only' }, `${tx(R.actions.printLink)} ${screen.url}`),
    ].filter((node): node is HTMLElement => node !== null),
  );
}
