type Attr = string | number | boolean | null | undefined | ((event: Event) => void);
export type Child = Node | string | number | null | undefined | false;

const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/)/i;

/**
 * Creates an element. Strings become text nodes, never HTML, so a UTM someone
 * typed can't inject markup. `on*` attributes that are functions become event
 * listeners; `true` sets a boolean attribute.
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

/** Replaces an element's children. */
export function fill(parent: Element, ...children: Array<Child | Child[]>): void {
  parent.replaceChildren();
  append(parent, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.append(...children);
  return el;
}
