/**
 * The shift report: what the analyst did, who it touched, what it caused,
 * the real cases behind it, and what actually limits these tools.
 */
import { ANALYST, type App } from '../ui/app-state';
import { clear, h, num, plural } from '../ui/dom';
import type { CaseRecord } from './engine';
import { sourceItem } from './engine';
import { SOURCES } from './sources';

export interface DebriefHandlers {
  again(): void;
  free(): void;
}

export function showDebrief(root: HTMLElement, app: App, records: CaseRecord[], total: number, handlers: DebriefHandlers): void {
  clear(root);
  window.scrollTo(0, 0);
  const mine = app.audit.byUser(ANALYST);
  const reasons = [...new Set(mine.map((e) => e.reason.toLowerCase()))];
  const harms = records.flatMap((r) => r.harms);
  const others = app.audit.entries.filter((e) => e.user !== ANALYST);
  const played = records.filter((r) => r.choices.length > 0);

  root.append(
    h(
      'main',
      { class: 'debrief' },
      h(
        'header',
        { class: 'debrief-head' },
        h('p', { class: 'title-kicker' }, 'Shift report · Friday, October 23 · Analyst #4471'),
        h('h1', null, played.length < total ? 'Shift ended early' : 'End of shift'),
        h('p', { class: 'debrief-lede' }, played.length === 0 ? 'You ended the shift before taking a case. The database kept recording anyway.' : `You worked ${plural(played.length, 'case')} of ${total}.`),
      ),
      h(
        'section',
        { class: 'big-stats' },
        big(num(app.audit.touched.size), 'people whose records you pulled'),
        big(num(mine.length), 'searches under your badge'),
        big(num(harms.length), harms.length === 1 ? 'person or family harmed' : 'people or families harmed'),
        big('0', 'searches reviewed by a supervisor'),
      ),
      reasons.length
        ? h('p', { class: 'reasons' }, 'Reasons you gave: ', ...reasons.slice(0, 12).map((r) => h('span', { class: 'reason-chip' }, `“${r}”`)), '. The system accepted every one.')
        : null,
      others.length ? h('p', { class: 'reasons' }, `Other users ran ${plural(others.length, 'search', 'searches')} you were asked to refuse: `, ...others.map((e) => h('span', { class: 'reason-chip' }, `${e.user}: ${e.query}, “${e.reason}”`))) : null,
      h(
        'section',
        { class: 'debrief-sec' },
        h('h2', null, 'What your shift caused'),
        harms.length
          ? h('ul', { class: 'harms' }, ...harms.map((x) => h('li', null, x)))
          : h('p', null, played.length ? 'You checked, refused or reported every time it mattered. Notice what still happened: every search you ran is stored, other officers ran what you wouldn’t, and the cameras kept reading every car that passed.' : 'Nothing, this time.'),
      ),
      h(
        'section',
        { class: 'debrief-sec' },
        h('h2', null, 'Case by case'),
        h(
          'ol',
          { class: 'case-list' },
          ...records.map((r) =>
            h(
              'li',
              null,
              h('h3', null, r.title),
              r.choices.length ? h('p', { class: 'small' }, 'You: ', r.choices.map((c) => c.label).join(' → ')) : h('p', { class: 'small muted' }, 'Not finished.'),
              h('p', { class: 'small real' }, h('strong', null, 'Real: '), r.real),
              h('details', null, h('summary', null, 'Sources'), h('ol', { class: 'cites' }, ...r.sources.map((id) => sourceItem(id)))),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'debrief-sec' },
        h('h2', null, 'What actually limits these tools'),
        h(
          'ul',
          { class: 'limits' },
          h('li', null, h('strong', null, 'Courts. '), 'In June 2026 the Supreme Court held that getting location history with a geofence warrant is a Fourth Amendment search. Whether a network of plate cameras adds up to one is still being argued.'),
          h('li', null, h('strong', null, 'City councils. '), 'Most of these tools arrive through contracts a council or county board approves, and can cancel. Some cities have passed laws requiring a public vote and a use policy before police acquire any surveillance technology (', h('a', { href: SOURCES.ccops.url, target: '_blank', rel: 'noopener' }, 'Community Control Over Police Surveillance'), ').'),
          h('li', null, h('strong', null, 'State laws. '), 'They set how long data is kept, who it can be shared with, and whether searches need a warrant.'),
          h('li', null, h('strong', null, 'Audits someone reads. '), 'Every search in this shift was logged with a reason. A log is only a safeguard if someone checks it, and if the public can see what it finds.'),
        ),
        h(
          'div',
          { class: 'next-steps' },
          h('a', { class: 'btn btn-primary', href: SOURCES.trackthepole.url, target: '_blank', rel: 'noopener' }, 'See the real plate cameras on your drive'),
          h('a', { class: 'btn', href: SOURCES.atlas.url, target: '_blank', rel: 'noopener' }, 'Look up what your local police use'),
        ),
      ),
      h(
        'section',
        { class: 'debrief-sec' },
        h('h2', null, 'The data science underneath'),
        h(
          'ul',
          { class: 'limits' },
          h('li', null, h('strong', null, 'Small error rates times huge volumes '), 'make rare mistakes routine: a plate reader that’s right 98% of the time still misreads thousands of plates a day across a network.'),
          h('li', null, h('strong', null, 'Location data is its own identifier. '), 'Four points in space and time single out 95% of people; where a phone sleeps is a home address.'),
          h('li', null, h('strong', null, 'Nearest-neighbor search always returns a neighbor. '), 'A face match score is similarity, not proof, and bigger galleries hold closer strangers.'),
          h('li', null, h('strong', null, 'Base rates beat accuracy. '), 'When real gunshots are rare among loud bangs, most alerts are false even from a good classifier.'),
          h('li', null, h('strong', null, 'A model trained on its own outputs confirms itself. '), 'Predictive policing learns where police looked, sends them back, and scores itself on what they found.'),
        ),
      ),
      h(
        'div',
        { class: 'debrief-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: handlers.again }, 'Work the shift again'),
        h('button', { class: 'btn', type: 'button', onclick: handlers.free }, 'Free play: every tool, no cases'),
      ),
      h(
        'footer',
        { class: 'debrief-foot' },
        h('p', null, 'Dragnet is a simulation. Port Avery, its people and its cases are invented; PANOPTIC is not a real product. The tools and the cited events are real. Dragnet is independent and not affiliated with any police department, vendor or government.'),
        h('p', null, 'A project by ', h('a', { href: 'https://www.georgeandersen.net', target: '_blank', rel: 'noopener' }, 'George Andersen'), '.'),
      ),
    ),
  );
}

function big(value: string, label: string): HTMLElement {
  return h('div', { class: 'big' }, h('strong', null, value), h('span', null, label));
}
