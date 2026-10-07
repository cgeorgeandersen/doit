import { classifyWorkspace, coverage, outstanding, utmStatus, type Outcome } from '../../core/classify';
import { InvalidRule } from '../../core/match';
import { UTM_PARTS, type Field, type RuleTarget, type Utm } from '../../core/model';
import { suggest } from '../../core/suggest';
import { OVERRIDE_PRIORITY, addRule, addValue, describeCondition, ruleReach, type RuleDraft } from '../../core/workspace';
import { button, field as labeled, select, statusChip, utmText } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtInt, seenRange } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';

export const MATCH_OPTIONS = [['exact', 'is'], ['contains', 'contains'], ['starts_with', 'starts with'], ['regex', 'matches regex']] as const;
export const PART_OPTIONS = [...UTM_PARTS.map((part) => [part, `utm_${part}`] as const), ['any', 'any part'] as const];
const NEW_VALUE = '__new__';

/** The side panel for one UTM: its parts, its traffic, and each classification with how it was decided. */
export function utmDrawer(ctx: Ctx, utm: Utm, closeHash: string): HTMLElement {
  const { ws, results } = ctx;
  const classification = results.get(utm.key) ?? {};
  const queue = outstanding(ws.utms, results);
  const nextUp = queue.find((u) => u.key !== utm.key);

  return h(
    'div',
    { class: 'drawer-layer' },
    h('a', { class: 'drawer-backdrop', href: closeHash, 'aria-label': 'Close', tabindex: -1 }),
    h(
      'aside',
      { class: 'drawer', role: 'dialog', 'aria-labelledby': 'drawer-title' },
      h(
        'div',
        { class: 'drawer-head' },
        h('div', null, h('p', { class: 'eyebrow' }, 'UTM ', statusChip(utmStatus(classification))),
          h('h2', { id: 'drawer-title', class: 'drawer-title' }, utmText(utm.raw))),
        h('a', { class: 'drawer-close button button-ghost', href: closeHash, 'aria-label': 'Close', 'data-autofocus': true }, icon('close', 18)),
      ),
      h('dl', { class: 'parts' }, ...UTM_PARTS.flatMap((part) => [h('dt', null, `utm_${part}`), h('dd', null, utm.raw[part] || '–')])),
      h('p', { class: 'drawer-stats' }, `${fmtInt(utm.sessions)} sessions · ${fmtInt(utm.keyEvents)} key events · seen ${seenRange(utm)}`),
      utm.spellings.length > 1
        ? h('details', { class: 'spellings' }, h('summary', null, `${utm.spellings.length} spellings merged into this UTM`),
          h('ul', null, ...utm.spellings.map((s) => h('li', null, h('code', null, s)))))
        : null,
      ...ws.fields.map((f) => fieldSection(ctx, utm, f, classification[f.id] ?? { status: 'outstanding', value: null, rules: [] })),
      h(
        'div',
        { class: 'drawer-foot' },
        nextUp
          ? h('a', { class: 'button button-secondary', href: hashFor('utms', { status: 'outstanding', utm: nextUp.key }) },
            'Next outstanding', icon('arrow', 16))
          : h('p', { class: 'muted' }, 'Nothing else is outstanding.'),
      ),
    ),
  );
}

function fieldSection(ctx: Ctx, utm: Utm, f: Field, outcome: Outcome): HTMLElement {
  let explanation: HTMLElement;
  if (outcome.status === 'classified') {
    explanation = h('div', { class: 'decided' },
      h('p', { class: 'decided-value' }, outcome.value),
      ...outcome.rules.map((rule) => h('p', { class: 'decided-by' }, h('code', null, rule.id), ` ${describeCondition(rule)} · priority ${rule.priority}`)));
  } else if (outcome.status === 'conflict') {
    explanation = h('div', { class: 'callout callout-conflict' },
      h('p', null, `These rules tie at priority ${outcome.rules[0]?.priority} and disagree, so ${f.name} stays empty instead of guessing:`),
      h('ul', null, ...outcome.rules.map((rule) => h('li', null, h('code', null, rule.id), ` ${describeCondition(rule)} → `, h('strong', null, rule.value)))),
      h('p', null, `A rule saved below uses priority ${OVERRIDE_PRIORITY}, so it settles the tie for every UTM it covers.`));
  } else {
    explanation = h('p', { class: 'callout callout-outstanding' },
      `No rule gives this UTM a ${f.name.toLowerCase()} yet. Choose one below: the rule you save also covers every UTM like it, now and in every future refresh.`);
  }
  const form = classifyForm(ctx, utm, f, outcome);
  return h(
    'section',
    { class: 'field-section' },
    h('div', { class: 'field-section-head' }, h('h3', null, f.name), statusChip(outcome.status)),
    explanation,
    outcome.status === 'classified' ? h('details', { class: 'change' }, h('summary', null, 'Change it'), form) : form,
  );
}

