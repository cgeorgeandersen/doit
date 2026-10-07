import type { Workspace } from './model';

/*
 * Where a workspace is kept. Today: this browser (localStorage). With sign-in,
 * a hosted database implements the same three methods and nothing else changes.
 */

export interface Store {
  load(): Workspace | null;
  save(ws: Workspace): void;
  clear(): void;
}

export const STORAGE_KEY = 'utmdm:workspace:v2';

export function memoryStore(initial: Workspace | null = null): Store {
  let kept = initial ? structuredClone(initial) : null;
  return {
    load: () => (kept ? structuredClone(kept) : null),
    save: (ws) => {
      kept = structuredClone(ws);
    },
    clear: () => {
      kept = null;
    },
  };
}

/** The browser's storage, or memory when it's unavailable (private windows, blocked storage). */
export function browserStore(): Store {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
  } catch {
    storage = null;
  }
  if (!storage) return memoryStore();
  const local = storage;
  return {
    load: () => {
      try {
        const text = local.getItem(STORAGE_KEY);
        return text ? parseWorkspace(text) : null;
      } catch {
        return null; // unreadable or from an incompatible version: start again
      }
    },
    save: (ws) => {
      try {
        local.setItem(STORAGE_KEY, JSON.stringify(ws));
      } catch {
        // full or blocked: the app keeps working in memory
      }
    },
    clear: () => {
      try {
        local.removeItem(STORAGE_KEY);
      } catch {
        // nothing to do
      }
    },
  };
}

/** Reads a saved workspace or a backup file, refusing anything that isn't one. */
export function parseWorkspace(text: string): Workspace {
  const data = JSON.parse(text) as Partial<Workspace>;
  const valid =
    data &&
    data.schema === 2 &&
    typeof data.name === 'string' &&
    typeof data.user === 'string' &&
    Array.isArray(data.changes) &&
    data.changes.every((c, i) => c && c.version === i + 1 && typeof c.summary === 'string' && c.op && typeof c.op.type === 'string');
  if (!valid) throw new Error("That file isn't a UTMDM backup.");
  return data as Workspace;
}
