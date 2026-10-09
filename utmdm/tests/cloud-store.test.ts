import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../src/cloud/auth';
import { openCloudStore, TableLimitError } from '../src/cloud/cloud-store';
import { createDemoWorkspace } from '../src/core/demo';
import { emptyWorkspace } from '../src/core/workspace';
import type { SaveStatus } from '../src/core/store';

const auth = { accessToken: async () => 'token' } as unknown as Auth;
const demo = createDemoWorkspace('2026-10-07T12:00:00.000Z');

const TABLES = [{ id: 'main', name: 'Zestify' }, { id: 'acme', name: 'Acme Co.' }];

function server(initial: unknown, answer: (method: string, path: string) => number | [number, unknown] = () => 200) {
  const calls: { method: string; path: string; table: string | null; body: any; auth: string | undefined }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? 'GET';
    calls.push({ method, path: pathname, table: searchParams.get('table'), body: init.body ? JSON.parse(String(init.body)) : null, auth: (init.headers as Record<string, string>).authorization });
    const [status, body] = method === 'GET' ? [200, { workspace: initial, tables: TABLES, limit: 3 }] : [answer(method, pathname)].flat() as [number, unknown?];
    return new Response(JSON.stringify(body ?? {}), { status });
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
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/workspace', table: 'main', auth: 'Bearer token' });
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

  it('clears the sample for an empty table, which loads as empty rather than as the sample again', async () => {
    const calls = server(demo);
    const store = await openCloudStore('https://api.example', auth);
    const statuses: SaveStatus[] = [];
    store.onStatus!((s) => statuses.push(s));
    const empty = emptyWorkspace('My UTMs', 'george');
    store.save(empty);
    await settle(statuses, 2);
    expect(calls[1]).toMatchObject({ method: 'PUT', path: '/workspace', body: { name: 'My UTMs', changes: [] } });

    server(empty);
    const reopened = await openCloudStore('https://api.example', auth);
    expect(reopened.load()).toEqual(empty);
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

describe('several tables', () => {
  it('opens, saves and lists the table it was asked for', async () => {
    const calls = server(demo);
    const store = await openCloudStore('https://api.example', auth, 'acme');
    expect(store.tables).toMatchObject({ current: 'acme', list: TABLES, limit: 3 });
    const statuses: SaveStatus[] = [];
    store.onStatus!((s) => statuses.push(s));
    store.save({ ...demo, name: 'Acme' });
    await settle(statuses, 2);
    expect(calls.map((c) => c.table)).toEqual(['acme', 'acme']);
  });

  it('creates a table under a new id, and says when the account has as many as it may', async () => {
    const calls = server(demo, () => (calls.length > 2 ? [403, { error: 'table limit', limit: 3 }] : 200));
    const store = await openCloudStore('https://api.example', auth);
    const id = await store.tables.create(emptyWorkspace('Client C', 'george'));
    expect(id).toMatch(/^[a-z0-9]{10}$/);
    expect(calls[1]).toMatchObject({ method: 'PUT', path: '/workspace', table: id, body: { name: 'Client C', changes: [] } });
    expect(store.tables.list.at(-1)).toEqual({ id, name: 'Client C' });
    const error = await store.tables.create(emptyWorkspace('Client D', 'george')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TableLimitError);
    expect((error as TableLimitError).limit).toBe(3);
  });

  it('deletes a table', async () => {
    const calls = server(demo);
    const store = await openCloudStore('https://api.example', auth);
    await store.tables.remove('acme');
    expect(calls[1]).toMatchObject({ method: 'DELETE', path: '/workspace', table: 'acme' });
    expect(store.tables.list.map((t) => t.id)).toEqual(['main']);
  });
});
