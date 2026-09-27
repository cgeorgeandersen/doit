/**
 * One-question predictions. The reader commits to an answer, then the
 * explanation appears. Markup (readable without scripts, where the
 * explanation is simply shown):
 *
 *   <div class="poll" data-poll="id">
 *     <p class="poll-q" id="id-q">Question?</p>
 *     <div class="poll-options" role="group" aria-labelledby="id-q">
 *       <button type="button" class="choice poll-choice" data-value="a" data-correct>…</button>
 *     </div>
 *     <div class="poll-reveal js-hidden">…</div>
 *   </div>
 */
import { h, qs, qsa } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { renderCitations } from '../lib/citations';

export function mountPolls(root: ParentNode): void {
  qsa<HTMLElement>('[data-poll]', root).forEach(mountPoll);
}

function mountPoll(poll: HTMLElement): void {
  const id = poll.dataset.poll!;
  const buttons = qsa<HTMLButtonElement>('.poll-choice', poll);
  const reveal = qs('.poll-reveal', poll);
  buttons.forEach((b) => {
    b.setAttribute('aria-pressed', 'false');
    const label = h('span', { class: 'poll-label' }, ...Array.from(b.childNodes));
    b.replaceChildren(h('span', { class: 'choice-mark', 'aria-hidden': 'true' }), label);
  });

  const show = (value: string, animate: boolean) => {
    buttons.forEach((b) => {
      b.disabled = true;
      b.setAttribute('aria-pressed', String(b.dataset.value === value));
      if (b.hasAttribute('data-correct')) {
        b.classList.add('is-correct');
        b.append(h('span', { class: 'poll-tag' }, '✓ What happened'));
      }
    });
    const picked = buttons.find((b) => b.dataset.value === value);
    const right = picked?.hasAttribute('data-correct') ?? false;
    const verdict = h(
      'p',
      { class: 'poll-verdict', tabindex: '-1' },
      h('strong', {}, right ? 'You called it.' : 'Not what happened.'),
    );
    reveal.prepend(verdict);
    reveal.classList.remove('js-hidden');
    poll.classList.add('is-revealed');
    if (animate) poll.classList.add('is-animating');
    renderCitations(poll);
    return verdict;
  };

  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      const value = b.dataset.value!;
      caseFile.update((f) => {
        f.polls = { ...(f.polls ?? {}), [id]: value };
      });
      const verdict = show(value, true);
      announce(`${verdict.textContent ?? ''} ${reveal.textContent?.replace(verdict.textContent ?? '', '') ?? ''}`.trim());
      verdict.focus({ preventScroll: true });
    }),
  );

  const saved = caseFile.get().polls?.[id];
  if (saved && buttons.some((b) => b.dataset.value === saved)) show(saved, false);
}
