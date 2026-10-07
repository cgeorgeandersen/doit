import type { Condition, MatchOp, Op, Rule, Table, UtmPart } from '../../core/model';
import { MATCH_OPS, UTM_PARTS } from '../../core/model';
import { displayUtm } from '../../core/normalize';
import { OP_LABEL } from '../../core/rules';
import { apply, cellOf, columnValues, coverage, previewRule, resolve, ruleReach, rulesFor, type Grid } from '../../core/table';
import { addRule, deleteRule, draftRule, moveRule, newId, updateRule } from '../../core/workspace';
import { button, emptyState, linkButton, pageHeader, select } from '../components';
import type { Ctx } from '../ctx';
import { fill, h, type Child } from '../dom';
import { fmtInt, fmtPct, plural } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';

interface Builder {
  editing: string | null;
  column: string;
  when: Condition[];
  value: string;
}

const PART_OPTIONS = UTM_PARTS.map((p) => [p, p] as const);
const OP_OPTIONS = MATCH_OPS.map((o) => [o, OP_LABEL[o]] as const);
const blankCondition = (part: UtmPart = 'campaign'): Condition => ({ part, op: 'contains', text: '' });

// Kept between renders, so a half-written rule survives a save elsewhere.
let builder: Builder | null = null;
let prefilled = '';

export function rulesView(ctx: Ctx): HTMLElement {
  const { table, grid, params } = ctx;
  prefill(table, params);
  if (!builder || !table.columns.some((c) => c.id === builder!.column)) {
    builder = { editing: null, column: table.columns[0]?.id ?? '', when: [blankCondition()], value: '' };
  }
  if (builder.editing && !table.rules.some((r) => r.id === builder!.editing)) builder.editing = null;

  const cov = coverage(table, grid);
  const reach = ruleReach(table, grid);

  return h(
    'div',
    { class: 'view view-rules' },
    pageHeader('Rules',
      'Write a rule once and it fills every matching UTM, including ones you add later. Within a column the rules are checked top to bottom, ' +
      'and the first one that matches fills the cell. A value typed in the table always beats a rule.'),
    table.columns.length
      ? builderCard(ctx)
      : emptyState('Add a column first', 'A rule fills a column, so start with one, like Channel or Type.',
        linkButton('Add a column', hashFor('table', { column: 'new' }), { icon: 'plus', kind: 'primary' })),
    ...table.columns.map((column) => {
      const rules = rulesFor(table, column.id);
      const c = cov.columns.find((x) => x.column.id === column.id)!;
      return h(
        'section',
        { class: 'card rule-group', id: `rules-${column.id}` },
        h('div', { class: 'card-head' },
          h('div', null, h('h2', null, column.name),
            h('p', { class: 'card-intro' }, `${fmtPct(c.filled, cov.utms)} filled: ${fmtInt(c.byRule)} by rules, ${fmtInt(c.typed)} typed, `,
              h('a', { href: hashFor('table', { empty: column.id }) }, `${fmtInt(cov.utms - c.filled)} empty`))),
          button(`Rule for ${column.name}`, {
            icon: 'plus',
            kind: 'ghost',
            onClick: () => {
              builder = { editing: null, column: column.id, when: [blankCondition(rules[0]?.when[0]?.part)], value: '' };
              ctx.render();
              focusBuilder();
            },
          })),
        rules.length
          ? h('ol', { class: 'rule-list' }, ...rules.map((rule, i) => ruleRow(ctx, rule, i, rules.length, reach.get(rule.id)!)))
          : h('p', { class: 'muted' }, `No rules yet, so every ${column.name} is typed by hand.`),
      );
    }),
  );
}

function prefill(table: Table, params: URLSearchParams): void {
  const key = params.toString();
  if (!key) prefilled = '';
  if (!key || key === prefilled) return;
  prefilled = key;
  const editing = table.rules.find((r) => r.id === params.get('edit'));
  if (editing) {
    builder = { editing: editing.id, column: editing.column, when: editing.when.map((c) => ({ ...c })), value: editing.value };
    return;
  }
  const column = params.get('column');
  if (!table.columns.some((c) => c.id === column)) return;
  const part = (UTM_PARTS as readonly string[]).includes(params.get('part') ?? '') ? params.get('part') as UtmPart : 'campaign';
  const op = (MATCH_OPS as readonly string[]).includes(params.get('op') ?? '') ? params.get('op') as MatchOp : 'contains';
  builder = { editing: null, column: column!, when: [{ part, op, text: params.get('text') ?? '' }], value: params.get('value') ?? '' };
}

function focusBuilder(): void {
  requestAnimationFrame(() => {
    const card = document.getElementById('builder');
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const empty = [...(card?.querySelectorAll<HTMLInputElement>('input') ?? [])].find((i) => !i.value);
    (empty ?? card?.querySelector<HTMLInputElement>('input'))?.focus();
  });
}

