import type { Change, Workspace } from '../core/model';
import { parseWorkspace, type SaveStatus, type Store } from '../core/store';
import type { Auth } from './auth';

/*
 * The signed-in user's tables, kept in DynamoDB through the TagFluent API. One
 * table is open at a time: it's fetched once before the app starts, and after
 * that every save sends only the versions the server doesn't have yet. When
 * the history was replaced (a restored backup, the sample started over) the
 * whole table goes. Opening another table reloads the page with ?table=<id>.
 */

/** The table everyone starts with, stored where the only table used to be. */
export const MAIN_TABLE = 'main';
const LAST_TABLE_KEY = 'tagfluent:table';

export interface TableInfo {
  id: string;
  name: string;
}

/** The account's tables, and what can be done with them. */
export interface Tables {
  /** The open table's id. */
  readonly current: string;
  /** Every table, oldest first. */
  readonly list: TableInfo[];
  /** How many tables the account may have. */
  readonly limit: number;
  /** Saves a new table and returns its id. Throws TableLimitError when the account has as many as it may. */
  create(ws: Workspace): Promise<string>;
  remove(id: string): Promise<void>;
  /** Opens a table, reloading the page. */
  open(id: string): void;
}

export class TableLimitError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Your account can have up to ${limit} tables.`);
    this.limit = limit;
  }
}

export interface CloudStore extends Store {
  tables: Tables;
}

/** The table to open: the one in the address, else the last one opened in this browser, else the first. */
export function requestedTable(search: string): string {
  const fromUrl = new URLSearchParams(search).get('table');
  if (fromUrl && /^[a-z0-9]{1,24}$/.test(fromUrl)) return fromUrl;
  try {
    const last = localStorage.getItem(LAST_TABLE_KEY);
    if (last && /^[a-z0-9]{1,24}$/.test(last)) return last;
  } catch {
    // storage blocked: open the first table
  }
  return MAIN_TABLE;
}

/** This page's address with a table in it: none for the first table, ?table=<id> for the others. */
function tableUrl(id: string): URL {
  const url = new URL(location.href);
  if (id === MAIN_TABLE) url.searchParams.delete('table');
  else url.searchParams.set('table', id);
  return url;
}

/** Remembers the open table for next time, and shows it in the address so a reload reopens it. */
export function rememberTable(id: string): void {
  try {
    localStorage.setItem(LAST_TABLE_KEY, id);
  } catch {
    // storage blocked: the address still says which table is open
  }
  history.replaceState(history.state, '', tableUrl(id).href);
}

function newTableId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown> = {}) {
    super(`The TagFluent API answered ${status}.`);
    this.status = status;
    this.body = body;
  }
}

const sameChange = (a: Change, b: Change) => a.version === b.version && a.at === b.at && a.summary === b.summary;

export async function openCloudStore(apiUrl: string, auth: Auth, table = MAIN_TABLE): Promise<CloudStore> {
  async function call(method: string, path: string, body?: unknown, id = table): Promise<unknown> {
    const token = await auth.accessToken();
    if (!token) throw new ApiError(401);
    const response = await fetch(`${apiUrl}${path}?table=${id}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => ({}))) as Record<string, unknown>);
    return response.json();
  }

  const answer = (await call('GET', '/workspace')) as { workspace: unknown; tables?: TableInfo[]; limit?: number };
  const limit = answer.limit ?? 1;
  const list: TableInfo[] = [...(answer.tables ?? [])];
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

  const tables: Tables = {
    current: table,
    list,
    limit,
    async create(ws) {
      const id = newTableId();
      try {
        await call('PUT', '/workspace', { schema: ws.schema, name: ws.name, user: ws.user, changes: ws.changes }, id);
      } catch (error) {
        if (error instanceof ApiError && error.status === 403 && error.body.error === 'table limit') {
          throw new TableLimitError(Number(error.body.limit) || limit);
        }
        throw error;
      }
      list.push({ id, name: ws.name });
      return id;
    },
    async remove(id) {
      await call('DELETE', '/workspace', undefined, id);
      list.splice(list.findIndex((t) => t.id === id), 1);
    },
    open(id) {
      try {
        localStorage.setItem(LAST_TABLE_KEY, id);
      } catch {
        // storage blocked: the address says which table to open
      }
      const url = tableUrl(id);
      url.hash = '#/';
      location.assign(url.href);
    },
  };

  return {
    tables,
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
