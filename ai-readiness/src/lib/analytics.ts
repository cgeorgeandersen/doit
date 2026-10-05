/**
 * Anonymous visit counting with Vercel Web Analytics, the only analytics on
 * the page (no cookies). It records page views: the page's address, the
 * referring site, a rough location and the browser and device type.
 *
 * Answers live after the "#" in a result's address, so every report goes
 * through pageAddress() first: the path plus any campaign tags, nothing
 * else. The intro and the questions count as one view of "/", and a finished
 * assessment as one view of "/results", so the dashboard shows how many
 * people finish.
 *
 * Only production builds made on Vercel load it: the script is served from
 * the site's own domain there, and nowhere else.
 */
import { inject, type BeforeSendEvent } from '@vercel/analytics';

// Tags people put on links they share (?utm_source=linkedin, ?ref=…). Every
// other query parameter is dropped, such as click IDs social sites add.
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
 * Cleans every event's address, and skips a page view whose cleaned address
 * matches the one before it (moving between questions), so each screen type
 * counts once per visit.
 */
export function createBeforeSend(): (event: BeforeSendEvent) => BeforeSendEvent | null {
  let last: string | null = null;
  return (event) => {
    const url = pageAddress(event.url);
    if (event.type === 'pageview') {
      if (url === last) return null;
      last = url;
    }
    return { ...event, url };
  };
}

export function startAnalytics(): void {
  if (!import.meta.env.PROD || !__ON_VERCEL__) return;
  inject(
    { beforeSend: createBeforeSend(), basePath: import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH },
    import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG,
  );
}