/** "If [campaign] [contains] [cup] then [Type] is [Marketing]", with a live preview of what it would do. */
function builderCard(ctx: Ctx): HTMLElement {
  const { table, grid } = ctx;
  const b = builder!;
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const values = h('datalist', { id: 'rule-values' });
  const fillValues = () => fill(values, ...columnValues(table, b.column).map((v) => h('option', { value: v })));
  fillValues();

  const draft = (): Rule => draftRule(table, b, b.editing ?? newId(ctx.book, 'r'));
  const update = () => {
    error.textContent = '';
    renderPreview(preview, table, grid, draft());
  };
  const rebuild = (focus?: string) => {
    const next = builderCard(ctx);
    document.getElementById('builder')?.replaceWith(next);
    if (focus) next.querySelector<HTMLElement>(focus)?.focus();
  };

  const conditionRows = b.when.map((condition, i) => h(
    'div',
    { class: 'sentence-row' },
    h('span', { class: 'word' }, i === 0 ? 'If' : 'and'),
    select(PART_OPTIONS, condition.part, {
      'aria-label': `Condition ${i + 1}: which part of the UTM`,
      onchange: (e: Event) => {
        condition.part = (e.target as HTMLSelectElement).value as UtmPart;
        update();
      },
    }),
    select(OP_OPTIONS, condition.op, {
      'aria-label': `Condition ${i + 1}: how it matches`,
      onchange: (e: Event) => {
        condition.op = (e.target as HTMLSelectElement).value as MatchOp;
        update();
      },
    }),
    h('input', {
      class: `cond-text cond-${i}`,
      value: condition.text,
      placeholder: i === 0 ? 'cup' : 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': `Condition ${i + 1}: text`,
      oninput: (e: Event) => {
        condition.text = (e.target as HTMLInputElement).value;
        update();
      },
    }),
    b.when.length > 1
      ? button(null, {
        kind: 'ghost', icon: 'close', label: `Remove condition ${i + 1}`, title: 'Remove this condition',
        onClick: () => {
          b.when.splice(i, 1);
          rebuild('.cond-0');
        },
      })
      : null,
  ));

  const columnSelect = select(ctx.table.columns.map((c) => [c.id, c.name] as const), b.column, {
    'aria-label': 'Column the rule fills',
    onchange: (e: Event) => {
      b.column = (e.target as HTMLSelectElement).value;
      fillValues();
      update();
    },
  });
  const valueInput = h('input', {
    class: 'rule-value',
    value: b.value,
    list: 'rule-values',
    placeholder: 'Marketing',
    autocomplete: 'off',
    'aria-label': 'Value the rule fills in',
    oninput: (e: Event) => {
      b.value = (e.target as HTMLInputElement).value;
      update();
    },
  });

  const save = (event: Event) => {
    event.preventDefault();
    const result = b.editing ? updateRule(table, b.editing, b) : addRule(ctx.book, b);
    if (result.problem) {
      error.textContent = result.problem;
      return;
    }
    const delta = filledDelta(table, grid, result.op, result.rule.column);
    const effect = delta > 0 ? ` It fills ${plural(delta, 'more cell')}.` : delta < 0 ? ` ${plural(-delta, 'cell')} went back to empty.` : '';
    const kept = builder;
    builder = { editing: null, column: b.column, when: [blankCondition(b.when[0]?.part)], value: '' };
    if (ctx.params.size) ctx.go(hashFor('rules'));
    const version = ctx.commit(result, { message: `Saved as version ${ctx.version + 1}. ${result.summary}.${effect}` });
    if (version === null) {
      builder = kept;
      ctx.toast('That rule is already there, unchanged.');
    }
  };

  const card = h(
    'form',
    { class: `card builder${b.editing ? ' is-editing' : ''}`, id: 'builder', onsubmit: save },
    h('div', { class: 'card-head' }, h('h2', null, b.editing ? 'Edit rule' : 'New rule'),
      h('p', { class: 'card-intro' }, 'Matching ignores capitals, spaces and URL encoding.')),
    h('div', { class: 'sentence' },
      ...conditionRows,
      h('div', { class: 'sentence-row' },
        button('and…', {
          kind: 'ghost', icon: 'plus', title: 'Add a condition: every condition has to match',
          onClick: () => {
            b.when.push(blankCondition(b.when.at(-1)?.part === 'campaign' ? 'medium' : 'campaign'));
            rebuild(`.cond-${b.when.length - 1}`);
          },
        })),
      h('div', { class: 'sentence-row' }, h('span', { class: 'word' }, 'then'), columnSelect, h('span', { class: 'word' }, 'is'), valueInput, values)),
    preview,
    error,
    h('div', { class: 'form-actions' },
      button(b.editing ? 'Save rule' : 'Add rule', { kind: 'primary', type: 'submit', icon: b.editing ? 'check' : 'plus' }),
      b.editing || b.when.some((c) => c.text) || b.value
        ? button(b.editing ? 'Cancel' : 'Clear', {
          kind: 'ghost',
          onClick: () => {
            builder = { editing: null, column: b.column, when: [blankCondition()], value: '' };
            if (ctx.params.size) ctx.go(hashFor('rules'));
            else rebuild();
          },
        })
        : null),
  );
  renderPreview(preview, table, grid, draft());
  return card;
}

