/**
 * What this browser remembers about each poll: the host key if you made it,
 * and who you are if you've picked a name. Never a ballot: that stays on the
 * server, and you fetch your own back with your token when you change it.
 */
export interface SavedPoll {
  id: string;
  title: string;
  adminKey?: string;
  voterId?: string;
  token?: string;
  name?: string;
  seenAt: number;
}

const KEY = 'sealed:polls';

function readAll(): Record<string, SavedPoll> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SavedPoll>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, SavedPoll>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private windows can refuse storage. The poll still works until the tab closes.
  }
}

/** Kept in memory too, so a browser that won't store anything still works for this visit. */
const memory: Record<string, SavedPoll> = {};

export function loadSaved(id: string): SavedPoll | undefined {
  return memory[id] ?? readAll()[id];
}

export function save(id: string, patch: Partial<SavedPoll>): SavedPoll {
  const all = readAll();
  const next: SavedPoll = { ...all[id], ...memory[id], ...patch, id, title: patch.title ?? all[id]?.title ?? '', seenAt: Date.now() };
  memory[id] = next;
  all[id] = next;
  writeAll(all);
  return next;
}

/** Forgets who you are on this poll (the name was freed or removed), keeping the host key. */
export function forgetVoter(id: string): void {
  const current = loadSaved(id);
  if (!current) return;
  const { voterId: _voterId, token: _token, name: _name, ...rest } = current;
  const all = readAll();
  memory[id] = rest;
  all[id] = rest;
  writeAll(all);
}

export function forget(id: string): void {
  const all = readAll();
  delete all[id];
  delete memory[id];
  writeAll(all);
}

export function savedPolls(): SavedPoll[] {
  return Object.values({ ...readAll(), ...memory }).sort((a, b) => b.seenAt - a.seenAt);
}
