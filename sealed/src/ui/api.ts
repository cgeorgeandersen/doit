import type { Ballot, NewPoll, PollView } from '../core/model';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(init?: RequestInit, query = ''): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/poll${query}`, init);
  } catch {
    throw new ApiError(0, 'Couldn’t reach the server. Check your connection and try again.');
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? `Something went wrong (${response.status}).`);
  return body;
}

function post<T>(body: Record<string, unknown>): Promise<T> {
  return request<T>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export const api = {
  view: (id: string) => request<PollView>(undefined, `?id=${encodeURIComponent(id)}`),
  create: (poll: NewPoll) => post<{ id: string; adminKey: string }>({ action: 'create', poll }),
  join: (id: string, name: string) => post<{ voterId: string; token: string }>({ action: 'join', id, name }),
  claim: (id: string, voterId: string) => post<{ token: string }>({ action: 'claim', id, voterId }),
  vote: (id: string, voterId: string, token: string, ballot: Ballot) =>
    post<PollView>({ action: 'vote', id, voterId, token, ballot }),
  myBallot: (id: string, voterId: string, token: string) =>
    post<{ ballot: Ballot | null }>({ action: 'myBallot', id, voterId, token }),
  reveal: (id: string, adminKey: string) => post<PollView>({ action: 'reveal', id, adminKey }),
  remove: (id: string, adminKey: string, voterId: string) => post<PollView>({ action: 'remove', id, adminKey, voterId }),
  release: (id: string, adminKey: string, voterId: string) =>
    post<PollView>({ action: 'release', id, adminKey, voterId }),
};
