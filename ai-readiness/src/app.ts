/**
 * The page's three screens and how you move between them:
 *
 *   intro  →  question 1 … 18  →  results
 *
 * Every move is a browser history entry, so a phone's back gesture steps back
 * one question instead of leaving the page. The intro and the questions live
 * at "/", and results at "/results#…" with the answers after the "#" (see
 * lib/share.ts), so a result can be reloaded, bookmarked or shared.
 *
 * Answers in progress are kept in sessionStorage: they survive a reload but
 * end with the tab, and never leave the browser.
 */
import { CONTENT } from './content.ts';
import type { EmailAdapter } from './email/adapter.ts';
import { allQuestions, type Mode, type ScoringModel } from './lib/model.ts';
import { isAnswer, isComplete, questionCount, score } from './lib/scoring.ts';
import { decodeSnapshot, resultUrl, sameAnswers, type Snapshot } from './lib/share.ts';
import { localIsoDate, tx } from './lib/text.ts';
import { qs } from './ui/dom.ts';
import { renderQuestion } from './ui/quiz.ts';
import { renderResults } from './ui/results.ts';

type Screen = { view: 'intro' } | { view: 'question'; index: number } | { view: 'results' };
/** What each history entry remembers; `depth` tells Back whether an entry of ours sits behind it. */
type Entry = Screen & { depth: number };

interface Progress {
  mode: Mode;
  answers: (number | null)[];
}

const PROGRESS_KEY = 'hbyai-progress';
/** The last result finished in this tab, to tell "your result" from someone else's link. */
const FINISHED_KEY = 'hbyai-finished';

const R = CONTENT.results;
const MODEL: ScoringModel = { dimensions: CONTENT.dimensions, stages: CONTENT.stages, rules: CONTENT.rules };
const QUESTIONS = allQuestions(CONTENT.dimensions);
const TOTAL = questionCount(MODEL);
const EXPECTED = { version: CONTENT.shareVersion, questions: TOTAL };

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private browsing): answers then last until the page closes.
  }
}

function validProgress(value: Progress | null): Progress | null {
  if (!value || (value.mode !== 'department' && value.mode !== 'company')) return null;
  if (!Array.isArray(value.answers) || value.answers.length !== TOTAL) return null;
  return { mode: value.mode, answers: value.answers.map((a) => (isAnswer(a) ? a : null)) };
}

export class App {
  private readonly intro = qs<HTMLElement>('#intro');
  private readonly quiz = qs<HTMLElement>('#quiz');
  private readonly results = qs<HTMLElement>('#results');
  private readonly notice = qs<HTMLElement>('#link-notice');
  private readonly baseTitle = document.title;
  private progress: Progress | null = validProgress(read<Progress>(PROGRESS_KEY));
  private depth = 0;
  private readonly email: EmailAdapter;

  constructor(email: EmailAdapter) {
    this.email = email;
  }

  start(): void {
    for (const button of this.intro.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      const mode = button.dataset.mode;
      if (mode === 'department' || mode === 'company') button.addEventListener('click', () => this.begin(mode));
    }
    window.addEventListener('popstate', (event) => this.restore(event.state as Entry | null, true));
    this.restore(history.state as Entry | null, false);
  }

  /** Shows whatever the address and the history entry describe. `moved` is false on first load, so focus stays put. */
  private restore(entry: Entry | null, moved: boolean): void {
    this.depth = entry?.depth ?? 0;
    const decoded = decodeSnapshot(location.hash, EXPECTED);

    if (decoded.ok) {
      this.showResults(decoded.snapshot, moved);
      if (!entry) history.replaceState({ view: 'results', depth: 0 } satisfies Entry, '');
      return;
    }

    if (entry?.view === 'question' && this.progress && entry.index >= 0 && entry.index < TOTAL) {
      this.showQuestion(entry.index, moved);
      return;
    }

    // Anything else is the intro: a plain visit, an empty /results, or a damaged link (said so on the intro).
    if (!decoded.ok && decoded.reason !== 'empty') this.showNotice(decoded.reason === 'old' ? R.badLink.old : R.badLink.broken);
    if (location.pathname !== '/' || location.hash) history.replaceState({ view: 'intro', depth: this.depth } satisfies Entry, '', '/' + location.search);
    else if (!entry) history.replaceState({ view: 'intro', depth: 0 } satisfies Entry, '');
    this.showIntro(moved);
  }

