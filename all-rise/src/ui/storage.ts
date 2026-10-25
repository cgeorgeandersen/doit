/*
 * Only conveniences live in localStorage: whether sound is off and which
 * cases this browser has already seen. Private windows can refuse storage,
 * so every read and write tolerates failure.
 */
const PREFIX = 'all-rise:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked; the game works without it.
  }
}
