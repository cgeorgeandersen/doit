/**
 * One question per screen: where it sits (dimension, progress), the question
 * as the screen's heading, four options as a radio group, and Back / Next.
 *
 * Keyboard: Tab reaches the group, the arrow keys choose, Enter goes on.
 * Choosing never moves on by itself, so arrowing through the options is safe.
 */
import { ASSESSMENT } from './content.ts';
import { h } from './dom.ts';
import type { Frameworks } from './frameworks.ts';
import { say, type Dimension, type Mode, type Question } from './model.ts';
import { tx } from './text.ts';

export interface QuestionScreen {
  index: number;
  total: number;
  mode: Mode;
  dimension: Dimension;
  question: Question;
  answer: number | null;
  /** For each question, whether it has an answer: drawn in the progress bar. */
  answered: boolean[];
  frameworks: Frameworks;
}

export interface QuestionActions {
  choose(value: number): void;
  next(): void;
  back(): void;
}

/** 18 small bars in six groups, one group per dimension, in its framework's color. */
function progressBar(screen: QuestionScreen): HTMLElement {
  const groups: HTMLElement[] = [];
  let i = 0;
  for (const dimension of ASSESSMENT.dimensions) {
    const bars = dimension.questions.map(() => {
      const at = i++;
      const state = at === screen.index ? 'now' : screen.answered[at] ? 'done' : 'todo';
      return h('i', { class: `seg seg--${state}` });
    });
    groups.push(h('span', { class: 'seg-group', 'data-fw': screen.frameworks.info(dimension.framework).color }, bars));
  }
  return h('div', { class: 'q-progress', 'aria-hidden': 'true' }, groups);
}

export function renderQuestion(root: HTMLElement, screen: QuestionScreen, actions: QuestionActions): void {
  const { quiz } = ASSESSMENT;
  const { framework: frameworkId } = screen.dimension;
  const framework = screen.frameworks.info(frameworkId);
  const isLast = screen.index === screen.total - 1;
  const name = `q${screen.index}`;

  const error = h('p', { id: 'q-error', class: 'q-error', role: 'alert', hidden: true });
  const radios: HTMLInputElement[] = [];

  const options = screen.question.options.map((option, value) => {
    const input = h('input', {
      type: 'radio',
      name,
      value,
      checked: screen.answer === value,
      onchange: () => {
        actions.choose(value);
        error.hidden = true;
        fieldset.removeAttribute('aria-invalid');
      },
    });
    radios.push(input);
    return h('label', { class: 'opt' }, input, h('span', { class: 'opt-text' }, tx(say(option, screen.mode))));
  });

  const fieldset = h(
    'fieldset',
    { class: 'q-fieldset', 'aria-describedby': 'q-error' },
    h(
      'legend',
      { class: 'q-legend' },
      h(
        'h1',
        { class: 'q-title', tabindex: '-1' },
        h('span', { class: 'q-count' }, tx(quiz.progress, { n: screen.index + 1, total: screen.total })),
        // Read as "Question 4 of 18. How do you…": a pause between the count and the question.
        h('span', { class: 'visually-hidden' }, '. '),
        h('span', { class: 'q-text' }, tx(say(screen.question.prompt, screen.mode))),
      ),
    ),
    h('div', { class: 'q-options' }, options),
  );

  const form = h(
    'form',
    {
      class: 'q-form',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        if (!radios.some((r) => r.checked)) {
          error.textContent = tx(quiz.required);
          error.hidden = false;
          fieldset.setAttribute('aria-invalid', 'true');
          radios[0]?.focus();
          return;
        }
        actions.next();
      },
    },
    fieldset,
    error,
    h(
      'div',
      { class: 'q-nav' },
      h('button', { type: 'button', class: 'btn btn--quiet q-back', onclick: () => actions.back() }, h('span', { 'aria-hidden': 'true' }, '←'), ` ${tx(quiz.back)}`),
      h(
        'button',
        { type: 'submit', class: 'btn btn--primary q-next' },
        `${tx(isLast ? quiz.finish : quiz.next)} `,
        h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
      ),
    ),
  );

  // Enter on a chosen option goes on, in every browser (some don't submit a form from a radio button).
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'radio') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'quiz-inner' },
      h(
        'div',
        { class: 'q-top', 'data-fw': framework.color },
        h('p', { class: 'kicker q-dimension' }, h('span', null, screen.frameworks.chip(frameworkId), h('span', { class: 'q-dimension-name' }, tx(screen.dimension.name))), h('span', { class: 'q-asks' }, tx(screen.dimension.asks))),
        progressBar(screen),
      ),
      form,
    ),
  );
}
