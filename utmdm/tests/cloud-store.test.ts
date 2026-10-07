import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../src/cloud/auth';
import { openCloudStore } from '../src/cloud/cloud-store';
import { createDemoWorkspace } from '../src/core/demo';
import type { SaveStatus } from '../src/core/store';

const auth = { accessToken: async () => 'token' } as unknown as Auth;
const demo = createDemoWorkspace('2026-10-07T12:00:00.000Z');

function server(initial: unknown, answer: (method: string, path: string) => number = () => 200) {
  const calls: { method: string; path: string; body: any; auth: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.example', '');
    const method = init.method ?? 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null, auth: (init.headers as Record<string, string>).authorization });
    const status = method === 'GET' ? 200 : answer(method, path);
    return new Response(JSON.stringify(method === 'GET' ? { workspace: initial } : {}), { status });
  });
  return calls;
}

async function settle(statuses: SaveStatus[], n: number) {
  for (let i = 0; i < 50 && statuses.length < n; i++) await new Promise((r) => setTimeout(r, 0));
}

afterEach(() => vi.unstubAllGlobals());

describe('the cloud store', () => {
  it('loads the signed-in user\'s workspace with their token', async () => {
    const calls = server(demo);
    const store = await openCloudStore('https://api.example', auth);
    expect(store.load()).toEqual(demo);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/workspace', auth: 'Bearer token' });
  });

  it('sends only the versions the server does not have', async () => {
    const calls = server(demo);
    const store = await openCloudStore('https://api.example', auth);
    const statuses: SaveStatus[] = [];
    store.onStatus!((s) => statuses.push(s));
    const next = { ...demo, changes: [...demo.changes, { ...demo.changes.at(-1)!, version: 9, summary: 'Typed Social' }] };
    store.save(next);
    await settle(statuses, 2);
    expect(statuses).toEqual(['saving', 'saved']);
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/workspace/changes' });
    expect(calls[1]!.body.changes.map((c: { version: number }) => c.version)).toEqual([9]);
    store.save(next); // nothing new: no call
    await settle(statuses, 3);
    expect(calls).toHaveLength(2);
  });

  it('replaces the whole workspace when its history was replaced, and starts a new user from nothing', async () => {
    const calls = server(null);
    const store = await openCloudStore('https://api.example', auth);
    expect(store.load()).toBeNull();
    const statuses: SaveStatus[] = [];
    store.onStatus!((s) => statuses.push(s));
    store.save(demo);
    await settle(statuses, 2);
    expect(calls[1]).toMatchObject({ method: 'POST' });
    expect(calls[1]!.body.changes).toHaveLength(demo.changes.length);
    const restored = { ...demo, changes: demo.changes.slice(0, 3).map((c) => ({ ...c, at: '2025-01-01T00:00:00.000Z' })) };
    store.save(restored);
    await settle(statuses, 4);
    expect(calls[2]).toMatchObject({ method: 'PUT', path: '/workspace' });
  });

  it('reports a version someone else saved first as a conflict', async () => {
    server(demo, () => 409);
    const store = await openCloudStore('https://api.example', auth);
    const statuses: SaveStatus[] = [];
    store.onStatus!((s) => statuses.push(s));
    store.save({ ...demo, name: 'Renamed' });
    await settle(statuses, 2);
    expect(statuses).toEqual(['saving', 'conflict']);
  });
});
