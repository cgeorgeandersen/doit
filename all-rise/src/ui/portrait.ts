import type { Look } from '../core/types';
import { svg } from './dom';

/**
 * Draws a character from head to shoulders in a 100 by 110 box. The mouth has
 * an open and a closed shape; CSS flips between them while `.talking` is set.
 */
export function portrait(look: Look): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 100 110', class: 'portrait', 'aria-hidden': 'true' });
  if ('emoji' in look) {
    const text = svg('text', { x: 50, y: 78, 'text-anchor': 'middle', 'font-size': 64, class: 'emoji' });
    text.textContent = look.emoji;
    root.append(svg('g', { class: 'bob' }, text));
    return root;
  }
  const { skin, hair, hairStyle, shirt } = look;
  const extras = new Set(look.extras ?? []);
  const g = svg('g', { class: 'bob' });

  // Hair that falls behind the head.
  if (hairStyle === 'long') g.append(svg('path', { d: 'M26 44 C24 12 76 12 74 44 L78 80 L22 80 Z', fill: hair }));

  // Shoulders, collar and neck.
  g.append(svg('path', { d: 'M8 110 C8 82 26 72 50 72 C74 72 92 82 92 110 Z', fill: shirt }));
  if (extras.has('tie') || extras.has('bow')) g.append(svg('path', { d: 'M40 72 L50 88 L60 72 Z', fill: '#f3efe6' }));
  if (extras.has('tie')) g.append(svg('path', { d: 'M48 76 L52 76 L54 98 L50 102 L46 98 Z', fill: '#8c1c2b' }));
  if (extras.has('bow')) g.append(svg('path', { d: 'M40 74 L50 79 L60 74 L60 84 L50 79 L40 84 Z', fill: '#b23a3a' }));
  g.append(svg('rect', { x: 43, y: 58, width: 14, height: 15, rx: 4, fill: skin, class: 'neck' }));

  // Head and ears.
  g.append(svg('ellipse', { cx: 29, cy: 45, rx: 4, ry: 6, fill: skin }));
  g.append(svg('ellipse', { cx: 71, cy: 45, rx: 4, ry: 6, fill: skin }));
  g.append(svg('ellipse', { cx: 50, cy: 42, rx: 21, ry: 23, fill: skin }));

  // Hair on top.
  switch (hairStyle) {
    case 'short':
      g.append(svg('path', { d: 'M29 40 C27 14 73 14 71 40 C66 28 34 28 29 40 Z', fill: hair }));
      break;
    case 'long':
      g.append(svg('path', { d: 'M29 42 C27 14 73 14 71 42 C64 26 40 24 29 42 Z', fill: hair }));
      break;
    case 'bun':
      g.append(svg('circle', { cx: 50, cy: 15, r: 9, fill: hair }));
      g.append(svg('path', { d: 'M29 40 C27 15 73 15 71 40 C64 27 36 27 29 40 Z', fill: hair }));
      break;
    case 'curly':
      for (const [cx, cy] of [[32, 32], [38, 23], [47, 19], [56, 20], [64, 25], [69, 33], [30, 41], [70, 41]] as const)
        g.append(svg('circle', { cx, cy, r: 8, fill: hair }));
      break;
    case 'spiky':
      g.append(svg('path', { d: 'M28 40 L30 22 L36 28 L40 14 L46 24 L51 11 L56 23 L62 14 L65 27 L71 21 L72 40 C64 28 36 28 28 40 Z', fill: hair }));
      break;
    case 'gray':
      g.append(svg('path', { d: 'M28 46 C26 30 32 26 36 30 L34 46 Z M72 46 C74 30 68 26 64 30 L66 46 Z', fill: hair }));
      g.append(svg('path', { d: 'M38 24 C44 20 56 20 62 24', stroke: hair, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
      break;
    case 'bald':
      g.append(svg('ellipse', { cx: 42, cy: 26, rx: 6, ry: 3, fill: '#ffffff', opacity: 0.25 }));
      break;
  }

  // Face. The eyes blink on their own; the brows lift when the character talks.
  g.append(
    svg(
      'g',
      { class: 'brows' },
      svg('path', { d: 'M37 35 L46 34', stroke: '#2a1d17', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      svg('path', { d: 'M54 34 L63 35', stroke: '#2a1d17', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ),
  );
  g.append(
    svg(
      'g',
      { class: 'eyes' },
      svg('circle', { cx: 42, cy: 42, r: 2.4, fill: '#1b1411' }),
      svg('circle', { cx: 58, cy: 42, r: 2.4, fill: '#1b1411' }),
    ),
  );
  g.append(svg('path', { d: 'M50 44 L48 50 L51 50', stroke: '#00000033', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }));
  if (extras.has('beard')) g.append(svg('path', { d: 'M30 48 C32 66 42 68 50 68 C58 68 68 66 70 48 C64 60 36 60 30 48 Z', fill: hair }));
  g.append(svg('path', { d: 'M44 55 Q50 59 56 55', stroke: '#5a2a22', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', class: 'mouth-closed' }));
  g.append(svg('ellipse', { cx: 50, cy: 56, rx: 4.5, ry: 3.5, fill: '#5a2a22', class: 'mouth-open' }));
  if (extras.has('mustache')) g.append(svg('path', { d: 'M40 53 C44 49 48 50 50 52 C52 50 56 49 60 53 C56 55 52 54 50 53 C48 54 44 55 40 53 Z', fill: hair }));

  if (extras.has('glasses'))
    g.append(
      svg(
        'g',
        { fill: 'none', stroke: '#1f1f1f', 'stroke-width': 1.8 },
        svg('circle', { cx: 42, cy: 42, r: 6 }),
        svg('circle', { cx: 58, cy: 42, r: 6 }),
        svg('path', { d: 'M48 42 L52 42 M36 41 L30 40 M64 41 L70 40' }),
      ),
    );
  if (extras.has('earrings')) {
    g.append(svg('circle', { cx: 29, cy: 52, r: 2.2, fill: '#e2b84a' }));
    g.append(svg('circle', { cx: 71, cy: 52, r: 2.2, fill: '#e2b84a' }));
  }
  if (extras.has('cap')) {
    g.append(svg('path', { d: 'M27 34 C27 14 73 14 73 34 Z', fill: '#2c3550' }));
    g.append(svg('path', { d: 'M24 34 L76 34 L80 38 L24 38 Z', fill: '#1d2438' }));
    g.append(svg('circle', { cx: 50, cy: 26, r: 3.5, fill: '#e2b84a' }));
  }
  if (extras.has('headlamp')) {
    g.append(svg('rect', { x: 28, y: 29, width: 44, height: 4, rx: 2, fill: '#2b2b2b' }));
    g.append(svg('circle', { cx: 50, cy: 31, r: 5, fill: '#fff6c4', class: 'lamp' }));
  }

  root.append(g);
  return root;
}

/** A row of the public, drawn as simple silhouettes in muted colors. */
export function galleryRow(count: number, seed = 7): SVGSVGElement {
  const width = count * 40;
  const root = svg('svg', { viewBox: `0 0 ${width} 60`, class: 'gallery-row', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' });
  const tones = ['#3a2c26', '#43352e', '#2f2621', '#4b3b31', '#382a2a', '#2c2a33'];
  let s = seed;
  const next = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const x = i * 40 + 20 + (next() - 0.5) * 8;
    const head = 9 + next() * 3;
    const fill = tones[Math.floor(next() * tones.length)]!;
    root.append(
      svg(
        'g',
        { class: 'spectator', style: `--d:${(next() * 1.2).toFixed(2)}s` },
        svg('circle', { cx: x, cy: 26 - next() * 4, r: head, fill }),
        svg('path', { d: `M${x - 17} 60 C${x - 17} 42 ${x - 8} 38 ${x} 38 C${x + 8} 38 ${x + 17} 42 ${x + 17} 60 Z`, fill }),
      ),
    );
  }
  return root;
}