  private go(screen: Screen, url?: string): void {
    this.depth += 1;
    history.pushState({ ...screen, depth: this.depth } satisfies Entry, '', url ?? location.pathname + location.search);
  }

  /** Back: the previous history entry when it's one of ours, otherwise the screen before this one. */
  private back(index: number): void {
    if (this.depth > 0) {
      history.back();
      return;
    }
    const previous: Screen = index > 0 ? { view: 'question', index: index - 1 } : { view: 'intro' };
    history.replaceState({ ...previous, depth: 0 } satisfies Entry, '');
    if (previous.view === 'question') this.showQuestion(previous.index, true);
    else this.showIntro(true);
  }

  // ---------- Screens ----------

  private show(view: HTMLElement, title: string, moved: boolean): void {
    for (const v of [this.intro, this.quiz, this.results]) v.hidden = v !== view;
    document.title = title;
    if (moved) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      view.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }
  }

  private showNotice(message: string): void {
    this.notice.textContent = tx(message);
    this.notice.hidden = false;
  }

  private showIntro(moved: boolean): void {
    this.show(this.intro, this.baseTitle, moved);
  }

  private begin(mode: Mode): void {
    const answers = this.progress?.answers ?? Array.from({ length: TOTAL }, () => null);
    this.progress = { mode, answers };
    write(PROGRESS_KEY, this.progress);
    this.notice.hidden = true;
    this.go({ view: 'question', index: 0 }, '/');
    this.showQuestion(0, true);
  }

  private showQuestion(index: number, moved: boolean): void {
    const progress = this.progress;
    const spot = QUESTIONS[index];
    if (!progress || !spot) return this.showIntro(moved);
    renderQuestion(
      this.quiz,
      {
        index,
        total: TOTAL,
        mode: progress.mode,
        dimension: spot.dimension,
        question: spot.question,
        answer: progress.answers[index] ?? null,
        answered: progress.answers.map((a) => a !== null),
      },
      {
        choose: (value) => {
          progress.answers[index] = value;
          write(PROGRESS_KEY, progress);
        },
        next: () => this.next(index),
        back: () => this.back(index),
      },
    );
    this.show(this.quiz, `${tx(CONTENT.quiz.progress, { n: index + 1, total: TOTAL })} · ${tx(CONTENT.site.name)}`, moved);
  }

  private next(index: number): void {
    const progress = this.progress;
    if (!progress) return;
    if (index < TOTAL - 1) {
      this.go({ view: 'question', index: index + 1 });
      this.showQuestion(index + 1, true);
      return;
    }
    // A question skipped by editing history can't be scored: send them to it.
    const missing = progress.answers.findIndex((a) => a === null);
    if (missing >= 0 || !isComplete(progress.answers, MODEL)) {
      this.go({ view: 'question', index: Math.max(missing, 0) });
      this.showQuestion(Math.max(missing, 0), true);
      return;
    }
    const snapshot: Snapshot = { mode: progress.mode, answers: [...progress.answers], date: localIsoDate() };
    write(FINISHED_KEY, snapshot);
    const url = resultUrl('', snapshot, CONTENT.shareVersion);
    this.go({ view: 'results' }, url);
    this.showResults(snapshot, true);
  }

  private showResults(snapshot: Snapshot, moved: boolean): void {
    const finished = read<Snapshot>(FINISHED_KEY);
    const shared = !(finished && sameAnswers(finished, snapshot));
    const result = score(snapshot.answers, MODEL);
    renderResults(
      this.results,
      { result, snapshot, shared, url: resultUrl(location.origin, snapshot, CONTENT.shareVersion), email: this.email },
      {
        startOver: () => {
          this.progress = null;
          write(PROGRESS_KEY, null);
          write(FINISHED_KEY, null);
          this.go({ view: 'intro' }, '/');
          this.showIntro(true);
        },
        takeIt: () => {
          this.go({ view: 'intro' }, '/');
          this.showIntro(true);
        },
      },
    );
    const stage = CONTENT.stages[result.stageIndex]?.name ?? '';
    this.show(this.results, `${tx(shared ? R.kicker.shared : R.kicker.own)}: ${stage} · ${tx(CONTENT.site.name)}`, moved);
  }
}
