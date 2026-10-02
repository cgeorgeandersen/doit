import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The Census Geocoder doesn't allow calls from other websites' pages (no CORS),
 * so the app asks this site's /api/census/… instead. On Vercel a rewrite in
 * vercel.json forwards it; in development and preview this proxy does.
 */
const census = {
  target: 'https://geocoding.geo.census.gov',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/census/, '/geocoder/geographies'),
};

/** `vite preview` sends the same security headers as Vercel, so the CSP is tested before it ships. */
function vercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const all = config.headers?.find((h) => h.source === '/(.*)');
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

export default defineConfig({
  base: '/',
  server: { proxy: { '/api/census': census } },
  preview: { proxy: { '/api/census': census }, headers: vercelHeaders() },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
