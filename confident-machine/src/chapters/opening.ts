/**
 * Opening: two answers, one from a person and one from a machine. The reader
 * commits to one before learning which is which. Then the machine's answer
 * changes into the machine typeface and the error is marked.
 */
import { h, qs, qsa } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { machineTextFromString } from '../components/shimmer';
import { cite, renderCitations } from '../lib/citations';

const BARD_BEFORE = 'JWST took';
const BARD_WRONG = 'the very first pictures of a planet outside of our own solar system.';
const BARD_AFTER = 'These distant worlds are called “exoplanets.” Exo means “from outside.”';

export function mountOpening(section: HTMLElement): void {
  const answers = qs('#opening-answers', section);
  const cardA = qs('[data-answer="A"]', answers);
  const cardB = qs('[data-answer="B"]', answers);
  const after = qs('#opening-after', section);
  const prompt = qs('[data-opening-prompt]', section);
  const verdict = qs('[data-opening-verdict]', section);
  const buttons = qsa<HTMLButtonElement>('.answer-pick', answers);

  function reveal(pick: 'A' | 'B', animate: boolean): void {
    buttons.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.pick === pick));
      b.disabled = true;
    });
    answers.classList.add('is-revealed');
    if (animate) answers.classList.add('is-animating');

    // Answer A becomes machine text, with the false phrase flagged.
    const textA = qs('[data-answer-text]', cardA);
    const wrong = machineTextFromString(BARD_WRONG);
    textA.replaceChildren(
      machineTextFromString(BARD_BEFORE),
      ' ',
      h('span', { class: 'flag-wrong' }, wrong, h('span', { class: 'visually-hidden' }, ' (false)')),
      ' ',
      machineTextFromString(BARD_AFTER),
    );
    qs('.answer-label', cardA).replaceChildren(h('span', { class: 'who who--machine' }, 'Machine'), ' Answer A');
    qs('.answer-label', cardB).replaceChildren(h('span', { class: 'who who--human' }, 'People'), ' Answer B');

    const sourceA = qs('[data-answer-source]', cardA);
    sourceA.replaceChildren(
      h('span', { class: 'mark-no', 'aria-hidden': 'true' }, '✗'),
      ' Not the first. The first picture of a planet outside our solar system was taken in 2004 by a telescope in Chile. ',
      h('span', { class: 'answer-origin' }, 'Google’s Bard chatbot, launch demo, Feb. 2023', cite('bard-demo', 'nasa-2m1207')),
    );
    const sourceB = qs('[data-answer-source]', cardB);
    sourceB.replaceChildren(
      h('span', { class: 'mark-yes', 'aria-hidden': 'true' }, '✓'),
      ' Correct: Webb’s own first direct image of a distant planet, a gas giant called HIP 65426 b. ',
      h('span', { class: 'answer-origin' }, 'NASA announcement, Sept. 2022', cite('nasa-webb-exoplanet')),
    );
    sourceA.classList.remove('js-hidden');
    sourceB.classList.remove('js-hidden');

    verdict.textContent =
      pick === 'A'
        ? 'You trusted answer A. Many readers do: it is warm, simple and written for a child. It is also wrong, and it came from a machine.'
        : 'You trusted answer B, which came from people at NASA and is right. Good instinct. But look how little separates the two.';
    prompt.hidden = true;
    after.classList.remove('js-hidden');
    renderCitations(section);
  }

  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const pick = button.dataset.pick as 'A' | 'B';
      caseFile.update((f) => {
        f.opening = { trusted: pick === 'A' ? 'machine' : 'human', correct: pick === 'B' };
      });
      reveal(pick, true);
      announce(
        pick === 'A'
          ? 'You chose answer A. It was written by Google’s Bard chatbot, and its central claim is false.'
          : 'You chose answer B. It was written by people at NASA, and it is correct. Answer A was Google’s Bard chatbot, and its claim is false.',
      );
      verdict.setAttribute('tabindex', '-1');
      verdict.focus({ preventScroll: true });
    }),
  );

  const saved = caseFile.get().opening;
  if (saved) reveal(saved.trusted === 'machine' ? 'A' : 'B', false);
}
