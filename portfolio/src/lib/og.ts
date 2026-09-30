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
  /** Small label line at the top, e.g. ["George Andersen", "Framework"]. */
  kicker: string[];
  title: string;
  /** A word in the title to give the four-color stripe (the home page's "boring"). */
  emphasis?: string | undefined;
  dek?: string | undefined;
  /** Bottom-left note, e.g. "Reviewed Sep 29, 2026"; `dot` adds the stamp's dot. */
  note?: { text: string; dot?: boolean } | undefined;
  /** Bottom-right text, usually the site's or the project's domain. */
  byline: string;
  /** Absolute path of a cover image to show beside the text (projects). */
  image?: string | undefined;
  /** An element tile to show beside the text (frameworks); `color` is the framework's slot. */
  element?: { number: number; symbol: string; kind: string; color: 0 | 1 | 2 | 3 } | undefined;
}

const W = 1200;
const H = 630;
const PAD = 72;

const INK = '#111318';
const INK_2 = '#3e4450';
const INK_3 = '#5c6370';
const PAPER = '#ffffff';
const RULE = '#e2e5ea';
const FRESH = '#0a7568';
/** The framework colors (tokens.css --fw-0 … --fw-3): the stripe and the dot mark. */
const FW = ['#6b45f0', '#2759f5', '#f2553a', '#0fa08e'];
/** Their text twins (--fw-N-ink), for the element tile's number and symbol. */
const FW_INK = ['#5733d9', '#1d47cf', '#c23a21', '#0a7568'];

/** A color mixed into white, like the tiles' color-mix(in srgb, var(--fw) 9%, var(--paper)). */
function tint(hex: string, amount: number): string {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(255 + (value - 255) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; src?: string; width?: number; height?: number } };

/** A satori element. No children means none at all: satori reads even [] as "several children". */
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
  return { type, props: { style, children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children } };
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 800; style: 'normal' }[]> | undefined;

function loadFonts() {
  const dir = resolve(process.cwd(), 'src/og-fonts');
  fonts ??= Promise.all([
    readFile(resolve(dir, 'bricolage-grotesque-800.ttf')).then((data) => ({ name: 'Bricolage Grotesque', data, weight: 800 as const, style: 'normal' as const })),
    readFile(resolve(dir, 'instrument-sans-400.ttf')).then((data) => ({ name: 'Instrument Sans', data, weight: 400 as const, style: 'normal' as const })),
    readFile(resolve(dir, 'instrument-sans-600.ttf')).then((data) => ({ name: 'Instrument Sans', data, weight: 600 as const, style: 'normal' as const })),
  ]);
  return fonts;
}

/** The four-color stripe, as a row of four equal bars. */
function stripe(height: number): Node {
  return h('div', { display: 'flex', height, width: '100%' }, ...FW.map((background) => h('div', { flex: 1, background })));
}

/** The site's mark: one dot per framework color, two by two. */
function mark(size: number): Node {
  const dot = (background: string) => h('div', { width: size, height: size, borderRadius: size / 2, background });
  const gap = Math.round(size / 2);
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', gap },
    h('div', { display: 'flex', gap }, dot(FW[0]!), dot(FW[1]!)),
    h('div', { display: 'flex', gap }, dot(FW[2]!), dot(FW[3]!)),
  );
}

/**
 * The title as one flex item per word, so it wraps at spaces like text. The
 * emphasized word sits on the four-color stripe, as on the home page.
 */
function title(text: string, size: number, emphasis: string | undefined): Node {
  const words = text.split(' ').map((word) =>
    emphasis && word.replace(/[^\p{L}\p{N}]/gu, '') === emphasis
      ? h('div', { display: 'flex', flexDirection: 'column' }, h('span', {}, word), stripe(Math.round(size * 0.1)))
      : h('span', {}, word),
  );
  return h(
    'div',
    { display: 'flex', flexWrap: 'wrap', columnGap: Math.round(size * 0.2), fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.035, color: INK },
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

/** A framework's element tile, as on its page: number, kind, and the symbol. */
function elementTile(element: NonNullable<OgCard['element']>): Node {
  const color = FW[element.color]!;
  const ink = FW_INK[element.color]!;
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      flex: 'none',
      width: 300,
      height: 300,
      padding: '26px 30px 30px',
      borderRadius: 30,
      border: `4px solid ${color}`,
      background: tint(color, 0.09),
    },
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
      h('span', { fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 34, color: ink }, String(element.number)),
      h('span', { fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: INK_3 }, element.kind),
    ),
    h('div', { display: 'flex', fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 150, lineHeight: 1, letterSpacing: -5, color: ink }, element.symbol),
  );
}

async function coverDataUrl(path: string): Promise<string> {
  const png = await sharp(path).resize(880, 462, { fit: 'cover', position: 'top' }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function renderCard(card: OgCard): Promise<Buffer> {
  const narrow = Boolean(card.image || card.element);
  const size = titleSize(card.title, narrow);

  const text = h(
    'div',
    { display: 'flex', flexDirection: 'column', gap: 26, flex: 1, minWidth: 0 },
    title(card.title, size, card.emphasis),
    card.dek ? h('div', { display: 'flex', fontFamily: 'Instrument Sans', fontWeight: 400, fontSize: narrow ? 28 : 32, lineHeight: 1.36, color: INK_2 }, clip(card.dek, narrow ? 150 : 190)) : null,
  );

  const cover: Node | null = card.image
    ? {
        type: 'img',
        props: {
          src: await coverDataUrl(card.image),
          width: 440,
          height: 231,
          style: { borderRadius: 14, border: `1px solid ${RULE}`, objectFit: 'cover' },
        },
      }
    : null;
  const aside = cover ?? (card.element ? elementTile(card.element) : null);
  const middle = h('div', { display: 'flex', alignItems: 'center', gap: 48, flex: 1 }, text, aside);

  const tree = h(
    'div',
    { width: W, height: H, display: 'flex', flexDirection: 'column', padding: PAD, background: PAPER, color: INK },
    h(
      'div',
      { display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'Instrument Sans', fontWeight: 600, fontSize: 22, letterSpacing: 0.5, color: INK_2 },
      mark(9),
      card.kicker.join('  ·  '),
    ),
    middle,
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 22, borderTop: `1px solid ${RULE}`, fontFamily: 'Instrument Sans', fontWeight: 400, fontSize: 21, color: INK_3 },
      card.note
        ? h(
            'div',
            { display: 'flex', alignItems: 'center', gap: 12 },
            card.note.dot ? h('div', { width: 10, height: 10, borderRadius: 5, background: FRESH }) : null,
            card.note.text,
          )
        : h('div', {}, ''),
      h('div', { display: 'flex' }, card.byline),
    ),
  );

  const svg = await satori(tree as Parameters<typeof satori>[0], { width: W, height: H, fonts: await loadFonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}
