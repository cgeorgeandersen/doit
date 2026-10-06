/**
 * Whether the playbook's PDF (public/playbook.pdf) still matches the page.
 *
 * The PDF is the page itself, printed by `npm run playbook:pdf`
 * (scripts/make-playbook-pdf.mjs). At build time the page takes a fingerprint
 * of everything it's made of: its words, the stage and framework names it
 * shows, and its own markup and styles. The script saves the fingerprint of
 * the page it printed in src/playbook/pdf.json. When the two differ, the page
 * offers "Print or save as PDF" instead of the download, so nobody gets a PDF
 * that disagrees with the page. Build-time only: it reads files from disk.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the PDF is served from. */
export const PDF_PATH = '/playbook.pdf';

/** Run from the portfolio folder, as `astro build`, `astro dev` and the script all are. */
const ROOT = process.cwd();

/** The files whose every change should remake the PDF, besides the data passed in. */
const SOURCES = ['src/pages/playbook.astro', 'src/playbook/playbook.css'];

const STAMP = 'src/playbook/pdf.json';

/** A short fingerprint of the page: the data it shows plus its markup and styles. */
export function fingerprintOf(data: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(data));
  // Line endings are normalized so a checkout on Windows fingerprints the same as one on Vercel.
  for (const file of SOURCES) hash.update(readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'));
  return hash.digest('hex').slice(0, 16);
}

export interface PdfStatus {
  /** True when public/playbook.pdf exists and was made from a page with this fingerprint. */
  ready: boolean;
  /** Why it isn't, for the build log. */
  reason?: string;
}

export function pdfStatus(fingerprint: string): PdfStatus {
  if (!existsSync(join(ROOT, 'public', PDF_PATH))) return { ready: false, reason: `public${PDF_PATH} doesn't exist yet` };
  let saved = '';
  try {
    saved = (JSON.parse(readFileSync(join(ROOT, STAMP), 'utf8')) as { fingerprint?: string }).fingerprint ?? '';
  } catch {
    return { ready: false, reason: `${STAMP} is missing or unreadable` };
  }
  if (saved !== fingerprint) return { ready: false, reason: 'the page changed since the PDF was made' };
  return { ready: true };
}
