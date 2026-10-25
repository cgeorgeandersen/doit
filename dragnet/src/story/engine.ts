/**
 * Runs the shift: one case at a time in the card above the tool panel. Each
 * case is a thread of messages and a series of steps; a step has objectives
 * (met by what the analyst does in the tools) and choices. Every choice is
 * recorded for the shift report.
 */
import { normalizePlate } from '../core/alpr';
import type { ToolId } from '../core/audit';
import { at, fmtTime, TODAY } from '../core/time';
import type { World } from '../core/world';
import type { App } from '../ui/app-state';
import type { Console } from '../ui/console';
import { clear, h, svgIcon } from '../ui/dom';
import { blip } from '../ui/sound';
import { SOURCES, type SourceId } from './sources';

export type Content = Node | string | (Node | string | null | false)[];

export interface Ctx {
  c: Console;
  app: App;
  w: World;
  flags: Map<string, unknown>;
  has(name: string): boolean;
  get<T>(name: string): T | undefined;
  flag(name: string, value?: unknown): void;
  /** A clickable chip that opens a tool. */
  chip(label: string, tool: ToolId, args?: unknown, mono?: boolean): HTMLElement;
  harm(text: string): void;
}

export interface Choice {
  id: string;
  label: string;
  tone?: 'primary' | 'danger' | 'ghost';
  /** Defaults to: every objective of the step is done. */
  enabled?: (ctx: Ctx) => boolean;
  next?: string;
  run?: (ctx: Ctx) => void;
  outcome?: (ctx: Ctx) => Content;
}

export interface Step {
  id: string;
  from?: string;
  text?: (ctx: Ctx) => Content;
  objectives?: { text: string; done: (ctx: Ctx) => boolean }[];
  prompt?: string;
  /** Shown when the objectives are done and there's nothing to choose yet. */
  waiting?: string;
  choices: Choice[];
  auto?: { when: (ctx: Ctx) => boolean; next: string };
}

export interface CaseDef {
  id: string;
  at: [number, number];
  from: string;
  title: string;
  tool: ToolId;
  toolArgs?: (ctx: Ctx) => unknown;
  speed?: number;
  start?: (ctx: Ctx) => (() => void) | void;
  steps: Step[];
  lesson: { title: string; body: (ctx: Ctx) => Content; sources: SourceId[]; science?: { title: string; body: (ctx: Ctx) => Content } };
  /** One line for the shift report: the real case this mirrors. */
  real: string;
}

export interface CaseRecord {
  id: string;
  title: string;
  choices: { step: string; label: string; id: string }[];
  harms: string[];
  real: string;
  sources: SourceId[];
}

type Entry = { kind: 'msg'; from: string; time: number; body: Node } | { kind: 'you'; text: string } | { kind: 'outcome'; body: Node };

export function render(content: Content): Node {
  if (content instanceof Node) return content;
  if (typeof content === 'string') return h('p', null, content);
  const frag = document.createDocumentFragment();
  for (const part of content) {
    if (part === null || part === false) continue;
    frag.append(typeof part === 'string' ? h('p', null, part) : part);
  }
  return frag;
}

export class Story {
  private c: Console;
  private app: App;
  private cases: CaseDef[];
  private index = -1;
  private current: CaseDef | null = null;
  private step: Step | null = null;
  private thread: Entry[] = [];
  private cleanup: (() => void) | null = null;
  private collapsed = false;
  private finished = false;
  private stepHost: HTMLElement | null = null;
  readonly flags = new Map<string, unknown>();
  readonly records: CaseRecord[] = [];
  readonly ctx: Ctx;
  onDone: (() => void) | null = null;

  constructor(c: Console, cases: CaseDef[]) {
    this.c = c;
    this.app = c.app;
    this.cases = cases;
    const self = this;
    this.ctx = {
      c,
      app: c.app,
      w: c.app.world,
      flags: this.flags,
      has: (name) => this.flags.has(name),
      get: <T>(name: string) => this.flags.get(name) as T | undefined,
      flag(name, value = true) {
        self.flags.set(name, value);
        self.refresh();
      },
      chip: (label, tool, args, mono = false) =>
        h('button', { class: `story-chip${mono ? ' mono' : ''}`, type: 'button', onclick: () => c.open(tool, args) }, label),
      harm: (text) => {
        const rec = this.records[this.records.length - 1];
        if (rec && !rec.harms.includes(text)) rec.harms.push(text);
      },
    };
    this.listen();
  }

