/**
 * The few Redis commands the server needs. Production uses Upstash Redis over
 * its REST API (`redis.ts`); tests and `npm run dev` use the in-memory copy
 * below, which behaves the same way apart from expiry.
 *
 * Each person's ballot, name and device token is its own hash field, written
 * on its own, so two people voting at the same moment can't overwrite each other.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  /** SET with an expiry. With `onlyIfNew`, only when the key doesn't exist yet. Returns whether it was written. */
  set(key: string, value: string, ttlSeconds: number, onlyIfNew?: boolean): Promise<boolean>;
  hgetall(key: string): Promise<Record<string, string>>;
  /** HSET (or HSETNX with `onlyIfNew`), then renews the hash's expiry. Returns whether the field was written. */
  hset(key: string, field: string, value: string, ttlSeconds: number, onlyIfNew?: boolean): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
}

/** Keeps everything in this process. Nothing expires and a restart forgets it all. */
export function memoryStore(): Store {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  return {
    async get(key) {
      return strings.get(key) ?? null;
    },
    async set(key, value, _ttl, onlyIfNew) {
      if (onlyIfNew && strings.has(key)) return false;
      strings.set(key, value);
      return true;
    },
    async hgetall(key) {
      return Object.fromEntries(hashes.get(key) ?? []);
    },
    async hset(key, field, value, _ttl, onlyIfNew) {
      const hash = hashes.get(key) ?? new Map<string, string>();
      hashes.set(key, hash);
      if (onlyIfNew && hash.has(field)) return false;
      hash.set(field, value);
      return true;
    },
    async hdel(key, field) {
      hashes.get(key)?.delete(field);
    },
  };
}
