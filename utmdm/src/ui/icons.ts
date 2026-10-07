import { svg } from './dom';

// Simple 24×24 stroke icons, drawn for this app.
const CIRCLE = 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z';
const PATHS = {
  check: ['M20 6 9 17l-5-5'],
  classified: [CIRCLE, 'm8 12 3 3 5-6'],
  outstanding: [CIRCLE, 'M12 7v6', 'M12 16.5v.5'],
  conflict: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9'],
  refresh: ['M21 12a9 9 0 0 0-15.5-6.2L3 8', 'M3 3v5h5', 'M3 12a9 9 0 0 0 15.5 6.2L21 16', 'M16 16h5v5'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'm21 21-4.3-4.3'],
  restore: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  sun: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm6.3 17.7-1.4 1.4', 'm19.1 4.9-1.4 1.4'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm6 6 2.5 2.5', 'm15.5 15.5 2.5 2.5', 'm6 18 2.5-2.5', 'm15.5 8.5 2.5-2.5'],
  database: ['M21 5c0 1.7-4 3-9 3s-9-1.3-9-3 4-3 9-3 9 1.3 9 3z', 'M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5', 'M3 12c0 1.7 4 3 9 3s9-1.3 9-3'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  up: ['m18 15-6-6-6 6'],
  left: ['m15 18-6-6 6-6'],
  right: ['m9 18 6-6-6-6'],
  down: ['m6 9 6 6 6-6'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  columns: ['M3 4h18v16H3z', 'M9 4v16', 'M15 4v16'],
  link: ['M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 16): SVGSVGElement {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      class: `icon icon-${name}`,
    },
    ...PATHS[name].map((d) => svg('path', { d })),
  );
}
