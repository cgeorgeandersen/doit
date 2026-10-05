/**
 * The frameworks as the browser sees them. Assessment.astro reads them from
 * the frameworks collection at build time and hands them over in two ways: a
 * data-frameworks attribute (title, symbol, color, page) and one <template>
 * per framework holding its ElementTile chip, so the chips drawn here are the
 * site's own component, styles included.
 */
import type { FrameworkInfo } from './model.ts';

export interface Frameworks {
  info(id: string): FrameworkInfo;
  /** A fresh copy of the framework's element chip. */
  chip(id: string): Node;
}

export function readFrameworks(root: HTMLElement): Frameworks {
  const map = JSON.parse(root.dataset.frameworks ?? '{}') as Record<string, FrameworkInfo>;
  return {
    info(id) {
      const framework = map[id];
      if (!framework) throw new Error(`The assessment names a framework the page doesn't know: "${id}"`);
      return framework;
    },
    chip(id) {
      const template = root.querySelector<HTMLTemplateElement>(`template[data-chip="${id}"]`);
      return template?.content.firstElementChild?.cloneNode(true) ?? document.createTextNode('');
    },
  };
}
