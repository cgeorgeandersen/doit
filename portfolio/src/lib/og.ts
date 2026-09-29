/**
 * Share images (OpenGraph cards), 1200×630, rendered at build time with
 * satori (layout → SVG) and sharp (SVG → PNG). One per page; see
 * src/pages/og/[...route].png.ts for which pages get which card.
 *
 * The fonts are static cuts of the site's own fonts in src/og-fonts/ (satori
 * can't read the woff2 variable files the site serves); scripts/make-og-fonts.py
 * made them. Colors are the light theme's tokens: link previews have no dark mode.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

export interface OgCard {
  /** Small mono line at the top, e.g. ["George Andersen", "Framework"]. */
  kicker: string[];
  title: string;
  /** A word in the title to give the dotted jade underline (the home page's "boring"). */
  emphasis?: string | undefined;
  dek?: string | undefined;
  /** Bottom-left note, e.g. "Reviewed Sep 29, 2026"; `dot` adds the jade stamp dot. */
  note?: { text: string; dot?: boolean } | undefined;
  /** Bottom-right text, usually the site's or the project's domain. */
  byline: string;
  /** Absolute path of a cover image to show beside the text (projects). */
  image?: string | undefined;
}

const W = 1200;
const H = 630;
const PAD = 72;

const INK = '#191a1c';
const INK_2 = '#45464b';
const INK_3 = '#6a6b70';
const PAPER = '#faf9f5';
const RULE = '#dedbd2';
const ACCENT = '#08856a';

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; src?: string; width?: number; height?: number } };

/** A satori element. No children means none at all: satori reads even [] as "several children". */
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
  return { type, props: { style, children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children } };
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500; style: 'normal' }[]> | undefined;

function loadFonts() {
  const dir = resolve(process.cwd(), 'src/og-fonts');
  fonts ??= Promise.all([
    readFile(resolve(dir, 'bodoni-moda-display-500.ttf')).then((data) => ({ name: 'Bodoni Moda', data, weight: 500 as const, style: 'normal' as const })),
    readFile(resolve(dir, 'newsreader-400.ttf')).then((data) => ({ name: 'Newsreader', data, weight: 400 as const, style: 'normal' as const })),
    readFile(resolve(dir, 'ibm-plex-mono-500.woff')).then((data) => ({ name: 'IBM Plex Mono', data, weight: 500 as const, style: 'normal' as const })),
  ]);
  return fonts;
}

/**
 * The title as one flex item per word, so it wraps at spaces like text.
 * Bodoni's hyphens and dashes are invisible hairlines, so those characters
 * are set in Newsreader, as on the site.
 */
function title(text: string, size: number, emphasis: string | undefined): Node {
  const underline = { textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: ACCENT };
  const words = text.split(' ').map((word) => {
    const emphasized = emphasis && word.replace(/[^\p{L}\p{N}]/gu, '') === emphasis ? underline : {};
    const parts = word.split(/([-‐‑–—])/).filter(Boolean);
    if (parts.length === 1) return h('span', emphasized, word);
    return h('div', { display: 'flex', ...emphasized }, ...parts.map((part) => h('span', /^[-‐‑–—]$/.test(part) ? { fontFamily: 'Newsreader' } : {}, part)));
  });
  return h(
    'div',
    { display: 'flex', flexWrap: 'wrap', columnGap: Math.round(size * 0.26), fontFamily: 'Bodoni Moda', fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.012, color: INK },
    ...words,
  );
}

function titleSize(text: string, narrow: boolean): number {
  const n = text.length;
  if (narrow) return n <= 16 ? 88 : n <= 24 ? 76 : 64;
  return n <= 16 ? 116 : n <= 24 ? 96 : n <= 34 ? 80 : 68;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

async function coverDataUrl(path: string): Promise<string> {
  const png = await sharp(path).resize(880, 462, { fit: 'cover', position: 'top' }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function renderCard(card: OgCard): Promise<Buffer> {
  const narrow = Boolean(card.image);
  const size = titleSize(card.title, narrow);

  const text = h(
    'div',
    { display: 'flex', flexDirection: 'column', gap: 26, flex: 1, minWidth: 0 },
    title(card.title, size, card.emphasis),
    card.dek ? h('div', { display: 'flex', fontFamily: 'Newsreader', fontSize: narrow ? 28 : 32, lineHeight: 1.38, color: INK_2 }, clip(card.dek, narrow ? 150 : 190)) : null,
  );

  const cover: Node | null = card.image
    ? {
        type: 'img',
        props: {
          src: await coverDataUrl(card.image),
          width: 440,
          height: 231,
          style: { borderRadius: 6, border: `1px solid ${RULE}`, objectFit: 'cover' },
        },
      }
    : null;
  const middle = h('div', { display: 'flex', alignItems: 'center', gap: 48, flex: 1 }, text, cover);

  const tree = h(
    'div',
    { width: W, height: H, display: 'flex', flexDirection: 'column', padding: PAD, background: PAPER, color: INK },
    h(
      'div',
      { display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'IBM Plex Mono', fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', color: INK_3 },
      h('div', { width: 36, height: 5, borderRadius: 1, background: ACCENT }),
      card.kicker.join('  ·  '),
    ),
    middle,
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 22, borderTop: `1px solid ${RULE}`, fontFamily: 'IBM Plex Mono', fontSize: 20, letterSpacing: 1, color: INK_3 },
      card.note
        ? h(
            'div',
            { display: 'flex', alignItems: 'center', gap: 12 },
            card.note.dot ? h('div', { width: 10, height: 10, borderRadius: 5, background: ACCENT }) : null,
            card.note.text,
          )
        : h('div', {}, ''),
      h('div', { display: 'flex' }, card.byline),
    ),
  );

  const svg = await satori(tree as Parameters<typeof satori>[0], { width: W, height: H, fonts: await loadFonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}