  /** Turns what the analyst does in the tools into flags the objectives read. */
  private listen(): void {
    const app = this.app;
    const set = (k: string, v: unknown = true) => {
      this.flags.set(k, v);
      this.refresh();
    };
    app.on('plate-search', (e) => {
      set(`plate:${normalizePlate(e.query)}`);
      for (const v of e.vehicles) this.flags.set(`found-vehicle:${v}`, true);
      this.refresh();
    });
    app.on('fingerprint-search', (e) => {
      for (const v of e.vehicles) this.flags.set(`found-vehicle:${v}`, true);
      set('fingerprint');
    });
    app.on('hotlist-hit', (e) => set(`hotlist:${e.read.vehicle}`, e.read));
    app.on('capture-viewed', (e) => set(`capture:${e.read.vehicle}`));
    app.on('frequent-locations', (e) => set(`frequent:${e.vehicle}`));
    app.on('owner-lookup', (e) => set(`owner:${e.vehicle}`));
    app.on('geofence', (e) => {
      for (const d of e.devices) this.flags.set(`geofenced:${d.person}`, d);
      set('geofence', e.devices.length);
    });
    app.on('device-context', (e) => set('device-look', e.person));
    app.on('unmask', (e) => {
      this.flags.set(`unmask:${e.person}`, true);
      set('device-look', e.person);
    });
    app.on('stingray-start', (e) => set('stingray-on', e));
    app.on('stingray-capture', (e) => {
      const seen = (this.flags.get('stingray-seen') as Set<number> | undefined) ?? new Set<number>();
      for (const x of e.captures) seen.add(x.person);
      this.flags.set('stingray-seen', seen);
    });
    app.on('stingray-target', (e) => set(`stingray-target:${e.person}`));
    app.on('face-search', (e) => {
      const top = e.candidates[0];
      if (top) this.flags.set('face-top', top);
      set('face-search', e.edited ?? 'plain');
    });
    app.on('alibi-check', (e) => set(`alibi:${e.person}`));
    app.on('sound-triage', (e) => {
      this.flags.set(`triage:${e.event.id}`, e.action);
      const list = (this.flags.get('triaged') as { kind: string; action: string; id: string }[] | undefined) ?? [];
      list.push({ kind: e.event.kind, action: e.action, id: e.event.id });
      set('triaged', list);
    });
    app.on('social-scan', (e) => set('social-scan', e.flagged));
    app.on('watchlist', (e) => set('watchlist', e.people.length));
    app.on('forecast-run', (e) => {
      this.flags.set('forecast-days', Math.max(e.days, (this.flags.get('forecast-days') as number) ?? 0));
      if (e.revealed) this.flags.set('forecast-revealed', true);
      set('forecast-reported-only', e.reportedOnly);
    });
    app.on('dossier-open', (e) => set(`dossier:${e.person}`));
    app.on('tick', () => this.checkAuto());
  }

  start(): void {
    this.next();
  }

  private next(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.index++;
    const def = this.cases[this.index];
    if (!def) {
      this.finish();
      return;
    }
    this.current = def;
    this.thread = [];
    this.collapsed = false;
    this.records.push({ id: def.id, title: def.title, choices: [], harms: [], real: def.real, sources: def.lesson.sources });
    const t = at(TODAY, def.at[0], def.at[1]);
    if (t > this.app.now + 1) {
      this.c.jumpTo(t);
      this.c.toast(`${fmtTime(t)} · new case from ${def.from}`, 'info', [], 3500);
    }
    this.app.speed = def.speed ?? 6;
    this.c.setSpeed(this.app.speed);
    this.c.open(def.tool, def.toolArgs?.(this.ctx));
    this.c.pulseTool(def.tool);
    if (this.app.soundOn) blip('case');
    const stop = def.start?.(this.ctx);
    if (stop) this.cleanup = stop;
    this.enter(def.steps[0] as Step);
  }

  private enter(step: Step): void {
    this.step = step;
    if (step.text) this.thread.push({ kind: 'msg', from: step.from ?? this.current?.from ?? '', time: this.app.now, body: h('div', { class: 'msg-body' }, render(step.text(this.ctx))) });
    this.draw();
    this.checkAuto();
  }

  private checkAuto(): void {
    const step = this.step;
    if (!step?.auto || !this.current) return;
    if (step.auto.when(this.ctx)) {
      const next = this.current.steps.find((s) => s.id === step.auto?.next);
      if (next) this.enter(next);
    }
  }

  private choose(choice: Choice): void {
    const def = this.current;
    const step = this.step;
    if (!def || !step) return;
    const rec = this.records[this.records.length - 1] as CaseRecord;
    rec.choices.push({ step: step.id, label: choice.label, id: choice.id });
    this.flags.set(`choice:${def.id}:${step.id}`, choice.id);
    this.thread.push({ kind: 'you', text: choice.label });
    choice.run?.(this.ctx);
    if (choice.outcome) this.thread.push({ kind: 'outcome', body: h('div', { class: 'outcome' }, render(choice.outcome(this.ctx))) });
    const next = choice.next ? def.steps.find((s) => s.id === choice.next) : undefined;
    if (next) {
      this.enter(next);
    } else {
      this.step = null;
      this.c.pulseTool(null);
      this.draw();
    }
  }

  /** Re-draws only the live part of the card when flags change. */
  private refresh(): void {
    if (this.stepHost && this.step) {
      clear(this.stepHost);
      this.stepHost.append(this.stepControls(this.step));
    }
    this.checkAuto();
  }

