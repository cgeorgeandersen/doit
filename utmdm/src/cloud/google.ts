/*
 * Read-only access to someone's Google Analytics, from the browser. A pop-up
 * asks Google for the analytics.readonly scope; Google sends the pop-up back to
 * ga4-callback.html with an access token, which hands it to this page and
 * closes. The token lives only in this tab's memory, for about an hour, and
 * never reaches the TagFluent servers.
 */

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const CHANNEL = 'utmdm-google';

interface GoogleToken {
  accessToken: string;
  expiresAt: number;
}

let held: GoogleToken | null = null;

/** The token from the last connect, while it's still good. */
export function googleToken(): string | null {
  return held && held.expiresAt - Date.now() > 60_000 ? held.accessToken : null;
}

export function forgetGoogle(): void {
  held = null;
}

/** Opens Google's consent pop-up and resolves with an access token, or rejects if it's closed or refused. */
export function connectGoogle(clientId: string): Promise<string> {
  const state = crypto.randomUUID();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${location.origin}/ga4-callback.html`,
    response_type: 'token',
    scope: GA4_SCOPE,
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  });
  const popup = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${query}`, 'utmdm-google', 'popup,width=520,height=680');
  if (!popup) return Promise.reject(new Error('Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.'));

  // Google's pages can cut the pop-up's link back to this window, so the answer
  // comes over a channel any page on this site can use; the state proves it's ours.
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL);
    const timer = setTimeout(() => done(() => reject(new Error('Google didn\'t answer in time. Try again.'))), 5 * 60_000);
    function done(fn: () => void) {
      clearTimeout(timer);
      channel.close();
      fn();
    }
    channel.onmessage = (event: MessageEvent) => {
      const p = (event.data as { params?: Record<string, string> })?.params;
      if (!p || p.state !== state) return;
      if (p.error) return done(() => reject(new Error(p.error === 'access_denied' ? 'Google access wasn\'t granted.' : `Google said: ${p.error}`)));
      if (!(p.scope ?? '').includes(GA4_SCOPE)) return done(() => reject(new Error('Google Analytics access wasn\'t granted. Tick the Analytics box and try again.')));
      held = { accessToken: p.access_token!, expiresAt: Date.now() + Number(p.expires_in ?? 3600) * 1000 };
      done(() => resolve(p.access_token!));
    };
  });
}
