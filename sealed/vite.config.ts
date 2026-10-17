import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Serves /api/poll during `npm run dev` with the same handler Vercel runs, so
 * the whole app works locally with nothing else installed. Polls live in
 * memory unless KV_REST_API_URL and KV_REST_API_TOKEN point at a Redis.
 */
function devApi(): Plugin {
  return {
    name: 'sealed-dev-api',
    configureServer(server: ViteDevServer) {
      let store: unknown;
      server.middlewares.use('/api/poll', (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          const { handle } = await server.ssrLoadModule('/src/server/handler.ts');
          if (!store) {
            const { storeFromEnv } = await server.ssrLoadModule('/src/server/redis.ts');
            const { memoryStore } = await server.ssrLoadModule('/src/server/store.ts');
            store = storeFromEnv() ?? memoryStore();
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          // Mounted at /api/poll, so req.url is just what follows it, query and all.
          const request = new Request(new URL(`/api/poll${req.url ?? ''}`, 'http://localhost'), {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await handle(request, store);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        })().catch((error: unknown) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  build: {
    target: 'es2022',
    reportCompressedSize: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