  private draw(): void {
    const host = this.c.caseHost;
    clear(host);
    const def = this.current;
    if (!def) return;
    const body = h('div', { class: 'case-body' });
    const head = h(
      'button',
      { class: 'case-head', type: 'button', 'aria-expanded': String(!this.collapsed), onclick: () => { this.collapsed = !this.collapsed; this.draw(); } },
      h('span', { class: 'case-kicker' }, `Case ${this.index + 1} of ${this.cases.length} · ${fmtTime(at(TODAY, def.at[0], def.at[1]))}`),
      h('span', { class: 'case-title' }, def.title),
      h('span', { class: 'case-toggle', 'aria-hidden': 'true' }, this.collapsed ? '▾' : '▴'),
    );
    host.append(h('section', { class: `case${this.collapsed ? ' collapsed' : ''}`, 'aria-label': `Case: ${def.title}` }, head, body));
    if (this.collapsed) {
      if (this.step) body.append(h('p', { class: 'case-mini' }, this.step.prompt ?? this.step.objectives?.find((o) => !o.done(this.ctx))?.text ?? 'Decide.'));
      return;
    }
    let newest: Element | null = null;
    let lastChoice: Element | null = null;
    for (const e of this.thread) {
      if (e.kind === 'msg') newest = h('div', { class: 'msg' }, h('div', { class: 'msg-from' }, h('strong', null, e.from), h('span', { class: 'mono muted' }, fmtTime(e.time))), e.body);
      else if (e.kind === 'you') newest = lastChoice = h('div', { class: 'msg msg-you' }, h('div', { class: 'msg-from' }, h('strong', null, 'You')), h('p', null, e.text));
      else newest = e.body as Element;
      body.append(newest);
    }
    if (this.step) {
      this.stepHost = h('div', { class: 'step' });
      this.stepHost.append(this.stepControls(this.step));
      body.append(this.stepHost);
    } else {
      // The case is over: show the choice and what came of it; the lesson follows below.
      this.stepHost = null;
      body.append(this.lesson(def));
      newest = lastChoice ?? newest;
    }
    // Bring the newest message into view: the case card scrolls on desktop, the whole panel on phones.
    if (newest && this.thread.length > 1) newest.scrollIntoView({ block: 'start' });
    else host.scrollTop = 0;
  }

  private stepControls(step: Step): Node {
    const frag = document.createDocumentFragment();
    const objectives = step.objectives ?? [];
    const allDone = objectives.every((o) => o.done(this.ctx));
    if (objectives.length) {
      frag.append(
        h(
          'ul',
          { class: 'objectives' },
          ...objectives.map((o) => {
            const done = o.done(this.ctx);
            return h('li', { class: done ? 'done' : '' }, h('span', { class: 'obj-box', 'aria-hidden': 'true' }, done ? svgIcon('check', 12) : ''), h('span', null, o.text), h('span', { class: 'visually-hidden' }, done ? ' (done)' : ' (to do)'));
          }),
        ),
      );
    }
    if (step.prompt) frag.append(h('p', { class: 'prompt' }, step.prompt));
    const visible = step.choices;
    if (visible.length === 0 && allDone && step.waiting) frag.append(h('p', { class: 'waiting' }, step.waiting));
    if (visible.length) {
      frag.append(
        h(
          'div',
          { class: 'choices' },
          ...visible.map((choice) => {
            const ok = choice.enabled ? choice.enabled(this.ctx) : allDone;
            return h('button', { class: `btn btn-small choice ${choice.tone ? `btn-${choice.tone}` : ''}`, type: 'button', disabled: !ok, onclick: () => this.choose(choice) }, choice.label);
          }),
        ),
      );
    }
    return frag;
  }

  private lesson(def: CaseDef): HTMLElement {
    const isLast = this.index === this.cases.length - 1;
    return h(
      'div',
      { class: 'lesson' },
      h('div', { class: 'lesson-kicker' }, 'This is real'),
      h('h3', null, def.lesson.title),
      h('div', { class: 'lesson-body' }, render(def.lesson.body(this.ctx))),
      def.lesson.science
        ? h('div', { class: 'science' }, h('div', { class: 'lesson-kicker' }, 'The data science'), h('h4', null, def.lesson.science.title), render(def.lesson.science.body(this.ctx)))
        : null,
      h('ol', { class: 'cites' }, ...def.lesson.sources.map((id) => sourceItem(id))),
      h('button', { class: 'btn btn-primary next-case', type: 'button', onclick: () => this.next() }, isLast ? 'End the shift' : 'Next case →'),
    );
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.cleanup?.();
    clear(this.c.caseHost);
    this.onDone?.();
  }

  /** Ends the shift early (the End shift button). */
  end(): void {
    this.finish();
  }

  get caseCount(): number {
    return this.cases.length;
  }

  get reached(): number {
    return this.index + 1;
  }
}

export function sourceItem(id: SourceId): HTMLElement {
  const s = SOURCES[id];
  return h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title), h('span', { class: 'muted' }, ` ${s.publisher}, ${s.date}.`));
}
