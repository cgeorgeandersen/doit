/*
 * Sign-in with Amazon Cognito, from TagFluent's own pages. The browser calls
 * Cognito's user pool API directly (over HTTPS, to Cognito only): sign in with
 * email and password, sign up, confirm the emailed code, and reset a password.
 * There is no client secret, because a web page can't keep one; the user pool
 * client is a public one.
 */

export interface CloudConfig {
  region: string;
  apiUrl: string;
  clientId: string;
  /** The hosted sign-in domain. No longer used by the app; kept so older config files still load. */
  authDomain?: string;
  googleClientId?: string;
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

/** A Cognito answer turned into a sentence a person can act on. `code` is Cognito's error name. */
export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const SESSION_KEY = 'utmdm:session';

/**
 * An email as Cognito should see it. The user pool compares sign-in names
 * case-sensitively (a setting fixed when the pool was made), so every address
 * is sent in lower case: Dana@Example.com and dana@example.com are one account.
 */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** The deployed site's settings, written next to index.html at deploy time. Null when running without AWS. */
export async function loadConfig(): Promise<CloudConfig | null> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const config = (await response.json()) as Partial<CloudConfig>;
    return config.apiUrl && config.clientId && config.region ? (config as CloudConfig) : null;
  } catch {
    return null;
  }
}

function claims(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

export const PASSWORD_RULE = 'At least 10 characters, with an uppercase letter, a lowercase letter and a number.';

/** What to tell someone for each Cognito error. */
export function authMessage(code: string, fallback = ''): string {
  switch (code) {
    case 'NotAuthorizedException':
      return /attempts exceeded/i.test(fallback)
        ? 'Too many tries. Wait a few minutes, then try again.'
        : "That email and password don't match. Try again, or reset your password.";
    case 'UserDisabled':
      return "Your account is waiting for approval. We'll email you as soon as it's ready.";
    case 'UserNotFoundException':
      return "That email and password don't match. Try again, or reset your password.";
    case 'UsernameExistsException':
      return 'There is already an account with that email. Sign in instead.';
    case 'InvalidPasswordException':
      return `That password is too weak. ${PASSWORD_RULE}`;
    case 'CodeMismatchException':
      return "That code isn't right. Check the latest email from us and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired. Send a new one.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many tries. Wait a few minutes, then try again.';
    case 'CodeDeliveryFailureException':
      return "We couldn't send the email. Check the address and try again.";
    case 'NetworkError':
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    default:
      return fallback || 'Something went wrong. Please try again.';
  }
}

interface AuthResult {
  AuthenticationResult?: { AccessToken: string; IdToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
}

export function createAuth(config: CloudConfig, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  const endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`;

  async function cognito<T>(action: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${action}` },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError('NetworkError', authMessage('NetworkError'));
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = String(data.message ?? '');
      let code = String(data.__type ?? 'Error').split('#').pop()!;
      // A disabled account is one still waiting for the owner's approval.
      if (code === 'NotAuthorizedException' && /disabled/i.test(message)) code = 'UserDisabled';
      throw new AuthError(code, authMessage(code, message));
    }
    return data as T;
  }

  function keep(session: Session | null): void {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // storage blocked: the session lasts as long as the page
    }
  }

  return {
    /** Signs in with email and password and keeps the session in this browser. */
    async signIn(email: string, password: string): Promise<void> {
      const result = await cognito<AuthResult>('InitiateAuth', {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: { USERNAME: emailKey(email), PASSWORD: password },
      });
      const t = result.AuthenticationResult;
      if (!t) throw new AuthError(result.ChallengeName ?? 'Challenge', "This account needs a step this page can't do yet. Contact us and we'll sort it out.");
      keep({ idToken: t.IdToken, accessToken: t.AccessToken, refreshToken: t.RefreshToken ?? '', expiresAt: Date.now() + t.ExpiresIn * 1000 });
    },

    /** Creates an account; Cognito emails a code to confirm the address. */
    async signUp(email: string, password: string): Promise<void> {
      await cognito('SignUp', {
        ClientId: config.clientId,
        Username: emailKey(email),
        Password: password,
        UserAttributes: [{ Name: 'email', Value: emailKey(email) }],
      });
    },

    async confirmSignUp(email: string, code: string): Promise<void> {
      await cognito('ConfirmSignUp', { ClientId: config.clientId, Username: emailKey(email), ConfirmationCode: code.trim() });
    },

    async resendCode(email: string): Promise<void> {
      await cognito('ResendConfirmationCode', { ClientId: config.clientId, Username: emailKey(email) });
    },

    async forgotPassword(email: string): Promise<void> {
      await cognito('ForgotPassword', { ClientId: config.clientId, Username: emailKey(email) });
    },

    async resetPassword(email: string, code: string, password: string): Promise<void> {
      await cognito('ConfirmForgotPassword', { ClientId: config.clientId, Username: emailKey(email), ConfirmationCode: code.trim(), Password: password });
    },

    /** A valid access token, refreshed when it's about to expire, or null when signed out. */
    async accessToken(): Promise<string | null> {
      const session = read<Session>(SESSION_KEY);
      if (!session) return null;
      if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
      try {
        const result = await cognito<AuthResult>('InitiateAuth', {
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: config.clientId,
          AuthParameters: { REFRESH_TOKEN: session.refreshToken },
        });
        const t = result.AuthenticationResult!;
        const fresh = { idToken: t.IdToken, accessToken: t.AccessToken, refreshToken: t.RefreshToken ?? session.refreshToken, expiresAt: Date.now() + t.ExpiresIn * 1000 };
        keep(fresh);
        return fresh.accessToken;
      } catch {
        keep(null);
        return null;
      }
    },

    account(): Account | null {
      const session = read<Session>(SESSION_KEY);
      if (!session) return null;
      return {
        email: String(claims(session.idToken).email ?? 'you'),
        signOut: () => {
          keep(null);
          // Revoke the refresh token so it can't be used again, then back to the home page.
          void cognito('RevokeToken', { ClientId: config.clientId, Token: session.refreshToken })
            .catch(() => undefined)
            .finally(() => location.assign('/'));
        },
      };
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
