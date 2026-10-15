/**
 * Ways to reach the people who answer for a camera, shared by the camera card
 * and the route summary. Every link that reaches a person or an office carries
 * `data-contact` with the level of government, so the live site can count how
 * often someone taps one (the kind of link and the level, never who or where).
 */

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

/** "City council" → "city council", but "D.C. Council" stays as it is. */
export function lowerFirst(s: string): string {
  return /^[A-Z]\./.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
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
