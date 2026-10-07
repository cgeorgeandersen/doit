import { fieldCoverage } from '../../core/classify';
import { InvalidRule } from '../../core/match';
import type { Field, Rule, RuleTarget } from '../../core/model';
import {
  DEFAULT_PRIORITY,
  addRule,
  addValue,
  describeCondition,
  isSingleUtmRule,
  ruleReach,
  updateRule,
  type RuleDraft,
} from '../../core/workspace';
import { button, field as labeled, linkButton, meter, outcomeCell, pageHeader, select, utmText } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtInt, fmtPct } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';
import { MATCH_OPTIONS, PART_OPTIONS } from './utm-drawer';

const NEW_VALUE = '__new__';

export function rulesView(ctx: Ctx): HTMLElement {
  const { ws, results, params } = ctx;
  const editing = ws.rules.find((rule) => rule.id === params.get('rule'));
  const creating = ws.fields.find((f) => f.id === params.get('new'));
  const coverageByField = new Map(fieldCoverage(ws.fields, ws.utms, results).map((fc) => [fc.field.id, fc]));

  return h(
    'div',
    { class: 'view view-rules' },
    pageHeader(
      'Rules',
      'Rules are data, not code: when a UTM part matches a pattern, a classification gets a value. The lowest priority number wins, and a tie that disagrees is a conflict, never a guess. Every change saves a new version.',
      linkButton('New rule', hashFor('rules', { new: ws.fields[0]?.id }), { icon: 'plus', kind: 'primary' }),
    ),
    ...ws.fields.map((f) => {
      const fc = coverageByField.get(f.id)!;
      const rules = ws.rules
        .filter((rule) => rule.field === f.id)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.priority - b.priority || Number(a.id.slice(1)) - Number(b.id.slice(1)));
      return h(
        'section',
        { class: 'card rules-card' },
        h(
          'div',
          { class: 'card-head' },
          h('div', null, h('h2', null, f.name), h('p', { class: 'card-intro' }, f.description)),
          h('div', { class: 'rules-card-cover' }, h('span', { class: 'field-row-pct' }, `${fmtPct(fc.classified, ws.utms.length)} classified`),
            meter(fc.classified, ws.utms.length, `${f.name} classified`)),
        ),
        rules.length
          ? h('div', { class: 'table-wrap' }, h(
            'table',
            { class: 'rules-table' },
            h('thead', null, h('tr', null, h('th', null, 'Rule'), h('th', null, 'When'), h('th', null, 'Then'),
              h('th', { class: 'num' }, 'Priority'), h('th', { class: 'num' }, 'Matches now'), h('th', null, 'On'), h('th', null, h('span', { class: 'sr-only' }, 'Edit')))),
            h('tbody', null, ...rules.map((rule) => ruleRow(ctx, rule))),
          ))
          : h('p', { class: 'muted' }, 'No rules yet.'),
        h(
          'div',
          { class: 'values' },
          h('span', { class: 'field-label' }, 'Values'),
          ...f.values.map((v) => h('span', { class: 'value-chip' }, v)),
          valueAdder(ctx, f),
          linkButton('Add rule', hashFor('rules', { new: f.id }), { icon: 'plus', kind: 'ghost' }),
        ),
      );
    }),
    editing || creating ? ruleEditor(ctx, editing ?? null, (editing ? ws.fields.find((f) => f.id === editing.field) : creating)!) : null,
  );
}

function ruleRow(ctx: Ctx, rule: Rule): HTMLElement {
  const { ws, results } = ctx;
  let matches = '–';
  try {
    matches = fmtInt(ruleReach(ws, results, rule).utms.length);
  } catch {
    // a rule that no longer compiles matches nothing
  }
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(rule.active),
      'aria-label': `${rule.active ? 'Turn off' : 'Turn on'} ${rule.id}`,
      onclick: () =>
        ctx.commit(updateRule(ws, rule.id, { active: !rule.active }, ctx.now()),
          `${rule.id} is ${rule.active ? 'off' : 'on'}. That's version ${ws.versions.at(-1)!.number + 1}.`),
    },
    h('span', { class: 'switch-knob' }),
  );
  return h(
    'tr',
    { class: rule.active ? '' : 'is-off' },
    h('td', null, h('code', null, rule.id)),
    h('td', { class: 'rule-when' }, isSingleUtmRule(rule) ? h('span', null, 'this UTM only: ', utmText(keyParts(rule.pattern))) : describeCondition(rule)),
    h('td', null, h('strong', null, rule.value)),
    h('td', { class: 'num' }, fmtInt(rule.priority)),
    h('td', { class: 'num' }, matches),
    h('td', null, toggle),
    h('td', null, h('a', { href: hashFor('rules', { rule: rule.id }), class: 'link' }, 'Edit')),
  );
}

function keyParts(key: string) {
  const [source = '', medium = '', campaign = '', content = '', term = ''] = key.split(' | ');
  return { source, medium, campaign, content, term };
}

function valueAdder(ctx: Ctx, f: Field): HTMLElement {
  const input = h('input', { id: `add-value-${f.id}`, placeholder: 'New value', 'aria-label': `New ${f.name} value`, maxlength: 60 });
  const add = () => {
    try {
      ctx.commit(addValue(ctx.ws, f.id, input.value), `Added "${input.value.trim()}" to ${f.name}.`);
    } catch (e) {
      ctx.toast((e as Error).message);
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') add();
  });
  return h('span', { class: 'value-adder' }, input, button('Add', { onClick: add }));
}

