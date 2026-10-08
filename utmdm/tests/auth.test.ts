import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, authMessage, createAuth } from '../src/cloud/auth';

const config = { region: 'us-east-2', apiUrl: 'https://api.example', clientId: 'client-1' };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const idToken = `${b64({ alg: 'none' })}.${b64({ email: 'dana@example.com' })}.x`;

function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('sign-in through Cognito', () => {
  it('signs in with email and password and keeps the session', async () => {
    storage();
    const calls: { target: string; body: any }[] = [];
    const auth = createAuth(config, (async (_url: string, init: RequestInit) => {
      calls.push({ target: (init.headers as Record<string, string>)['x-amz-target']!, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ AuthenticationResult: { AccessToken: 'acc', IdToken: idToken, RefreshToken: 'ref', ExpiresIn: 3600 } }));
    }) as typeof fetch);
    await auth.signIn(' dana@example.com ', 'Password123');
    expect(calls[0]).toMatchObject({
      target: 'AWSCognitoIdentityProviderService.InitiateAuth',
      body: { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: 'client-1', AuthParameters: { USERNAME: 'dana@example.com' } },
    });
    expect(auth.account()?.email).toBe('dana@example.com');
    expect(await auth.accessToken()).toBe('acc');
  });

  it('turns Cognito errors into sentences, and keeps the error name', async () => {
    storage();
    const auth = createAuth(config, (async () => new Response(JSON.stringify({ __type: 'NotAuthorizedException', message: 'Incorrect username or password.' }), { status: 400 })) as typeof fetch);
    const error = await auth.signIn('dana@example.com', 'nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('NotAuthorizedException');
    expect((error as AuthError).message).toMatch(/don't match/);
    expect(authMessage('NotAuthorizedException', 'Password attempts exceeded')).toMatch(/Too many tries/);
  });

  it('reads a disabled account as one waiting for approval', async () => {
    storage();
    const auth = createAuth(config, (async () => new Response(JSON.stringify({ __type: 'NotAuthorizedException', message: 'User is disabled.' }), { status: 400 })) as typeof fetch);
    const error = (await auth.signIn('new@example.com', 'Password123').catch((e: unknown) => e)) as AuthError;
    expect(error.code).toBe('UserDisabled');
    expect(error.message).toMatch(/waiting for approval/);
  });
});
