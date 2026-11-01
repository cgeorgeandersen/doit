/**
 * Everything behind POST /api/estimate: check the job ticket, then email it to
 * the business through Resend (https://resend.com). api/estimate.ts is a thin
 * wrapper around handleEstimate, so this file can be tested without a server.
 *
 * Settings come from the environment (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY  the Resend API key
 *   ESTIMATE_TO     where tickets go, e.g. the owner's email
 *   ESTIMATE_FROM   optional sender; defaults to Resend's test sender, which
 *                   can only send to the email the Resend account signed up with
 *
 * Server-side relative imports end in .js so Vercel's Node runtime finds them.
 */
import { SERVICES } from '../content/services.js';

export interface EstimateEnv {
  RESEND_API_KEY?: string | undefined;
  ESTIMATE_TO?: string | undefined;
  ESTIMATE_FROM?: string | undefined;
}

export type Contact = 'call' | 'text' | 'email';

export interface Estimate {
  name: string;
  /** Formatted as (770) 555-0142. */
  phone: string;
  email: string;
  address: string;
  town: string;
  /** Service slugs, in the order they appear on the site. */
  services: string[];
  details: string;
  contact: Contact;
}

export type Parsed =
  | { ok: true; estimate: Estimate; spam: boolean }
  | { ok: false; field: string; message: string };

export const MAX_BODY_BYTES = 16_000;
const DEFAULT_FROM = 'Cherokee Small Jobs <onboarding@resend.dev>';
const CONTACTS: readonly Contact[] = ['call', 'text', 'email'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A one-line text field: whitespace collapsed, or null when it isn't a string or is too long. */
function line(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v.length > max ? null : v;
}

/** Ten US digits as (xxx) xxx-xxxx, accepting a leading 1 and any punctuation; null otherwise. */
export function formatPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[2-9]/.test(digits)) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function parseEstimate(body: unknown): Parsed {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Something went wrong sending your ticket. Please try again.' };
  }
  const b = body as Record<string, unknown>;

  const name = line(b['name'], 100);
  if (!name) return { ok: false, field: 'name', message: 'Please add your name.' };

  const rawPhone = line(b['phone'], 30);
  const phone = rawPhone ? formatPhone(rawPhone) : null;
  if (!phone) return { ok: false, field: 'phone', message: 'Please add a 10-digit phone number we can reach you on.' };

  const contact = b['contact'] === undefined ? 'call' : b['contact'];
  if (typeof contact !== 'string' || !CONTACTS.includes(contact as Contact)) {
    return { ok: false, field: 'contact', message: 'Please choose how you’d like us to reach you.' };
  }

  const email = line(b['email'], 200);
  if (email === null || (email && !EMAIL_RE.test(email))) {
    return { ok: false, field: 'email', message: 'That email address doesn’t look right.' };
  }
  if (contact === 'email' && !email) {
    return { ok: false, field: 'email', message: 'Please add your email, since that’s how you’d like us to reach you.' };
  }

  const address = line(b['address'], 200);
  if (address === null) return { ok: false, field: 'address', message: 'Please shorten the address.' };

  const town = line(b['town'], 80);
  if (!town) return { ok: false, field: 'town', message: 'Please choose your town.' };

  const rawServices = b['services'] ?? [];
  if (!Array.isArray(rawServices) || rawServices.length > SERVICES.length || rawServices.some((s) => typeof s !== 'string')) {
    return { ok: false, field: 'services', message: 'Please tick the types of work again.' };
  }
  const picked = new Set(rawServices as string[]);
  const services = SERVICES.filter((s) => picked.has(s.slug)).map((s) => s.slug);
  if (services.length !== picked.size) {
    return { ok: false, field: 'services', message: 'Please tick the types of work again.' };
  }

  const rawDetails = b['details'] ?? '';
  if (typeof rawDetails !== 'string') return { ok: false, field: 'details', message: 'Please describe the job again.' };
  const details = rawDetails.replace(/\r\n?/g, '\n').trim();
  if (details.length > 4000) return { ok: false, field: 'details', message: 'Please keep the description under 4,000 characters.' };

  if (services.length === 0 && !details) {
    return { ok: false, field: 'details', message: 'Tick a type of work or describe the job, so we know what you need.' };
  }

  // The form has a hidden "company" field people never see. Bots fill it in.
  const spam = typeof b['company'] === 'string' && b['company'].trim() !== '';

  return { ok: true, spam, estimate: { name, phone, email, address, town, services, details, contact: contact as Contact } };
}

const CONTACT_LABEL: Record<Contact, string> = { call: 'Call', text: 'Text', email: 'Email' };

export function formatEmail(e: Estimate): { subject: string; text: string } {
  const work = e.services.map((slug) => SERVICES.find((s) => s.slug === slug)?.name ?? slug);
  const subject = `Job ticket: ${e.name}, ${e.town}`.replace(/[\r\n]+/g, ' ');
  const text = [
    'New job ticket from the website.',
    '',
    `Name: ${e.name}`,
    `Phone: ${e.phone}`,
    `Email: ${e.email || '(none given)'}`,
    `Best way to reach: ${CONTACT_LABEL[e.contact]}`,
    `Address: ${e.address || '(none given)'}`,
    `Town: ${e.town}`,
    '',
    `Type of work: ${work.length ? work.join(', ') : '(none ticked)'}`,
    '',
    'What needs doing:',
    e.details || '(no description)',
  ].join('\n');
  return { subject, text };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function handleEstimate(request: Request, env: EstimateEnv, send: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    return json(415, { error: 'unsupported_media_type' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large', message: 'Your ticket is too long. Please shorten the description.' });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'bad_json', message: 'Something went wrong sending your ticket. Please try again.' });
  }

  const parsed = parseEstimate(body);
  if (!parsed.ok) return json(400, { error: 'invalid', field: parsed.field, message: parsed.message });
  // Tell bots it worked, and send nothing.
  if (parsed.spam) return json(200, { ok: true });

  if (!env.RESEND_API_KEY || !env.ESTIMATE_TO) return json(503, { error: 'not_configured' });

  const { subject, text } = formatEmail(parsed.estimate);
  const payload: Record<string, unknown> = {
    from: env.ESTIMATE_FROM || DEFAULT_FROM,
    to: env.ESTIMATE_TO.split(',').map((s) => s.trim()).filter(Boolean),
    subject,
    text,
  };
  if (parsed.estimate.email) payload['reply_to'] = parsed.estimate.email;

  try {
    const res = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('estimate: Resend returned', res.status, await res.text().catch(() => ''));
      return json(502, { error: 'send_failed' });
    }
  } catch (err) {
    console.error('estimate: could not reach Resend', err);
    return json(502, { error: 'send_failed' });
  }
  return json(200, { ok: true });
}
