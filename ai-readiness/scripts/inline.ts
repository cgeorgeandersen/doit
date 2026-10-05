/**
 * What the build writes inline into index.html, so first paint waits on no
 * other file: the theme script (it must run before the page paints, or a
 * dark-mode reader sees a white flash) and, at build time, the stylesheet.
 *
 * The Content-Security-Policy in vercel.json forbids inline scripts except
 * this one, allowed by its sha256 hash. tests/csp.test.ts checks the hash
 * there still matches the script, and prints the new one if it doesn't.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The theme script exactly as it's inlined (its hash depends on every byte). */
export function themeScript(): string {
  return readFileSync(resolve(import.meta.dirname, 'theme-init.js'), 'utf8').trim();
}

/** A script's CSP source: 'sha256-…'. */
export function cspHash(script: string): string {
  return `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
}
