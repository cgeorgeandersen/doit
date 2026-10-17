import type { Store } from './store.js';

type Command = Array<string | number>;

/**
 * Upstash Redis over its REST API: one HTTPS request per command, or per
 * pipeline. Plain `fetch`, so there's no client library to keep up to date.
 * https://upstash.com/docs/redis/features/restapi
 */
export function redisStore(url: string, token: string): Store {
  const base = url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function call(command: Command): Promise<unknown> {
    const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(command) });
    const body = (await response.json()) as { result?: unknown; error?: string };
    if (!response.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error ?? response.status}`);
    return body.result;
  }

  async function pipeline(commands: Command[]): Promise<unknown[]> {
    const response = await fetch(`${base}/pipeline`, { method: 'POST', headers, body: JSON.stringify(commands) });
    const body = (await response.json()) as Array<{ result?: unknown; error?: string }> | { error?: string };
    if (!response.ok || !Array.isArray(body)) {
      throw new Error(`Redis pipeline failed: ${(body as { error?: string }).error ?? response.status}`);
    }
    const failed = body.find((entry) => entry.error);
    if (failed) throw new Error(`Redis pipeline failed: ${failed.error}`);
    return body.map((entry) => entry.result);
  }

  return {
    async get(key) {
      const result = await call(['GET', key]);
      return typeof result === 'string' ? result : null;
    },
    async set(key, value, ttlSeconds, onlyIfNew) {
      const command: Command = ['SET', key, value, 'EX', ttlSeconds];
      if (onlyIfNew) command.push('NX');
      return (await call(command)) === 'OK';
    },
    async hgetall(key) {
      // The REST API returns a hash as a flat list: field, value, field, value.
      const flat = (await call(['HGETALL', key])) as string[] | null;
      const out: Record<string, string> = {};
      for (let i = 0; flat && i + 1 < flat.length; i += 2) out[flat[i]!] = flat[i + 1]!;
      return out;
    },
    async hset(key, field, value, ttlSeconds, onlyIfNew) {
      const [written] = await pipeline([
        [onlyIfNew ? 'HSETNX' : 'HSET', key, field, value],
        ['EXPIRE', key, ttlSeconds],
      ]);
      // HSET answers how many fields were new, so 0 means an existing field was updated.
      return onlyIfNew ? written === 1 : true;
    },
    async hdel(key, field) {
      await call(['HDEL', key, field]);
    },
  };
}

/**
 * The store for this deployment. Connecting Upstash Redis to the Vercel project
 * (Storage → Upstash → Redis) adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`;
 * the `UPSTASH_REDIS_REST_*` names from an Upstash console work too.
 */
export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}
