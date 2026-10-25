import { CASES, CAST } from '../core/cases';
import { career, DOCKET_SIZE, pickDocket } from '../core/docket';
import { describe, rule, STEPS, type Ruling, type Sentence, type SentenceKind } from '../core/sentence';
import { holdMs, INTRO_MS, OBJECTION_MS, TYPE_MS_PER_CHAR } from '../core/timing';
import type { Case, Character, Line, Objection, Speaker } from '../core/types';
import * as sound from './audio';
import { fill, h } from './dom';
import { createGavel } from './gavel';
import { galleryRow, portrait } from './portrait';
import { load, save } from './storage';

type Phase = 'title' | 'intro' | 'arguing' | 'outburst' | 'objection' | 'ruling' | 'verdict' | 'career';

/** Said by someone in the room when the judge strikes the gavel for no reason. */
const QUIPS = [
  'The court reporter jumps.',
  "Bailiff Dot: \"Nobody's talking, Your Honor.\"",
  'Morty Pleasant spills his coffee.',
  'Constance Grimm: "Was that at me?"',
  'The defendant flinches.',
  'A pigeon leaves the windowsill.',
  'Somebody in the back row wakes up.',
  "Bailiff Dot: \"That's a nice gavel, Your Honor.\"",
];

/** Said when the judge takes a while to rule. */
const NUDGES = [
  "Bailiff Dot: \"Your Honor? The defendant's parking meter is running out.\"",
  'Morty Pleasant clears his throat. Twice.',
  'Constance Grimm checks her watch, loudly.',
  'Someone in the gallery opens a bag of chips.',
];

const KINDS: Array<{ kind: Exclude<SentenceKind, 'special'>; label: string }> = [
  { kind: 'free', label: 'Set free' },
  { kind: 'fine', label: 'Fine' },
  { kind: 'service', label: 'Community service' },
  { kind: 'probation', label: 'Probation' },
  { kind: 'prison', label: 'Prison' },
  { kind: 'death', label: 'Death penalty' },
];

/** Where each slider starts: $500, 100 hours, a year, 5 years. */
const START_STEP = { fine: 3, service: 3, probation: 2, prison: 3 } as const;

