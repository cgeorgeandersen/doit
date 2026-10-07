/*
 * Sign-in with Amazon Cognito's hosted pages, using the authorization code flow
 * with PKCE: the browser proves it started the sign-in by keeping a random
 * secret (the verifier) that only its hash (the challenge) ever leaves with.
 * No client secret is involved, because a web page can't keep one.
 */

export interface CloudConfig {
  region: string;
  apiUrl: string;
  authDomain: string;
  clientId: string;
}

interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface Account {
  email: string;
  signOut(): void;
}

const SESSION_KEY = 'utmdm:session';
const PENDING_KEY = 'utmdm:signin';

/** The deployed site's settings, written next to index.html at deploy time. Null when running without AWS. */
export async function loadConfig(): Promise<CloudConfig | null> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const config = (await response.json()) as Partial<CloudConfig>;
    return config.apiUrl && config.authDomain && config.clientId && config.region ? (config as CloudConfig) : null;
  } catch {
    return null;
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));

function claims(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

function read<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

export function createAuth(config: CloudConfig) {
  const redirectUri = `${location.origin}/`;

  async function tokens(body: Record<string, string>): Promise<Session> {
    const response = await fetch(`${config.authDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...body }),
    });
    if (!response.ok) throw new Error(`Sign-in failed (${response.status}).`);
    const t = (await response.json()) as { id_token: string; access_token: string; refresh_token?: string; expires_in: number };
    return {
      idToken: t.id_token,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? body.refresh_token ?? '',
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  }

  function keep(session: Session | null): void {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  return {
    /** Off to Cognito's sign-in (or sign-up) page; it comes back to this page with a one-time code. */
    async signIn(page: 'login' | 'signup' = 'login'): Promise<void> {
      const verifier = random(48);
      const state = random(16);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state,
        code_challenge_method: 'S256',
        code_challenge: base64url(digest),
      });
      location.assign(`${config.authDomain}/${page}?${query}`);
    },

    /** Finishes a sign-in when Cognito sends the browser back with ?code=…&state=…. */
    async handleRedirect(): Promise<void> {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      if (!code && !params.get('error')) return;
      const pending = read<{ verifier: string; state: string }>(sessionStorage, PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      history.replaceState(null, '', `/${location.hash}`);
      if (params.get('error')) throw new Error(params.get('error_description') ?? 'Sign-in was cancelled.');
      if (!pending || pending.state !== params.get('state')) throw new Error('That sign-in link expired. Please sign in again.');
      keep(await tokens({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri, code_verifier: pending.verifier }));
    },

    /** A valid access token, refreshed when it's about to expire, or null when signed out. */
    async accessToken(): Promise<string | null> {
      const session = read<Session>(localStorage, SESSION_KEY);
      if (!session) return null;
      if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
      try {
        const fresh = await tokens({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
        keep(fresh);
        return fresh.accessToken;
      } catch {
        keep(null);
        return null;
      }
    },

    account(): Account | null {
      const session = read<Session>(localStorage, SESSION_KEY);
      if (!session) return null;
      return {
        email: String(claims(session.idToken).email ?? 'you'),
        signOut: () => {
          keep(null);
          const query = new URLSearchParams({ client_id: config.clientId, logout_uri: redirectUri });
          location.assign(`${config.authDomain}/logout?${query}`);
        },
      };
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
