import type { Change, Workspace } from '../core/model';
import { parseWorkspace, type SaveStatus, type Store } from '../core/store';
import type { Auth } from './auth';

/*
 * The signed-in user's workspace, kept in DynamoDB through the UTMDM API.
 * The workspace is fetched once before the app starts; after that every save
 * sends only the versions the server doesn't have yet. When the history was
 * replaced (a restored backup, the demo started over) the whole workspace goes.
 */

class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`The UTMDM API answered ${status}.`);
    this.status = status;
  }
}

const sameChange = (a: Change, b: Change) => a.version === b.version && a.at === b.at && a.summary === b.summary;

export async function openCloudStore(apiUrl: string, auth: Auth): Promise<Store> {
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await auth.accessToken();
    if (!token) throw new ApiError(401);
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }

  const answer = (await call('GET', '/workspace')) as { workspace: unknown };
  let loaded: Workspace | null = null;
  try {
    loaded = answer.workspace ? parseWorkspace(JSON.stringify(answer.workspace)) : null;
  } catch {
    loaded = null; // stored in a shape this version can't read: start a fresh one
  }

  // What the server has. Only versions after these are sent on the next save.
  let synced: Change[] = loaded?.changes ?? [];
  let syncedMeta = loaded ? `${loaded.name}|${loaded.user}` : '';
  let queue = Promise.resolve();
  const listeners: ((status: SaveStatus) => void)[] = [];
  const announce = (status: SaveStatus) => listeners.forEach((l) => l(status));

  async function push(ws: Workspace): Promise<void> {
    const meta = { schema: ws.schema, name: ws.name, user: ws.user };
    const extends_ = synced.length <= ws.changes.length && synced.every((c, i) => sameChange(c, ws.changes[i]!));
    const fresh = extends_ ? ws.changes.slice(synced.length) : ws.changes;
    if (extends_ && !fresh.length && `${ws.name}|${ws.user}` === syncedMeta) return;
    announce('saving');
    try {
      if (extends_) await call('POST', '/workspace/changes', { ...meta, changes: fresh });
      else await call('PUT', '/workspace', { ...meta, changes: ws.changes });
      synced = ws.changes;
      syncedMeta = `${ws.name}|${ws.user}`;
      announce('saved');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      announce(status === 409 ? 'conflict' : status === 401 ? 'signed-out' : 'failed');
    }
  }

  return {
    load: () => (loaded ? structuredClone(loaded) : null),
    save: (ws) => {
      const copy = structuredClone(ws);
      queue = queue.then(() => push(copy));
    },
    clear: () => {
      // nothing to do: replacing the workspace overwrites it on the server
    },
    onStatus: (listener) => {
      listeners.push(listener);
    },
  };
}
