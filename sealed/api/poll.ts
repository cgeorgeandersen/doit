// The Vercel Function behind /api/poll. All the logic is in src/server/.
import { handle } from '../src/server/handler.js';
import { storeFromEnv } from '../src/server/redis.js';

const store = storeFromEnv();

export function GET(request: Request): Promise<Response> {
  return handle(request, store);
}

export function POST(request: Request): Promise<Response> {
  return handle(request, store);
}
