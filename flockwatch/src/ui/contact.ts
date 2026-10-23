/**
 * Ways to reach the people who answer for a camera, shared by the camera card
 * and the route summary. Every link that reaches a person or an office carries
 * `data-contact` with the level of government, so the live site can count how
 * often someone taps one (the kind of link and the level, never who or where).
 */

import { draft, mailtoHref, recipients, sourceHost, unreached, type About, type CountyBoard } from '../lib/boards';
import type { Official } from '../lib/officials';
import { h } from './dom';

export type Level = 'local' | 'state' | 'federal';

/** Where the cards send people when a city or county has no website on record. */
const FIND_LOCAL = 'https://www.usa.gov/local-governments';

export function levelOf(p: Official): Level {
  if (p.source === 'congress-legislators') return 'federal';
  if (p.source === 'Open States') return 'state';
  return 'local';
}

/** Words that start a generic name for a governing body, rather than a proper one. */
const GENERIC = /^(city|town|village|borough|township|county|local|board|mayor|sole)\b/i;

/** "City council" → "city council" and "Board of Commissioners" → "board of commissioners", but "D.C. Council" and "Augusta Commission" stay as they are. */
export function lowerFirst(s: string): string {
  return GENERIC.test(s) ? s.toLowerCase() : s;
}

/** Email, phone and web links for one official, as small buttons. */
export function contactButtons(p: Official): HTMLElement | null {
  const level = levelOf(p);
  const links: HTMLElement[] = [];
  if (p.email) {
    links.push(h('a', { class: 'contact-btn', href: `mailto:${p.email}`, 'data-contact': level, 'aria-label': `Email ${p.name}` }, 'Email'));
  }
  if (p.phone) {
    links.push(
      h(
        'a',
        { class: 'contact-btn', href: `tel:${p.phone.replace(/[^\d+]/g, '')}`, 'data-contact': level, 'aria-label': `Call ${p.name} at ${p.phone}` },
        p.phone,
      ),
    );
  }
  if (p.url) {
    // Congress's links are contact forms; the others are profiles to check a name against.
    const reaches = p.source === 'congress-legislators';
    links.push(
      h(
        'a',
        { class: reaches ? 'contact-btn' : 'contact-link', href: p.url, target: '_blank', rel: 'noopener', 'data-contact': reaches ? level : null },
        reaches ? 'Contact' : p.source === 'Wikidata' ? 'Check on Wikidata' : 'Profile',
      ),
    );
  }
  return links.length ? h('span', { class: 'contact-row' }, links) : null;
}

/** The button for a city, town or county: its website, where the council's own contacts are. */
export function bodyButton(body: string, website: string | undefined, style: 'primary' | 'small'): HTMLElement {
  const cls = style === 'primary' ? 'button button-civic button-wide' : 'contact-btn';
  const name = lowerFirst(body);
  return website
    ? h('a', { class: cls, href: website, target: '_blank', rel: 'noopener', 'data-contact': 'local' }, style === 'primary' ? `Contact the ${name}` : 'Website')
    : h('a', { class: cls, href: FIND_LOCAL, target: '_blank', rel: 'noopener', 'data-contact': 'local' }, style === 'primary' ? `Find the ${name}` : 'Find it');
}

/** "Email all 5 commissioners", "Email the mayor and 9 commissioners", "Email 4 of the 5 commissioners". */
export function boardLabel(board: CountyBoard): string {
  const n = board.members.length;
  const reached = n - unreached(board).length;
  const noun = /council/i.test(board.body) ? 'council members' : 'commissioners';
  if (n === 1) return 'Email the commissioner';
  if (reached < n) return `Email ${reached} of the ${n} ${noun}`;
  const mayor = board.members.some((m) => /^mayor\b/i.test(m.seat));
  if (!mayor) return `Email all ${n} ${noun}`;
  return n === 2 ? `Email the mayor and the ${noun.replace(/s$/, '')}` : `Email the mayor and ${n - 1} ${noun}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * One button that opens an email to the whole board, every address on the To
 * line and a short draft filled in. Where the county publishes no addresses,
 * its phone number and its page instead.
 */
export function boardButton(board: CountyBoard, about: About, style: 'primary' | 'small'): HTMLElement {
  const cls = style === 'primary' ? 'button button-civic button-wide' : 'contact-btn';
  const to = recipients(board);
  const name = `${board.county} County ${board.body}`;
  if (to.length) {
    const missing = unreached(board).length;
    const short = missing ? `Email ${board.members.length - missing}` : `Email all ${board.members.length}`;
    return h(
      'a',
      { class: cls, href: mailtoHref(to, draft(board, about)), 'data-contact': 'local', 'aria-label': `${boardLabel(board)} of the ${name}` },
      style === 'primary' ? boardLabel(board) : short,
    );
  }
  if (board.phone) {
    return h('a', { class: cls, href: `tel:${board.phone.replace(/[^\d+]/g, '')}`, 'data-contact': 'local', 'aria-label': `Call the ${name}` }, style === 'primary' ? `Call the ${lowerFirst(board.body)}` : board.phone);
  }
  return h('a', { class: cls, href: board.source, target: '_blank', rel: 'noopener', 'data-contact': 'local' }, style === 'primary' ? `Contact the ${lowerFirst(board.body)}` : 'Website');
}

/** Who the button reaches, and where the addresses came from, so anyone can check them. */
export function boardDetails(board: CountyBoard): HTMLElement[] {
  const [y, m] = board.checked.split('-');
  const when = `${MONTHS[Number(m) - 1] ?? ''} ${y}`.trim();
  const emailed = recipients(board).length > 0;
  const missing = emailed ? unreached(board) : [];
  return [
    h('p', { class: 'board-names' }, board.members.map((p) => p.name).join(' · ')),
    h(
      'p',
      { class: 'note' },
      emailed ? 'Addresses from ' : 'From ',
      h('a', { href: board.source, target: '_blank', rel: 'noopener' }, sourceHost(board)),
      `, checked ${when}.`,
      missing.length ? ` No address is published for ${missing.map((p) => p.name).join(' or ')}.` : null,
      emailed ? ' The draft is yours to edit.' : ' The county doesn’t publish its commissioners’ email addresses.',
    ),
  ];
}
