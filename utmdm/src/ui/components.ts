import { h, type Child } from './dom';
import { fmtPct, share } from './format';
import { icon, type IconName } from './icons';

/** A share against a whole: the fill and its track are two steps of the same color. */
export function meter(part: number, whole: number, label: string, size: 'big' | 'small' = 'small'): HTMLElement {
  const fill = h('span', { class: 'meter-fill' });
  fill.style.width = `${(share(part, whole) * 100).toFixed(2)}%`;
  return h(
    'div',
    {
      class: `meter meter-${size}`,
      role: 'meter',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(share(part, whole) * 100),
      'aria-valuetext': fmtPct(part, whole),
    },
    fill,
  );
}

export function pageHeader(title: string, subtitle: Child | Child[], ...actions: Child[]): HTMLElement {
  return h(
    'header',
    { class: 'page-header' },
    h('div', { class: 'page-heading' }, h('h1', null, title), h('p', { class: 'page-subtitle' }, subtitle)),
    actions.some(Boolean) ? h('div', { class: 'page-actions' }, ...actions) : null,
  );
}

interface ButtonOptions {
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: (event: Event) => void;
  disabled?: boolean;
  title?: string;
  label?: string;
  id?: string;
  type?: 'button' | 'submit';
}

export function button(text: Child, options: ButtonOptions = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: options.type ?? 'button',
      class: `button button-${options.kind ?? 'secondary'}${text ? '' : ' button-icon'}`,
      onclick: options.onClick,
      disabled: options.disabled,
      title: options.title,
      'aria-label': options.label,
      id: options.id,
    },
    options.icon ? icon(options.icon) : null,
    text,
  );
}

export function linkButton(text: Child, href: string, options: Pick<ButtonOptions, 'icon' | 'kind' | 'title'> = {}): HTMLAnchorElement {
  return h('a', { href, class: `button button-${options.kind ?? 'secondary'}`, title: options.title },
    options.icon ? icon(options.icon) : null, text);
}

export function select(
  options: readonly (readonly [string, string])[],
  value: string,
  attrs: Record<string, string | boolean | ((event: Event) => void) | undefined> = {},
): HTMLSelectElement {
  const el = h('select', attrs, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  el.value = value;
  return el;
}

/** A labeled control. */
export function field(label: string, control: HTMLElement, hint?: Child): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function emptyState(title: string, text: Child | Child[], ...actions: Child[]): HTMLElement {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), h('p', null, text),
    actions.length ? h('div', { class: 'empty-actions' }, ...actions) : null);
}

/** A panel that slides in from the right. Escape or the backdrop goes to `closeHref`. */
export function drawer(title: Child, closeHref: string, ...body: Child[]): HTMLElement {
  return h(
    'div',
    { class: 'drawer-layer' },
    h('a', { class: 'drawer-backdrop', href: closeHref, 'aria-label': 'Close', tabindex: -1 }),
    h(
      'aside',
      { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' },
      h('div', { class: 'drawer-head' }, h('h2', { class: 'drawer-title', id: 'drawer-title' }, title),
        h('a', { class: 'button button-ghost drawer-close', href: closeHref, 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close'))),
      ...body,
    ),
  );
}