/** How many more cells in the column have a value after the change (negative: fewer). */
function filledDelta(table: Table, grid: Grid, op: Op, column: string): number {
  const next = apply(table, op, () => undefined);
  const nextGrid = resolve(next);
  const filled = (t: Table, g: Grid) => t.utms.filter((u) => cellOf(g, u.key, column).from !== 'empty').length;
  return filled(next, nextGrid) - filled(table, grid);
}

function renderPreview(host: HTMLElement, table: Table, grid: Grid, rule: Rule): void {
  const ready = !rule.when.some((c) => !c.text) && rule.value;
  if (!rule.when.some((c) => c.text)) {
    fill(host, h('p', { class: 'muted' }, 'Type what the UTM should contain to see which UTMs it matches.'));
    return;
  }
  const p = previewRule(table, grid, rule);
  const column = table.columns.find((c) => c.id === rule.column)?.name ?? '';
  const lines: Child[] = [];
  if (!p.matches.length) {
    fill(host, h('p', { class: 'preview-head' }, icon('outstanding', 14), 'Matches no UTMs yet. It will still fill any that arrive later.'));
    return;
  }
  if (ready) {
    lines.push(h('li', null, h('strong', null, plural(p.fillsEmpty, 'empty cell')), ` would get ${rule.value}`));
    if (p.changes) lines.push(h('li', null, h('strong', null, plural(p.changes, 'cell')), ' would change from another value'));
    if (p.completes) lines.push(h('li', null, h('strong', null, plural(p.completes, 'UTM')), ' would become fully classified'));
  }
  if (p.takenAbove) lines.push(h('li', null, `${plural(p.takenAbove, 'match', 'matches')} keep${p.takenAbove === 1 ? 's' : ''} the value from a rule above it`,
    ' (move this rule up to make it win)'));
  if (p.typed) lines.push(h('li', null, `${plural(p.typed, 'match', 'matches')} keep${p.typed === 1 ? 's' : ''} a typed value`));
  const broad = p.matches.length === table.utms.length && table.utms.length > 3;
  fill(
    host,
    h('p', { class: 'preview-head' }, icon('bolt', 14), `Matches ${plural(p.matches.length, 'UTM')}${ready ? '' : '. Add the value to see what it fills'}.`),
    lines.length ? h('ul', { class: 'preview-lines' }, ...lines) : null,
    broad ? h('p', { class: 'preview-warn' }, icon('outstanding', 14), `It matches every UTM. A rule this broad fills ${column} for things it was never meant to.`) : null,
    h('ul', { class: 'preview-examples' }, ...p.matches.slice(0, 6).map((u) => {
      const now = cellOf(grid, u.key, rule.column);
      return h('li', null, h('span', { class: 'utm' }, displayUtm(u.raw)),
        h('span', { class: 'preview-now' }, now.value ? `now ${now.value}` : 'now empty'));
    }), p.matches.length > 6 ? h('li', { class: 'muted' }, `and ${fmtInt(p.matches.length - 6)} more`) : null),
  );
}

function ruleRow(ctx: Ctx, rule: Rule, i: number, count: number, reach: { matches: number; fills: number }): HTMLElement {
  const { table } = ctx;
  const shadowed = reach.matches - reach.fills;
  return h(
    'li',
    { class: `rule-row${builder?.editing === rule.id ? ' is-editing' : ''}` },
    h('span', { class: 'rule-n', 'aria-hidden': 'true' }, String(i + 1)),
    h('p', { class: 'rule-sentence' },
      ...rule.when.flatMap((c, j) => [j ? ' and ' : 'If ', h('b', null, c.part), ` ${OP_LABEL[c.op]} `, h('code', null, c.text)]),
      ' → ', h('strong', { class: 'rule-value-text' }, rule.value)),
    h('span', {
      class: 'rule-reach',
      title: `Matches ${plural(reach.matches, 'UTM')}. ${shadowed ? `${fmtInt(shadowed)} of them keep a value from a rule above or a typed value.` : 'It fills every one.'}`,
    }, `fills ${fmtInt(reach.fills)}`, shadowed ? h('span', { class: 'muted' }, ` of ${fmtInt(reach.matches)}`) : null),
    h('span', { class: 'rule-actions' },
      button(null, { kind: 'ghost', icon: 'up', label: 'Move up', title: 'Move up', disabled: i === 0, onClick: () => ctx.commit(moveRule(table, rule.id, -1)) }),
      button(null, { kind: 'ghost', icon: 'down', label: 'Move down', title: 'Move down', disabled: i === count - 1, onClick: () => ctx.commit(moveRule(table, rule.id, 1)) }),
      button('Edit', {
        kind: 'ghost',
        onClick: () => {
          builder = { editing: rule.id, column: rule.column, when: rule.when.map((c) => ({ ...c })), value: rule.value };
          ctx.render();
          focusBuilder();
        },
      }),
      button(null, { kind: 'ghost', icon: 'trash', label: 'Delete rule', title: 'Delete', onClick: () => ctx.commit(deleteRule(table, rule.id)) })),
  );
}
