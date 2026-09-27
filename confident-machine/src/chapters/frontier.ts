/**
 * Chapter 3: The Jagged Frontier.
 *
 * The reader sorts twelve tasks into "does well" and "struggles", then sees
 * the research verdict, the reason and the source for each. The score splits
 * misses into over-trust (expected it to do well; it struggles) and
 * under-trust (expected it to struggle; it does well), because the two
 * mistakes cost different things.
 */
import { h, qs } from '../lib/dom';
import { caseFile, type SortChoice } from '../lib/store';
import { announce } from '../lib/announce';
import { cite, renderCitations } from '../lib/citations';
import { FRONTIER, type FrontierCard } from '../content/frontier';
import { mountPolls } from '../components/poll';

const LABEL: Record<SortChoice, string> = { great: 'Does well', struggles: 'Struggles' };
const CHOICES: SortChoice[] = ['great', 'struggles'];

interface Row {
  card: FrontierCard;
  el: HTMLLIElement;
  buttons: HTMLButtonElement[];
  mark: HTMLElement;
  research: HTMLElement;
}

export function mountFrontier(section: HTMLElement): void {
  const ledger = qs('#frontier-ledger', section);
  const status = qs('#frontier-status', section);
  const revealButton = qs<HTMLButtonElement>('#frontier-reveal', section);
  const skipButton = qs<HTMLButtonElement>('#frontier-skip', section);
  const result = qs('#frontier-result', section);

  const saved = caseFile.get().frontier;
  const sorts: Partial<Record<string, SortChoice>> = { ...(saved?.sorts ?? {}) };
  let revealed = false;

  const sortedCount = () => FRONTIER.filter((c) => sorts[c.id]).length;

  const updateStatus = () => {
    const n = sortedCount();
    status.textContent = revealed ? 'The research is shown under each task.' : `${n} of ${FRONTIER.length} sorted`;
    revealButton.disabled = revealed || n < FRONTIER.length;
    revealButton.hidden = revealed;
    skipButton.hidden = revealed || n === FRONTIER.length;
  };

  const rows: Row[] = FRONTIER.map((card, i) => {
    const taskId = `frontier-task-${card.id}`;
    const buttons = CHOICES.map((choice) =>
      h(
        'button',
        { type: 'button', class: 'ledger-pick', 'aria-pressed': String(sorts[card.id] === choice), 'data-choice': choice },
        LABEL[choice],
      ),
    );
    const mark = h('span', { class: 'ledger-mark', 'aria-hidden': 'true' });
    const research = h('div', { class: 'ledger-research', hidden: true });
    const el = h(
      'li',
      { class: 'ledger-row' },
      h('span', { class: 'ledger-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      mark,
      h('p', { class: 'ledger-task', id: taskId }, card.task),
      h('div', { class: 'ledger-toggle', role: 'group', 'aria-labelledby': taskId }, ...buttons),
      research,
    );
    buttons.forEach((button) =>
      button.addEventListener('click', () => {
        if (revealed) return;
        const choice = button.dataset.choice as SortChoice;
        sorts[card.id] = choice;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        caseFile.update((f) => {
          f.frontier = { sorts: { ...(sorts as Record<string, SortChoice>) } };
        });
        updateStatus();
      }),
    );
    return { card, el, buttons, mark, research };
  });
  ledger.replaceChildren(...rows.map((r) => r.el));

  function reveal(animate: boolean): void {
    revealed = true;
    let matched = 0;
    let overTrust = 0;
    let underTrust = 0;
    rows.forEach(({ card, el, buttons, mark, research }, i) => {
      const pick = sorts[card.id];
      buttons.forEach((b) => {
        b.disabled = true;
      });
      if (pick === card.verdict) matched += 1;
      else if (pick === 'great') overTrust += 1;
      else if (pick === 'struggles') underTrust += 1;
      el.classList.add(pick ? (pick === card.verdict ? 'is-match' : 'is-miss') : 'is-unsorted');
      mark.textContent = pick ? (pick === card.verdict ? '✓' : '✗') : '·';
      research.replaceChildren(
        h(
          'p',
          { class: 'ledger-verdict' },
          h('span', { class: `verdict-tag verdict-tag--${card.verdict}` }, `Research: ${LABEL[card.verdict].toLowerCase()}`),
          pick
            ? h('span', { class: 'visually-hidden' }, pick === card.verdict ? ' You matched it.' : ` You said ${LABEL[pick].toLowerCase()}.`)
            : '',
          ' ',
          card.reason,
          cite(...card.sources),
        ),
        card.caveat ? h('p', { class: 'ledger-caveat' }, card.caveat) : '',
      );
      research.hidden = false;
      if (animate) research.style.setProperty('--delay', `${i * 40}ms`);
    });
    if (animate) ledger.classList.add('is-animating');

    const sorted = sortedCount();
    const complete = sorted === FRONTIER.length;
    const heading = h(
      'p',
      { class: 'frontier-score', tabindex: '-1' },
      sorted === 0
        ? 'You skipped the sort. The research verdicts are under each task.'
        : complete
          ? `You matched the research on ${matched} of ${FRONTIER.length}.`
          : `You sorted ${sorted} and matched the research on ${matched}.`,
    );
    result.replaceChildren(heading);
    if (sorted > 0) {
      result.append(
        h(
          'div',
          { class: 'trust-split' },
          h(
            'div',
            { class: 'trust-cell' },
            h('p', { class: 'trust-n' }, String(overTrust)),
            h('p', { class: 'trust-label' }, h('strong', {}, 'Over-trust. '), 'You expected it to do well at a task it struggles with.'),
          ),
          h(
            'div',
            { class: 'trust-cell' },
            h('p', { class: 'trust-n' }, String(underTrust)),
            h('p', { class: 'trust-label' }, h('strong', {}, 'Under-trust. '), 'You expected it to struggle with a task it does well.'),
          ),
        ),
        h(
          'p',
          { class: 'frontier-note' },
          'The two mistakes cost different things. Under-trust wastes time you could have saved. Over-trust is how confident errors get through.',
        ),
      );
    }
    result.hidden = false;
    updateStatus();
    renderCitations(section);

    caseFile.update((f) => {
      f.frontier = {
        sorts: { ...(sorts as Record<string, SortChoice>) },
        revealed: true,
        ...(complete ? { score: matched } : {}),
      };
    });
    if (animate) {
      announce(`${heading.textContent ?? ''} Over-trust: ${overTrust}. Under-trust: ${underTrust}.`);
      heading.focus({ preventScroll: true });
      result.scrollIntoView({ block: 'nearest' });
    }
  }

  revealButton.addEventListener('click', () => reveal(true));
  skipButton.addEventListener('click', () => reveal(true));
  updateStatus();
  if (saved?.revealed) reveal(false);

  mountPolls(section);
}