function classifyForm(ctx: Ctx, utm: Utm, f: Field, outcome: Outcome): HTMLElement {
  const { ws, results } = ctx;
  const id = (name: string) => `${name}-${f.id}`;
  const suggestions = outcome.status === 'classified' ? [] : suggest(utm, f, ws, results);
  const valueSelect = select(
    [['', 'Choose a value…'], ...f.values.map((v) => [v, v] as const), [NEW_VALUE, '+ New value…']],
    outcome.value ?? suggestions[0]?.value ?? '',
    { id: id('value'), onchange: () => update() },
  );
  const newValue = h('input', { id: id('new-value'), placeholder: `New ${f.name.toLowerCase()} value`, oninput: () => update() });
  const newWrap = h('div', { class: 'new-value', hidden: true }, newValue);

  const scope = (value: 'like' | 'one', label: string, checked: boolean) =>
    h('input', { type: 'radio', name: id('scope'), value, checked, 'aria-label': label, onchange: () => update() });
  const scopeLike = scope('like', 'Every UTM where', true);
  const scopeOne = scope('one', 'Only this UTM', false);
  const part = select(PART_OPTIONS, f.target, {
    id: id('part'),
    'aria-label': 'UTM part',
    onchange: () => {
      pattern.value = utm.parts[part.value as (typeof UTM_PARTS)[number]] ?? '';
      update();
    },
  });
  const match = select(MATCH_OPTIONS, 'exact', { id: id('match'), 'aria-label': 'Match', onchange: () => update() });
  const pattern = h('input', { id: id('pattern'), value: utm.parts[f.target], 'aria-label': 'Pattern', oninput: () => update() });
  const reach = h('p', { class: 'reach', 'aria-live': 'polite' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const save = button('Save rule', { kind: 'primary', icon: 'check', id: id('save') });

  const draft = (): RuleDraft => {
    const value = valueSelect.value === NEW_VALUE ? newValue.value.trim() : valueSelect.value;
    return scopeOne.checked
      ? { field: f.id, target: 'any', match: 'exact', pattern: utm.key, value, priority: OVERRIDE_PRIORITY, note: 'Classified one UTM' }
      : { field: f.id, target: part.value as RuleTarget, match: match.value as RuleDraft['match'], pattern: pattern.value, value,
        priority: OVERRIDE_PRIORITY, note: `Classified from ${utm.spellings[0]}` };
  };

  function update(): void {
    newWrap.hidden = valueSelect.value !== NEW_VALUE;
    for (const control of [part, match, pattern]) control.disabled = scopeOne.checked;
    const d = draft();
    error.textContent = '';
    try {
      const r = ruleReach(ws, results, d);
      reach.replaceChildren(icon('spark', 14),
        `Applies to ${fmtInt(r.utms.length)} ${r.utms.length === 1 ? 'UTM' : 'UTMs'} (${fmtInt(r.sessions)} sessions); `
        + `${fmtInt(r.open)} of them don't have a ${f.name.toLowerCase()} yet.`);
      save.disabled = !d.value || !r.utms.some((u) => u.key === utm.key);
      if (!r.utms.some((u) => u.key === utm.key)) error.textContent = "That pattern doesn't match this UTM.";
    } catch (e) {
      reach.textContent = '';
      error.textContent = (e as Error).message;
      save.disabled = true;
    }
  }

  save.addEventListener('click', () => {
    const d = draft();
    try {
      let next = ws;
      if (valueSelect.value === NEW_VALUE) next = addValue(next, f.id, d.value);
      next = addRule(next, d, ctx.now());
      const before = coverage(ws.utms, results).classified;
      const after = coverage(next.utms, classifyWorkspace(next)).classified;
      const gained = after - before;
      ctx.commit(next, `Version ${next.versions.at(-1)!.number} saved: ${f.name} is ${d.value}`
        + (gained > 0 ? `. ${fmtInt(gained)} more ${gained === 1 ? 'UTM is' : 'UTMs are'} fully classified.` : '.'));
    } catch (e) {
      error.textContent = e instanceof InvalidRule ? e.message : `Couldn't save: ${(e as Error).message}`;
    }
  });

  const form = h(
    'div',
    { class: 'classify' },
    suggestions.length
      ? h('div', { class: 'suggestions' }, h('p', { class: 'field-label' }, 'Suggested'),
        ...suggestions.map((s) =>
          h('button', {
            type: 'button',
            class: 'suggestion',
            onclick: () => {
              valueSelect.value = s.value;
              update();
            },
          }, h('span', { class: 'suggestion-value' }, s.value), h('span', { class: 'suggestion-why' }, `${s.score}% · ${s.reason}`))))
      : null,
    labeled(`${f.name} value`, valueSelect),
    newWrap,
    h(
      'fieldset',
      { class: 'scope' },
      h('legend', { class: 'field-label' }, 'Apply to'),
      h('label', { class: 'scope-option' }, scopeLike, h('span', null, 'Every UTM where')),
      h('div', { class: 'scope-rule' }, part, match, pattern),
      h('label', { class: 'scope-option' }, scopeOne, h('span', null, 'Only this UTM')),
    ),
    reach,
    error,
    save,
  );
  update();
  return form;
}
