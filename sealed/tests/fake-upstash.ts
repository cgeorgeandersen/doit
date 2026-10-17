/**
 * Just enough of Upstash's REST API to test `redisStore` without a network:
 * the same commands, answering in the same shapes Upstash does.
 */
export function fakeUpstash(url: string, token: string): typeof fetch {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();

  function run([name, key, ...args]: string[]): unknown {
    const k = String(key);
    switch (name) {
      case 'GET':
        return strings.get(k) ?? null;
      case 'SET':
        if (args.includes('NX') && strings.has(k)) return null;
        strings.set(k, String(args[0]));
        return 'OK';
      case 'HGETALL':
        return [...(hashes.get(k) ?? [])].flat();
      case 'HSET':
      case 'HSETNX': {
        const hash = hashes.get(k) ?? new Map<string, string>();
        hashes.set(k, hash);
        const [field, value] = args as [string, string];
        if (name === 'HSETNX' && hash.has(field)) return 0;
        const isNew = !hash.has(field);
        hash.set(field, value);
        return isNew ? 1 : 0;
      }
      case 'HDEL':
        return hashes.get(k)?.delete(String(args[0])) ? 1 : 0;
      case 'EXPIRE':
        return strings.has(k) || hashes.has(k) ? 1 : 0;
      default:
        throw new Error(`fakeUpstash doesn't know ${name}`);
    }
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    if (new Headers(init?.headers).get('Authorization') !== `Bearer ${token}`) {
      return Response.json({ error: 'WRONGPASS' }, { status: 401 });
    }
    const body = JSON.parse(String(init?.body)) as unknown[];
    const stringify = (command: unknown[]) => command.map(String);
    if (target === `${url}/pipeline`) {
      return Response.json((body as unknown[][]).map((command) => ({ result: run(stringify(command)) })));
    }
    if (target === url) return Response.json({ result: run(stringify(body)) });
    return Response.json({ error: 'not found' }, { status: 404 });
  }) as typeof fetch;
}
