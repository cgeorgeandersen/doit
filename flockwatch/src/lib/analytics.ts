/**
 * Visit counting (Vercel Web Analytics). Vercel's script reports the page's
 * full address, and a shared link (or the address bar once someone copies
 * one) ends in #from=…&to=…, the start and end of someone's drive, or in
 * #town=…. Every
 * report goes through pageAddress() first, so it carries the page's path and
 * nothing a visitor typed or chose.
 */

// Campaign tags that people put on links they share (?utm_source=…, ?ref=…).
// Every other query parameter is dropped, such as the click IDs that some
// social sites add to outgoing links.
const KEPT_PARAMS = /^(?:utm_(?:source|medium|campaign|term|content)|ref)$/;

export function pageAddress(href: string): string {
  const url = new URL(href);
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEPT_PARAMS.test(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return url.origin + url.pathname + (query ? `?${query}` : '');
}

/**
 * Taps on a link that reaches an official are counted too, as the kind of
 * link and the level of government (local, state or federal): never which
 * official, which camera or where.
 */
export type ContactKind = 'email' | 'phone' | 'web';

export function contactKind(href: string): ContactKind {
  if (/^mailto:/i.test(href)) return 'email';
  if (/^tel:/i.test(href)) return 'phone';
  return 'web';
}
