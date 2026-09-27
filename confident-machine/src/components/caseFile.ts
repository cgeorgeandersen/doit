/**
 * The case file drawer: a quiet record of the reader's answers and scores.
 * Non-modal: opens from a corner button, closes with Escape, returns focus.
 */
import { h } from '../lib/dom';
import { caseFile, filledCount, type CaseFile } from '../lib/store';
import { pct, duration } from '../lib/format';
import { DILEMMAS } from '../content/dilemmas';
import { FRONTIER } from '../content/frontier';
import { TASKS, quadrantOf } from '../content/trustmap';
import { reducedMotion } from '../lib/motion';

interface Row {
  chapter: string;
  href: string;
  label: string;
  value: (file: CaseFile) => string | null;
}

const ROWS: Row[] = [
  {
    chapter: 'Opening',
    href: '#opening',
    label: 'Which answer you trusted',
    value: (f) =>
      f.opening
        ? f.opening.trusted === 'machine'
          ? 'The machine’s (Bard’s). It held the error.'
          : 'The person’s (NASA’s). It was right.'
        : null,
  },
  {
    chapter: '1',
    href: '#prediction',
    label: 'Your guess after “I am”',
    value: (f) => (f.prediction ? `“${f.prediction.guess}”${f.prediction.correct ? ', correct' : '; the model said “sure”'}` : null),
  },
  {
    chapter: '1',
    href: '#prediction',
    label: 'Your sentence',
    value: (f) => f.sentence ?? null,
  },
  {
    chapter: '2',
    href: '#confidently-wrong',
    label: 'Your calibration',
    value: (f) => {
      const s = f.calibration?.summary;
      if (!s || !s.n) return null;
      if (s.n < 5) return `${s.n} of 10 questions answered so far.`;
      return `${pct(s.meanConfidence, 0)} sure on average, right ${pct(s.accuracy, 0)} of the time: ${s.verdict}.`;
    },
  },
  {
    chapter: '3',
    href: '#jagged-frontier',
    label: 'Frontier sort',
    value: (f) =>
      f.frontier?.revealed && f.frontier.score !== undefined
        ? `${f.frontier.score} of ${FRONTIER.length} sorted the way the research does.`
        : null,
  },
  {
    chapter: '4',
    href: '#trust-map',
    label: 'Trust map',
    value: (f) => {
      const placed = Object.entries(f.trustmap?.placements ?? {});
      if (!placed.length) return null;
      const human = placed.filter(([, p]) => quadrantOf(p.x, p.y) === 'human').length;
      return `${placed.length} of ${TASKS.length} tasks placed; ${human} kept human.`;
    },
  },
  {
    chapter: '5',
    href: '#when-trust-scales',
    label: 'Your prediction about the screener',
    value: (f) =>
      f.bias
        ? { equal: 'It would treat both groups the same.', unequal: 'It would still favour one group.', unsure: 'You weren’t sure.' }[
            f.bias.prediction
          ]
        : null,
  },
  {
    chapter: '5',
    href: '#dilemmas',
    label: 'Your dilemma choices',
    value: (f) => {
      const picks = DILEMMAS.map((d) => {
        const c = d.choices.find((x) => x.id === f.dilemmas?.[d.id]);
        return c ? `${d.principle}: ${c.short}` : null;
      }).filter(Boolean);
      return picks.length ? picks.join('; ') : null;
    },
  },
  {
    chapter: '6',
    href: '#moving-boundary',
    label: 'Your read on the moving boundary',
    value: (f) => {
      const parts: string[] = [];
      if (f.moving?.horizonGuess) parts.push(`guessed ${duration(f.moving.horizonGuess)} for 2026`);
      const st = f.moving?.stillTrue;
      if (st && Object.keys(st).length) parts.push(`answered ${Object.keys(st).length} "still true?" questions`);
      return parts.length ? `You ${parts.join(' and ')}.` : null;
    },
  },
  {
    chapter: 'Close',
    href: '#what-we-keep',
    label: 'What you keep',
    value: (f) => (f.keep?.length ? f.keep.join('; ') : null),
  },
];

export function initCaseFile(host: HTMLElement): void {
  const count = h('span', { class: 'casefile-count' }, '0');
  const toggle = h(
    'button',
    { type: 'button', class: 'casefile-toggle', 'aria-expanded': 'false', 'aria-controls': 'casefile-panel' },
    h('span', { class: 'casefile-tab', 'aria-hidden': 'true' }),
    h('span', { class: 'casefile-label' }, 'Case file'),
    count,
  );
  const list = h('dl', { class: 'casefile-list' });
  const closeBtn = h('button', { type: 'button', class: 'btn btn--quiet casefile-close' }, 'Close');
  const clearBtn = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Clear case file');
  const panel = h(
    'aside',
    { id: 'casefile-panel', class: 'casefile', 'aria-labelledby': 'casefile-title', hidden: true },
    h(
      'div',
      { class: 'casefile-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Your'), h('h2', { id: 'casefile-title', class: 'casefile-title' }, 'Case file')),
      closeBtn,
    ),
    h('p', { class: 'small muted casefile-intro' }, 'What you decided along the way. It becomes your rules at the end, and it stays in this browser.'),
    list,
    h(
      'div',
      { class: 'casefile-actions' },
      h('a', { href: '#rules', class: 'btn btn--primary' }, 'See your rules'),
      clearBtn,
    ),
  );
  host.replaceChildren(toggle, panel);

  const open = (show: boolean) => {
    panel.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (show) closeBtn.focus();
  };
  toggle.addEventListener('click', () => open(panel.hidden !== false));
  closeBtn.addEventListener('click', () => {
    open(false);
    toggle.focus();
  });
  panel.querySelector('a[href="#rules"]')?.addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      open(false);
      toggle.focus();
    }
  });

  let confirming = false;
  clearBtn.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      clearBtn.textContent = 'Click again to clear';
      window.setTimeout(() => {
        confirming = false;
        clearBtn.textContent = 'Clear case file';
      }, 4000);
      return;
    }
    confirming = false;
    clearBtn.textContent = 'Clear case file';
    caseFile.reset();
    window.location.reload();
  });

  let lastCount = -1;
  const render = (file: CaseFile) => {
    list.replaceChildren(
      ...ROWS.flatMap((row) => {
        const value = row.value(file);
        return [
          h('dt', {}, h('span', { class: 'casefile-chapter' }, row.chapter), h('a', { href: row.href }, row.label)),
          h('dd', { class: value ? '' : 'is-empty' }, value ?? 'Not yet'),
        ];
      }),
    );
    const n = filledCount(file);
    count.textContent = String(n);
    toggle.setAttribute('aria-label', `Case file, ${n} ${n === 1 ? 'entry' : 'entries'}`);
    if (lastCount >= 0 && n > lastCount && !reducedMotion()) {
      toggle.classList.remove('is-new');
      void toggle.offsetWidth; // restart the animation
      toggle.classList.add('is-new');
    }
    lastCount = n;
  };
  caseFile.subscribe(render);
  render(caseFile.get());
}