export function startGame(root: HTMLElement): void {
  let phase: Phase = 'title';
  let docket: Case[] = [];
  let index = 0;
  let rulings: Ruling[] = [];
  let strikes = 0;
  let orderMs: number[] = [];
  let quip = 0;
  const seen = new Set(load<string[]>('seen', []));

  // Hooks the current phase sets so the gavel, taps and keys know what to do.
  let onAdvance: (() => void) | null = null;
  let onOrder: (() => void) | null = null;
  let onObjection: ((choice: 'sustained' | 'overruled') => void) | null = null;
  let introTimer: number | undefined;
  let nudgeTimer: number | undefined;
  let choice: { kind: SentenceKind; step: number } | null = null;
  /**
   * Screens the gavel moves past (the case card, the paper, the review) ignore
   * it until this time, so an enthusiastic judge banging away can't skip one
   * before it has been seen.
   */
  let lockedUntil = 0;
  /** Stops whatever line is typing, so a new one never types over it. */
  let stopTyping: (() => void) | null = null;

  // ─── Layout ────────────────────────────────────────────────────────────────
  const counter = h('span', { class: 'counter' });
  const scores = h('span', { class: 'scores' });
  const muteButton = h('button', { type: 'button', class: 'mute', onclick: () => toggleMute() });
  const topbar = h('header', { class: 'topbar' }, h('span', { class: 'brand' }, 'All Rise'), counter, scores, muteButton);

  const shouts = h('div', { class: 'shouts', 'aria-hidden': 'true' });
  const seats = {
    pros: seat('pros'),
    witness: seat('witness'),
    defendant: seat('defendant'),
    def: seat('def'),
    bailiff: seat('bailiff'),
  } satisfies Record<Speaker, ReturnType<typeof seat>>;
  for (const who of ['pros', 'def', 'bailiff'] as const) seats[who].set(CAST[who], CAST[who].role);
  const court = h(
    'section',
    { class: 'court', 'aria-label': 'The courtroom' },
    h(
      'div',
      { class: 'wall' },
      h('div', { class: 'seal' }, h('span', null, 'Equal justice'), h('span', null, 'under law'), h('small', null, '(mostly)')),
    ),
    h('div', { class: 'gallery' }, galleryRow(16, 3), galleryRow(14, 11), shouts),
    h('div', { class: 'rail' }),
    h('div', { class: 'seats' }, ...Object.values(seats).map((s) => s.el)),
  );

  const tag = h('span', { class: 'tag' });
  const typed = h('span', { class: 'typed' });
  const rest = h('span', { class: 'rest', 'aria-hidden': 'true' });
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const more = h('span', { class: 'more', 'aria-hidden': 'true' }, '▸');
  const dialogue = h(
    'button',
    { type: 'button', class: 'dialogue', onclick: () => onAdvance?.() },
    tag,
    h('span', { class: 'line' }, typed, rest),
    more,
    live,
  );
  const objectionButtons = h(
    'div',
    { class: 'objection-buttons', hidden: true },
    h('button', { type: 'button', class: 'btn sustain', onclick: () => onObjection?.('sustained') }, 'Sustained'),
    h('button', { type: 'button', class: 'btn overrule', onclick: () => onObjection?.('overruled') }, 'Overruled'),
  );
  const ruling = h('div', { class: 'ruling', hidden: true });
  const panel = h('section', { class: 'panel' }, dialogue, objectionButtons, ruling);

  const overlay = h('div', { class: 'overlay', hidden: true });
  const banner = h('div', { class: 'banner', 'aria-hidden': 'true' });
  const toastEl = h('div', { class: 'toast', role: 'status' });
  const main = h('main', { class: 'main' }, court, panel, overlay, banner, toastEl);

  const gavel = createGavel(() => strike());
  const bench = h(
    'footer',
    { class: 'bench' },
    h('div', { class: 'nameplate' }, h('small', null, 'Presiding'), h('span', null, 'The Hon. You')),
    gavel.el,
  );

  fill(root, h('div', { class: 'stage' }, topbar, main, bench));
  renderMute();
  showTitle();

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (phase === 'objection' && (key === 's' || key === 'o')) onObjection?.(key === 's' ? 'sustained' : 'overruled');
    else if ((phase === 'arguing' || phase === 'intro') && (key === 'enter' || key === 'arrowright') && event.target === document.body) {
      event.preventDefault();
      if (phase === 'intro') beginArguments();
      else onAdvance?.();
    }
  });

  // ─── The gavel ─────────────────────────────────────────────────────────────
  function strike(): void {
    strikes++;
    const now = performance.now();
    if ((phase === 'intro' || phase === 'verdict' || phase === 'career') && now < lockedUntil) {
      // Still banging from the last screen: wait for a pause before moving on.
      lockedUntil = Math.max(lockedUntil, now + 600);
      return;
    }
    switch (phase) {
      case 'title':
        startDocket();
        break;
      case 'intro':
        beginArguments();
        break;
      case 'outburst':
        onOrder?.();
        break;
      case 'arguing':
        toast(QUIPS[quip++ % QUIPS.length]!);
        break;
      case 'objection':
        toast('Sustained or overruled, Your Honor?');
        break;
      case 'ruling':
        if (choice) deliver();
        else toast('Choose a sentence first, Your Honor.');
        break;
      case 'verdict':
        nextCase();
        break;
      case 'career':
        startDocket();
        break;
    }
  }

  // ─── Screens ───────────────────────────────────────────────────────────────
  function showTitle(): void {
    phase = 'title';
    counter.textContent = '';
    scores.textContent = '';
    seats.defendant.clear();
    seats.witness.clear();
    announce('Court is not in session.');
    showOverlay(
      h(
        'div',
        { class: 'card title-card' },
        h('p', { class: 'kicker' }, 'The Honorable You, presiding'),
        h('h1', null, 'All Rise'),
        h(
          'p',
          { class: 'lede' },
          `${DOCKET_SIZE} cases. Two lawyers. One gavel. Hear both sides, then hand down anything from a fine to the death penalty. Some cases are ridiculous. Some aren't.`,
        ),
        h(
          'ul',
          { class: 'how' },
          h('li', null, h('b', null, 'Tap the dialogue'), ' to move things along.'),
          h('li', null, h('b', null, 'When the gallery gets rowdy,'), ' strike the gavel to restore order.'),
          h('li', null, h('b', null, "When you've decided,"), ' pick a sentence and strike the gavel to make it official.'),
        ),
        h('p', { class: 'cta' }, 'Strike the gavel to open court ', h('span', { class: 'arrow' }, '↘')),
      ),
    );
    gavel.setHint('Open court');
    gavel.setEager(true);
  }

  function startDocket(): void {
    docket = pickDocket(CASES, seen);
    index = 0;
    rulings = [];
    strikes = 0;
    orderMs = [];
    showIntro();
  }

  function showIntro(): void {
    phase = 'intro';
    const kase = docket[index]!;
    choice = null;
    ruling.hidden = true;
    dialogue.hidden = false;
    counter.textContent = `Case ${index + 1} of ${docket.length}`;
    renderScores();
    seats.defendant.set(kase.defendant, 'Defendant');
    if (kase.witness) seats.witness.set(kase.witness, 'Witness');
    else seats.witness.clear();
    seats.witness.el.classList.add('waiting');
    announce('All rise!');
    showOverlay(
      h(
        'div',
        { class: 'card intro-card', onclick: () => beginArguments() },
        h('p', { class: 'kicker' }, `Case ${index + 1} of ${docket.length}`),
        h('p', { class: 'versus' }, `The People v. ${kase.defendant.name}`),
        h('h2', null, kase.title),
        h('p', { class: 'charge' }, h('small', null, 'Charge'), kase.charge),
        h('p', { class: 'blurb' }, `${kase.defendant.name}, ${kase.defendant.age}. ${kase.defendant.blurb}`),
      ),
    );
    gavel.setHint('Begin');
    gavel.setEager(false);
    lockedUntil = performance.now() + 700;
    window.clearTimeout(introTimer);
    introTimer = window.setTimeout(beginArguments, INTRO_MS);
  }

  async function beginArguments(): Promise<void> {
    if (phase !== 'intro') return;
    window.clearTimeout(introTimer);
    hideOverlay();
    phase = 'arguing';
    gavel.setHint('');
    const kase = docket[index]!;
    // Most cases get one outburst from the gallery, never before the first line.
    const outburstAt = Math.random() < 0.85 ? 1 + Math.floor(Math.random() * (kase.lines.length - 1)) : -1;
    for (const [i, line] of kase.lines.entries()) {
      if (i === outburstAt) await outburst(kase);
      await say(line, kase);
      if (kase.objection?.after === i) await objection(kase, kase.objection);
    }
    startRuling(kase);
  }

  function outburst(kase: Case): Promise<void> {
    phase = 'outburst';
    const stop = sound.murmur();
    court.classList.add('rowdy');
    const picks = [...kase.gallery].sort(() => Math.random() - 0.5).slice(0, 2);
    fill(
      shouts,
      picks.map((text, i) =>
        h('span', { class: 'shout', style: `left:${8 + i * 46 + Math.random() * 12}%;top:${10 + Math.random() * 30}%` }, text),
      ),
    );
    speaking(null);
    tag.textContent = 'The gallery';
    typed.textContent = 'erupts! Strike the gavel to restore order.';
    rest.textContent = '';
    more.hidden = true;
    gavel.setHint('Order in the court!');
    gavel.setEager(true);
    const started = performance.now();
    return new Promise((resolve) => {
      const done = (byGavel: boolean) => {
        window.clearTimeout(timer);
        onOrder = null;
        stop();
        court.classList.remove('rowdy');
        fill(shouts);
        gavel.setHint('');
        gavel.setEager(false);
        if (byGavel) {
          orderMs.push(performance.now() - started);
          flash('Order!');
        } else toast('Bailiff Dot: "QUIET!" (She did your job.)');
        phase = 'arguing';
        window.setTimeout(resolve, 500);
      };
      onOrder = () => done(true);
      const timer = window.setTimeout(() => done(false), 6500);
    });
  }

  async function objection(kase: Case, o: Objection): Promise<void> {
    sound.objection();
    flash('Objection!');
    phase = 'objection';
    objectionButtons.hidden = false;
    const answer = await new Promise<'sustained' | 'overruled' | 'timeout'>((resolve) => {
      const timer = window.setTimeout(() => resolve('timeout'), OBJECTION_MS + o.text.length * TYPE_MS_PER_CHAR);
      onObjection = (ruled) => {
        window.clearTimeout(timer);
        resolve(ruled);
      };
      void say({ who: o.by, text: o.text }, kase, { hold: false });
    });
    onObjection = null;
    onAdvance = null;
    objectionButtons.hidden = true;
    phase = 'arguing';
    if (answer === 'timeout') toast('Bailiff Dot: "I\'ll take that as overruled."');
    else flash(answer === 'sustained' ? 'Sustained' : 'Overruled');
    await say(answer === 'sustained' ? o.sustained : o.overruled, kase);
  }

  function startRuling(kase: Case): void {
    phase = 'ruling';
    speaking(null);
    dialogue.hidden = true;
    ruling.hidden = false;
    choice = null;
    renderRuling(kase);
    gavel.setHint('Pick a sentence');
    gavel.setEager(false);
    let nudge = 0;
    const scheduleNudge = () => {
      window.clearTimeout(nudgeTimer);
      nudgeTimer = window.setTimeout(() => {
        if (phase !== 'ruling') return;
        toast(NUDGES[nudge++ % NUDGES.length]!);
        scheduleNudge();
      }, 20_000);
    };
    scheduleNudge();
  }

  function renderRuling(kase: Case): void {
    const chosen = choice ? sentenceOf(choice) : null;
    const options = [
      ...KINDS.map(({ kind, label }) => ({ kind: kind as SentenceKind, label, special: false })),
      ...(kase.special ? [{ kind: 'special' as const, label: kase.special.label, special: true }] : []),
    ];
    const chips = h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': 'Sentence' },
      options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': choice?.kind === o.kind ? 'true' : 'false',
            class: `chip${o.special ? ' special' : ''}${o.kind === 'death' ? ' grim' : ''}`,
            onclick: () => {
              choice = { kind: o.kind, step: o.kind in START_STEP ? START_STEP[o.kind as keyof typeof START_STEP] : 0 };
              renderRuling(kase);
              ruling.querySelector<HTMLElement>(choice.kind in START_STEP ? 'input' : '.chip[aria-pressed="true"]')?.focus();
            },
          },
          o.special ? `★ ${o.label}` : o.label,
        ),
      ),
    );

    let slider: HTMLElement | null = null;
    if (choice && choice.kind in STEPS) {
      const steps = STEPS[choice.kind as keyof typeof STEPS];
      const input = h('input', {
        type: 'range',
        min: 0,
        max: steps.length - 1,
        step: 1,
        value: choice.step,
        'aria-label': 'How much',
        'aria-valuetext': chosen ? describe(chosen, kase) : '',
      });
      input.addEventListener('input', () => {
        choice = { kind: choice!.kind, step: Number(input.value) };
        const s = sentenceOf(choice);
        summary.textContent = describe(s, kase);
        input.setAttribute('aria-valuetext', summary.textContent);
      });
      slider = h(
        'div',
        { class: 'slider' },
        h('span', null, stepLabel(steps[0]!, choice.kind)),
        input,
        h('span', null, stepLabel(steps.at(-1)!, choice.kind)),
      );
    }

    const summary = h('p', { class: 'summary' }, chosen ? describe(chosen, kase) : 'Choose a sentence.');
    fill(
      ruling,
      h('p', { class: 'ruling-head' }, h('b', null, 'Your ruling'), ` · ${kase.defendant.name} · ${kase.charge}`),
      chips,
      slider,
      h('div', { class: 'verdict-line' }, summary),
    );
    if (chosen) {
      gavel.setHint(chosen.kind === 'death' ? 'Strike to sentence (no take-backs)' : 'Strike to rule');
      gavel.setEager(true);
    }
  }

  function deliver(): void {
    const kase = docket[index]!;
    const r = rule(kase, sentenceOf(choice!));
    rulings.push(r);
    seen.add(kase.id);
    save('seen', [...seen]);
    phase = 'verdict';
    window.clearTimeout(nudgeTimer);
    gavel.setEager(false);
    gavel.setHint(index + 1 < docket.length ? 'Next case' : 'Close the docket');
    renderScores();
    court.classList.toggle('cheer', r.crowd >= 80);
    court.classList.toggle('boo', r.crowd < 50);
    lockedUntil = performance.now() + 1500;
    const at = index;
    window.setTimeout(() => {
      if (phase !== 'verdict' || index !== at) return;
      court.classList.remove('cheer', 'boo');
      sound.sting(r.band === 'fair' ? 'good' : r.band === 'absurd' ? 'bad' : 'meh');
      showPaper(kase, r);
    }, 450);
  }

  function showPaper(kase: Case, r: Ruling): void {
    const last = index + 1 >= docket.length;
    showOverlay(
      h(
        'article',
        { class: `card paper band-${r.band}` },
        h(
          'header',
          { class: 'masthead' },
          h('span', null, 'The Daily Docket'),
          h('small', null, `Late edition · Case ${index + 1} of ${docket.length}`),
        ),
        h('h2', { class: 'headline' }, r.headline),
        h('p', { class: 'deck' }, `${kase.defendant.name}: ${r.text}.`),
        h('p', { class: 'notes' }, `${r.experts} ${r.gallery}`),
        h('div', { class: 'meters' }, meter('Justice', r.justice), meter('Approval', r.crowd)),
        r.band === 'absurd' ? h('div', { class: 'stamp', 'aria-hidden': 'true' }, 'Overturned') : null,
        h('button', { type: 'button', class: 'btn primary', onclick: () => nextCase() }, last ? 'Close the docket' : 'Next case'),
      ),
    );
    overlay.querySelector<HTMLElement>('.btn')?.focus({ preventScroll: true });
  }

  function nextCase(): void {
    if (phase !== 'verdict') return;
    index++;
    if (index < docket.length) showIntro();
    else showCareer();
  }

  function showCareer(): void {
    phase = 'career';
    const c = career(rulings);
    const avgOrder = orderMs.length ? orderMs.reduce((a, b) => a + b, 0) / orderMs.length / 1000 : null;
    seats.defendant.clear();
    seats.witness.clear();
    announce('Court is adjourned.');
    showOverlay(
      h(
        'div',
        { class: 'card career' },
        h('p', { class: 'kicker' }, 'Docket closed · Your judicial review'),
        h('h2', null, c.title),
        h('p', { class: 'lede' }, c.blurb),
        h(
          'dl',
          { class: 'stats' },
          stat('Justice', `${c.justice}`, 'How close you came to what legal experts call proportionate'),
          stat('Approval', `${c.crowd}`, 'How much the gallery liked it'),
          stat('Overturned', `${c.overturned}`, 'Sentences the appeals court threw out'),
          stat('Gavel strikes', `${strikes}`, avgOrder === null ? 'No outbursts today' : `Order restored in ${avgOrder.toFixed(1)}s on average`),
        ),
        h(
          'ol',
          { class: 'record' },
          rulings.map((r, i) =>
            h(
              'li',
              { class: `band-${r.band}` },
              h('b', null, docket[i]!.title),
              h('span', null, r.text),
              h('em', null, r.headline),
            ),
          ),
        ),
        h(
          'p',
          { class: 'footnote' },
          'There are no right answers to the hard cases, only answers you can defend. The scores just say how your ruling compares with what most legal experts would call proportionate, and with what the gallery wanted.',
        ),
        h('button', { type: 'button', class: 'btn primary', onclick: () => startDocket() }, 'Hear another docket'),
      ),
    );
    gavel.setHint('Another docket');
    gavel.setEager(false);
    lockedUntil = performance.now() + 1500;
  }

  // ─── Dialogue ──────────────────────────────────────────────────────────────
  /** Types a line out with a babble, then waits for the reader (or a tap). */
  function say(line: Line, kase: Case, { hold = true } = {}): Promise<void> {
    const who = characterFor(line.who, kase);
    tag.textContent = who ? `${who.name} · ${roleOf(line.who)}` : roleOf(line.who);
    live.textContent = `${who?.name ?? roleOf(line.who)}: ${line.text}`;
    speaking(line.who);
    if (line.who === 'witness') seats.witness.el.classList.remove('waiting');
    const voice = who && 'emoji' in who.look ? 'emoji' : line.who;
    const text = line.text;
    more.hidden = true;
    stopTyping?.();
    return new Promise((resolve) => {
      let i = 0;
      let holdTimer: number | undefined;
      const render = () => {
        typed.textContent = text.slice(0, i);
        rest.textContent = text.slice(i);
      };
      const typedOut = () => {
        window.clearInterval(typing);
        speaking(null);
        i = text.length;
        render();
        more.hidden = !hold;
        if (hold) holdTimer = window.setTimeout(finish, holdMs(text));
        else resolve();
      };
      const finish = () => {
        window.clearInterval(typing);
        window.clearTimeout(holdTimer);
        onAdvance = null;
        resolve();
      };
      render();
      stopTyping = () => {
        window.clearInterval(typing);
        window.clearTimeout(holdTimer);
      };
      const typing = window.setInterval(() => {
        i++;
        render();
        if (i % 3 === 0 && /\w/.test(text[i - 1] ?? '')) sound.blip(voice);
        if (i >= text.length) typedOut();
      }, TYPE_MS_PER_CHAR);
      onAdvance = () => (i < text.length ? typedOut() : hold && finish());
    });
  }

  /** Shows a line from the bailiff at once, for the one-liners between cases. */
  function announce(text: string): void {
    stopTyping?.();
    speaking(null);
    tag.textContent = `${CAST.bailiff.name} · Bailiff`;
    typed.textContent = text;
    rest.textContent = '';
    more.hidden = true;
  }

  function speaking(who: Speaker | null): void {
    for (const [key, s] of Object.entries(seats)) s.el.classList.toggle('talking', key === who);
  }

  function characterFor(who: Speaker, kase: Case): Character | undefined {
    if (who === 'defendant') return kase.defendant;
    if (who === 'witness') return kase.witness;
    return CAST[who];
  }

  function roleOf(who: Speaker): string {
    return { pros: 'Prosecution', def: 'Defense', defendant: 'Defendant', witness: 'Witness', bailiff: 'Bailiff' }[who];
  }

  // ─── Bits ──────────────────────────────────────────────────────────────────
  function showOverlay(content: HTMLElement): void {
    fill(overlay, content);
    overlay.hidden = false;
    overlay.scrollTop = 0;
  }

  function hideOverlay(): void {
    overlay.hidden = true;
    fill(overlay);
  }

  let toastTimer: number | undefined;
  function toast(text: string): void {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function flash(text: string): void {
    banner.textContent = text;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  function renderScores(): void {
    if (!rulings.length) {
      scores.textContent = '';
      return;
    }
    const avg = (pick: (r: Ruling) => number) => Math.round(rulings.reduce((sum, r) => sum + pick(r), 0) / rulings.length);
    const justice = avg((r) => r.justice);
    const approval = avg((r) => r.crowd);
    fill(
      scores,
      h('span', { title: 'Justice: how proportionate your sentences have been' }, h('span', { 'aria-hidden': 'true' }, '⚖️ '), h('span', { class: 'sr-only' }, 'Justice '), `${justice}`),
      h('span', { title: 'Approval: how much the gallery liked them' }, h('span', { 'aria-hidden': 'true' }, '👏 '), h('span', { class: 'sr-only' }, 'Approval '), `${approval}`),
    );
  }

  function toggleMute(): void {
    sound.setMuted(!sound.isMuted());
    renderMute();
  }

  function renderMute(): void {
    const off = sound.isMuted();
    muteButton.textContent = off ? '🔇' : '🔊';
    muteButton.setAttribute('aria-label', off ? 'Turn sound on' : 'Turn sound off');
    muteButton.setAttribute('aria-pressed', String(off));
  }
}

function sentenceOf(choice: { kind: SentenceKind; step: number }): Sentence {
  switch (choice.kind) {
    case 'fine':
      return { kind: 'fine', amount: STEPS.fine[choice.step]! };
    case 'service':
      return { kind: 'service', hours: STEPS.service[choice.step]! };
    case 'probation':
      return { kind: 'probation', months: STEPS.probation[choice.step]! };
    case 'prison':
      return { kind: 'prison', years: STEPS.prison[choice.step]! };
    default:
      return { kind: choice.kind };
  }
}

function stepLabel(value: number | 'life', kind: SentenceKind): string {
  if (value === 'life') return 'Life';
  switch (kind) {
    case 'fine':
      return value >= 1_000_000 ? `$${value / 1_000_000}M` : value >= 1000 ? `$${value / 1000}k` : `$${value}`;
    case 'service':
      return `${value}h`;
    case 'probation':
      return `${value}mo`;
    default:
      return `${value}y`;
  }
}

function seat(who: Speaker) {
  const figure = h('div', { class: 'figure' });
  const full = h('span', { class: 'full' });
  const short = h('span', { class: 'short', 'aria-hidden': 'true' });
  const name = h('span', { class: 'plate-name' }, full, short);
  const role = h('small', { class: 'plate-role' });
  const el = h('div', { class: `seat seat-${who}` }, figure, h('div', { class: 'desk' }, h('div', { class: 'plate' }, name, role)));
  return {
    el,
    set(character: Character, roleText: string) {
      fill(figure, portrait(character.look));
      // "Joan Abernathy, the buyer" is "Joan Abernathy" on a wide plate and "Abernathy" on a narrow one.
      const plain = character.name.replace(/ \(.*\)$/, '').replace(/,.*$/, '');
      full.textContent = plain;
      short.textContent = plain.replace(/^The /, '').split(' ').at(-1)!.replace(/^./, (c) => c.toUpperCase());
      role.textContent = roleText;
      el.classList.remove('empty');
    },
    clear() {
      fill(figure);
      full.textContent = '';
      short.textContent = '';
      role.textContent = '';
      el.classList.add('empty');
    },
  };
}

function meter(name: string, value: number): HTMLElement {
  return h(
    'div',
    { class: 'meter' },
    h('span', null, name),
    h('span', { class: 'bar' }, h('span', { style: `width:${value}%` })),
    h('b', null, `${value}`),
  );
}

function stat(name: string, value: string, note: string): HTMLElement {
  return h('div', null, h('dt', null, name), h('dd', null, h('b', null, value), h('small', null, note)));
}
