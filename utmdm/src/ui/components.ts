import type { Outcome, Status } from '../core/classify';
import type { UtmParts } from '../core/model';
import { UTM_PARTS } from '../core/model';
import { h, type Child } from './dom';
import { fmtPct, share } from './format';
import { icon, type IconName } from './icons';

const STATUS_LABEL: Record<Status, string> = {
  classified: 'Classified',
  outstanding: 'Outstanding',
  conflict: 'Conflict',
};

/** A status always comes with an icon and a word, never color alone. */
export function statusChip(status: Status, text = STATUS_LABEL[status]): HTMLElement {
  return h('span', { class: `chip chip-${status}` }, icon(status, 14), text);
}

/** A classification cell: the value, or the state that needs attention. */
export function outcomeCell(outcome: Outcome | undefined): HTMLElement {
  if (outcome?.status === 'classified') return h('span', { class: 'cell-value' }, outcome.value);
  return statusChip(outcome?.status ?? 'outstanding', outcome?.status === 'conflict' ? 'Conflict' : 'Needed');
}

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

export function statTile(label: string, value: string, detail?: Child | Child[], tone?: Status): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('p', { class: 'stat-label' }, tone ? icon(tone, 15) : null, label),
    h('p', { class: 'stat-value' }, value),
    detail ? h('p', { class: 'stat-detail' }, detail) : null,
  );
}

export function pageHeader(title: string, subtitle: Child | Child[], ...actions: Child[]): HTMLElement {
  return h(
    'header',
    { class: 'page-header' },
    h('div', { class: 'page-heading' }, h('h1', null, title), h('p', { class: 'page-subtitle' }, subtitle)),
    actions.length ? h('div', { class: 'page-actions' }, ...actions) : null,
  );
}

interface ButtonOptions {
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: (event: Event) => void;
  disabled?: boolean;
  title?: string;
  id?: string;
  type?: 'button' | 'submit';
  busy?: boolean;
}

export function button(label: Child, options: ButtonOptions = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: options.type ?? 'button',
      class: `button button-${options.kind ?? 'secondary'}${options.busy ? ' is-busy' : ''}`,
      onclick: options.onClick,
      disabled: options.disabled,
      title: options.title,
      id: options.id,
      'aria-busy': options.busy ? 'true' : null,
    },
    options.icon ? icon(options.icon) : null,
    label,
  );
}

export function linkButton(label: Child, href: string, options: Pick<ButtonOptions, 'icon' | 'kind' | 'title'> = {}): HTMLAnchorElement {
  return h('a', { href, class: `button button-${options.kind ?? 'secondary'}`, title: options.title }, label,
    options.icon ? icon(options.icon) : null);
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

/** A UTM's parts in a row, as written: source / medium / campaign / content / term. */
export function utmText(parts: UtmParts, className = 'utm'): HTMLElement {
  const shown = [...UTM_PARTS];
  while (shown.length > 3 && !parts[shown[shown.length - 1]!].trim()) shown.pop();
  return h(
    'span',
    { class: className },
    ...shown.flatMap((part, i) => [
      i ? h('span', { class: 'utm-sep', 'aria-hidden': 'true' }, ' / ') : null,
      h('span', { class: `utm-part${parts[part] ? '' : ' is-empty'}`, title: `utm_${part}` }, parts[part] || '–'),
    ]),
  );
}

export function emptyState(title: string, text: Child): HTMLElement {
  return h('div', { class: 'empty' }, icon('classified', 28), h('p', { class: 'empty-title' }, title), h('p', null, text));
}
