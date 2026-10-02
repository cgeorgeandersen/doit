type Attr = string | number | boolean | null | undefined | ((event: Event) => void);

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|#)/i;
export type Child = Node | string | number | null | undefined | false;

/**
 * Creates an element. Strings become text nodes, never HTML, so data from
 * OpenStreetMap or any API can't inject markup. `on*` attributes that are
 * functions become event listeners; `true` sets a boolean attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, Attr> | null,
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    // Links can come from outside data (Wikidata, Open States): only web, email, phone and in-page links.
    else if (key === 'href' && !SAFE_HREF.test(String(value))) continue;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Element, children: Array<Child | Child[]>): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
}

/** Replaces an element's children, skipping empty ones. */
export function fill(parent: Element, ...children: Array<Child | Child[]>): void {
  parent.replaceChildren();
  append(parent, children);
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
