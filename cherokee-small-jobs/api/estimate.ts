// The Vercel Function behind /api/estimate. All the logic is in src/server/estimate.ts.
import { handleEstimate } from '../src/server/estimate.js';

export function POST(request: Request): Promise<Response> {
  return handleEstimate(request, process.env);
}