function ruleEditor(ctx: Ctx, rule: Rule | null, f: Field): HTMLElement {
  const { ws, results } = ctx;
  const close = hashFor('rules');
  const fieldSelect = select(ws.fields.map((x) => [x.id, x.name] as const), f.id, {
    id: 'rule-field',
    disabled: Boolean(rule),
    onchange: () => ctx.go(hashFor('rules', { new: fieldSelect.value })),
  });
  const part = select(PART_OPTIONS, rule?.target ?? f.target, { id: 'rule-part', onchange: () => update() });
  const match = select(MATCH_OPTIONS, rule?.match ?? 'contains', { id: 'rule-match', onchange: () => update() });
  const pattern = h('input', { id: 'rule-pattern', value: rule?.pattern ?? '', placeholder: 'summer cup', oninput: () => update(), 'data-autofocus': true });
  const valueSelect = select([['', 'Choose a value…'], ...f.values.map((v) => [v, v] as const), [NEW_VALUE, '+ New value…']], rule?.value ?? '',
    { id: 'rule-value', onchange: () => update() });
  const newValue = h('input', { id: 'rule-new-value', placeholder: `New ${f.name.toLowerCase()} value`, oninput: () => update() });
  const newWrap = h('div', { class: 'new-value', hidden: true }, newValue);
  const priority = h('input', { id: 'rule-priority', type: 'number', min: 0, step: 1, value: rule?.priority ?? DEFAULT_PRIORITY, oninput: () => update() });
  const note = h('input', { id: 'rule-note', value: rule?.note ?? '', placeholder: 'Why this rule exists (optional)' });
  const test = h('div', { class: 'rule-test', 'aria-live': 'polite' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const save = button(rule ? 'Save changes' : 'Save rule', { kind: 'primary', icon: 'check', id: 'rule-save' });

  const draft = (): RuleDraft => ({
    field: f.id,
    target: part.value as RuleTarget,
    match: match.value as RuleDraft['match'],
    pattern: pattern.value,
    value: valueSelect.value === NEW_VALUE ? newValue.value.trim() : valueSelect.value,
    priority: Number(priority.value),
    note: note.value,
  });

  function update(): void {
    newWrap.hidden = valueSelect.value !== NEW_VALUE;
    error.textContent = '';
    const d = draft();
    if (!d.pattern.trim()) {
      test.replaceChildren(h('p', { class: 'muted' }, 'Type a pattern to see which UTMs it matches.'));
      save.disabled = true;
      return;
    }
    try {
      const r = ruleReach(ws, results, d);
      test.replaceChildren(
        h('p', { class: 'reach' }, icon('spark', 14),
          `Matches ${fmtInt(r.utms.length)} ${r.utms.length === 1 ? 'UTM' : 'UTMs'} (${fmtInt(r.sessions)} sessions); `
          + `${fmtInt(r.open)} of them don't have a ${f.name.toLowerCase()} yet.`),
        r.utms.length
          ? h('ul', { class: 'test-list' }, ...r.utms.slice(0, 8).map((u) =>
            h('li', null, utmText(u.raw), h('span', { class: 'test-now' }, outcomeCell(results.get(u.key)?.[f.id])))))
          : h('p', { class: 'muted' }, 'Nothing in the table matches it yet. It will catch future UTMs that do.'),
      );
      save.disabled = !d.value;
    } catch (e) {
      test.replaceChildren();
      error.textContent = (e as Error).message;
      save.disabled = true;
    }
  }

  save.addEventListener('click', () => {
    try {
      const d = draft();
      let next = ws;
      if (valueSelect.value === NEW_VALUE) next = addValue(next, f.id, d.value);
      next = rule ? updateRule(next, rule.id, d, ctx.now()) : addRule(next, d, ctx.now());
      if (next === ws) {
        ctx.toast('Nothing changed, so no new version.');
        return;
      }
      ctx.commit(next, `Version ${next.versions.at(-1)!.number} saved.`);
      ctx.go(close);
    } catch (e) {
      error.textContent = e instanceof InvalidRule ? e.message : `Couldn't save: ${(e as Error).message}`;
    }
  });

  const panel = h(
    'div',
    { class: 'drawer-layer' },
    h('a', { class: 'drawer-backdrop', href: close, 'aria-label': 'Close', tabindex: -1 }),
    h(
      'aside',
      { class: 'drawer', role: 'dialog', 'aria-labelledby': 'editor-title' },
      h('div', { class: 'drawer-head' },
        h('div', null, h('p', { class: 'eyebrow' }, rule ? `${rule.id} · written by ${rule.author}` : 'New rule'),
          h('h2', { id: 'editor-title', class: 'drawer-title' }, rule ? 'Edit rule' : `New ${f.name.toLowerCase()} rule`)),
        h('a', { class: 'drawer-close button button-ghost', href: close, 'aria-label': 'Close' }, icon('close', 18))),
      h('div', { class: 'form' },
        labeled('Classification', fieldSelect),
        h('fieldset', { class: 'scope' }, h('legend', { class: 'field-label' }, 'When'), h('div', { class: 'scope-rule' }, part, match, pattern)),
        labeled('Then set it to', valueSelect),
        newWrap,
        labeled('Priority', priority, 'Lower wins. 100 for general patterns, 10 for decisions about specific UTMs.'),
        labeled('Note', note),
        h('h3', { class: 'test-title' }, 'Test this rule'),
        test,
        error,
        h('div', { class: 'form-actions' }, save,
          rule ? button(rule.active ? 'Turn off' : 'Turn on', {
            onClick: () => {
              ctx.commit(updateRule(ws, rule.id, { active: !rule.active }, ctx.now()), `${rule.id} is ${rule.active ? 'off' : 'on'}.`);
              ctx.go(close);
            },
          }) : null,
          h('a', { class: 'button button-ghost', href: close }, 'Cancel')),
      ),
    ),
  );
  update();
  return panel;
}
