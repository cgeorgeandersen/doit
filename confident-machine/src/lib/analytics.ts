/**
 * Anonymous visit counting with Vercel Web Analytics.
 *
 * It records page views only: the page address, referrer, rough location and
 * browser/device type, with no third-party cookies. It never receives anything
 * the reader types or chooses; the case file stays in this browser (see the
 * colophon).
 *
 * Only production builds load it. On Vercel the script is served from the
 * site's own domain; on any other host the request fails quietly and nothing
 * is counted. The two VITE_VERCEL_OBSERVABILITY_* values are set by Vercel at
 * build time, as the package's own Vite-based adapters expect.
 */
import { inject, type BeforeSendEvent } from '@vercel/analytics';

let lastUrl: string | null = null;

/**
 * Drop the #fragment, and skip page views that are only jumps within this
 * page (chapter links, footnotes), so each visit counts once.
 */
export function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  url.hash = '';
  const clean = url.toString();
  if (event.type === 'pageview') {
    if (clean === lastUrl) return null;
    lastUrl = clean;
  }
  return { ...event, url: clean };
}

export function startAnalytics(): void {
  if (!import.meta.env.PROD) return;
  inject(
    { beforeSend, basePath: import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH },
    import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG,
  );
}
