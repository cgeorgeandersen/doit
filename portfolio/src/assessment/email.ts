/**
 * The assessment's optional "Email me this result" form talks to an adapter,
 * never to a service directly, so the service can change without touching the
 * page. The form shows only when the adapter says it's ready.
 *
 * THE LINE TO CHANGE is `emailAdapter`, at the bottom. Right now it's the stub:
 * it sends nothing, so the form appears only in `npm run dev` (to try it) and
 * never on the published site. HOW-TO-ADD-CONTENT.md ("Turn on the email form")
 * explains how to connect a real service.
 */
import type { Mode } from './model.ts';

/** What the page hands the adapter when someone asks for their result by email. */
export interface EmailRequest {
  email: string;
  /** True only if they ticked "also send me occasional notes" (never ticked for them). */
  wantsNotes: boolean;
  /** The link to their result; the answers are in it, after the #. */
  resultUrl: string;
  /** A plain summary for the email itself. */
  summary: {
    mode: Mode;
    stage: string;
    points: number;
    max: number;
    /** The gaps' dimension names, biggest first. */
    gaps: string[];
    /** The day it was taken, "2026-10-05". */
    date: string | null;
  };
}

export type EmailOutcome = { ok: true } | { ok: false; error: string };

export interface EmailAdapter {
  /** False keeps the form off the page, so it never promises an email it can't send. */
  readonly ready: boolean;
  send(request: EmailRequest): Promise<EmailOutcome>;
}

/**
 * Sends nothing. Ready in `npm run dev` (it logs what it would send and reports
 * success, so the form can be tried), never in a published build.
 */
export function stubAdapter(ready: boolean = Boolean(import.meta.env?.DEV)): EmailAdapter {
  return {
    ready,
    async send(request) {
      console.info('[email stub] Nothing was sent. With a real adapter, this would go out:', request);
      return { ok: true };
    },
  };
}

/**
 * Posts the request as JSON to an address you control: a Vercel Function
 * (such as /api/email-result) or a Zapier, Make or n8n webhook.
 */
export function postJsonAdapter(endpoint: string, fetcher: typeof fetch = (...args) => fetch(...args)): EmailAdapter {
  return {
    ready: true,
    async send(request) {
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        return response.ok ? { ok: true } : { ok: false, error: `The email service answered ${response.status}` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** A light check before sending; the service makes the real one. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** THE LINE TO CHANGE. For example: export const emailAdapter = postJsonAdapter('/api/email-result'); */
export const emailAdapter: EmailAdapter = stubAdapter();
