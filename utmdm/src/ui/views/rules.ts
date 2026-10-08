import type { Condition, MatchOp, Op, Rule, Table, UtmPart } from '../../core/model';
import { MATCH_OPS, REMOVE, UTM_PARTS } from '../../core/model';
import { displayUtm } from '../../core/normalize';
import { OP_LABEL, needsText, removes } from '../../core/rules';
import { apply, cellOf, columnValues, coverage, keptUtms, previewRule, resolve, ruleReach, rulesFor, type Grid } from '../../core/table';
import { addRule, deleteRule, draftRule, moveRule, newId, updateRule } from '../../core/workspace';
import { button, emptyState, linkButton, pageHeader, select } from '../components';
import type { Ctx } from '../ctx';
import { fill, h, type Child } from '../dom';
import { fmtInt, fmtPct, plural } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';

interface Builder {
  editing: string | null;
  /** A column id, or REMOVE. */
  column: string;
  when: Condition[];
  value: string;
  match: 'all' | 'any';
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
  if (!builder || (builder.column !== REMOVE && !table.columns.some((c) => c.id === builder!.column))) {
    builder = { editing: null, column: table.columns[0]?.id ?? REMOVE, when: [blankCondition()], value: '', match: 'all' };
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
    table.columns.length || table.utms.length
      ? h('div', { class: 'split' },
        h('div', { class: 'split-side' }, builderCard(ctx)),
        h('div', { class: 'split-main' }, ...groups(), removalGroup()))
      : emptyState('Add a column first', 'A rule fills a column, so start with one, like Channel or Type.',
        linkButton('Add a column', hashFor('table', { column: 'new' }), { icon: 'plus', kind: 'primary' })),
  );

  function groups(): HTMLElement[] {
    return table.columns.map((column) => {
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
              builder = { editing: null, column: column.id, when: [blankCondition(rules[0]?.when[0]?.part)], value: '', match: 'all' };
              ctx.render();
              focusBuilder();
            },
          })),
        rules.length
          ? h('ol', { class: 'rule-list' }, ...rules.map((rule, i) => ruleRow(ctx, rule, i, rules.length, reach.get(rule.id)!)))
          : h('p', { class: 'muted' }, `No rules yet, so every ${column.name} is typed by hand.`),
      );
    });
  }

  /** Rules that take rows out of the table, like "if campaign is blank and content is blank". */
  function removalGroup(): HTMLElement {
    const rules = rulesFor(table, REMOVE);
    return h(
      'section',
      { class: 'card rule-group rule-group-remove', id: 'rules-remove' },
      h('div', { class: 'card-head' },
        h('div', null, h('h2', null, 'Removed rows'),
          h('p', { class: 'card-intro' }, cov.removed
            ? `${plural(cov.removed, 'UTM')} taken out of the table, its coverage and its exports. They stay stored: delete a rule and they come back.`
            : 'Take UTMs you never want to classify out of the table, like tests or ones with no campaign. They stay stored, so deleting the rule brings them back.')),
        button('Removal rule', {
          icon: 'plus',
          kind: 'ghost',
          onClick: () => {
            builder = { editing: null, column: REMOVE, when: [{ part: 'campaign', op: 'blank', text: '' }], value: '', match: 'all' };
            ctx.render();
            focusBuilder();
          },
        })),
      rules.length
        ? h('ol', { class: 'rule-list' }, ...rules.map((rule, i) => ruleRow(ctx, rule, i, rules.length, reach.get(rule.id)!)))
        : h('p', { class: 'muted' }, 'No removal rules yet, so every UTM added stays in the table.'),
    );
  }
}

function prefill(table: Table, params: URLSearchParams): void {
  const key = params.toString();
  if (!key) prefilled = '';
  if (!key || key === prefilled) return;
  prefilled = key;
  const editing = table.rules.find((r) => r.id === params.get('edit'));
  if (editing) {
    builder = { editing: editing.id, column: editing.column, when: editing.when.map((c) => ({ ...c })), value: editing.value, match: editing.match ?? 'all' };
    return;
  }
  const column = params.get('column');
  if (!table.columns.some((c) => c.id === column)) return;
  const part = (UTM_PARTS as readonly string[]).includes(params.get('part') ?? '') ? params.get('part') as UtmPart : 'campaign';
  const op = (MATCH_OPS as readonly string[]).includes(params.get('op') ?? '') ? params.get('op') as MatchOp : 'contains';
  builder = { editing: null, column: column!, when: [{ part, op, text: params.get('text') ?? '' }], value: params.get('value') ?? '', match: 'all' };
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

  const joiner = (i: number) => i === 0
    ? h('span', { class: 'word' }, 'If')
    : select([['all', 'and'], ['any', 'or']] as const, b.match, {
      class: 'joiner',
      'aria-label': 'Every condition has to match (and), or any one of them (or)',
      title: '"and": every condition has to match. "or": any one of them is enough.',
      onchange: (e: Event) => {
        b.match = (e.target as HTMLSelectElement).value === 'any' ? 'any' : 'all';
        rebuild();
      },
    });
  const conditionRows = b.when.map((condition, i) => h(
    'div',
    { class: 'sentence-row' },
    joiner(i),
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
        const was = needsText(condition.op);
        condition.op = (e.target as HTMLSelectElement).value as MatchOp;
        if (was !== needsText(condition.op)) rebuild(`.cond-${i}`);
        else update();
      },
    }),
    needsText(condition.op) ? h('input', {
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
    }) : null,
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

  const columnSelect = select([...ctx.table.columns.map((c) => [c.id, c.name] as const), [REMOVE, 'remove the row'] as const], b.column, {
    'aria-label': 'What the rule does: the column it fills, or remove the row',
    onchange: (e: Event) => {
      const wasRemove = b.column === REMOVE;
      b.column = (e.target as HTMLSelectElement).value;
      if (wasRemove !== (b.column === REMOVE)) {
        rebuild();
        return;
      }
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
    const effect = removes(result.rule) ? removedEffect(table, result.op) : filledEffect(table, grid, result.op, result.rule.column);
    const kept = builder;
    builder = { editing: null, column: b.column, when: [blankCondition(b.when[0]?.part)], value: '', match: 'all' };
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
      h('div', { class: 'sentence-row add-condition' },
        // With one condition, either way is open. After that a rule is all "and" or all "or"; the word between conditions switches it.
        ...(b.when.length === 1 ? (['all', 'any'] as const) : [b.match]).map((match) => button(match === 'any' ? 'or' : 'and', {
          kind: 'ghost',
          icon: 'plus',
          title: match === 'any' ? 'Add a condition: any one of them is enough' : 'Add a condition: every one has to match',
          onClick: () => {
            b.match = match;
            b.when.push(blankCondition(b.when.at(-1)?.part === 'campaign' ? 'medium' : 'campaign'));
            rebuild(`.cond-${b.when.length - 1}`);
          },
        })),
        b.when.length > 1 ? h('span', { class: 'add-condition-hint' }, b.match === 'any' ? 'Any one condition is enough.' : 'Every condition has to match.') : null),
      b.column === REMOVE
        ? h('div', { class: 'sentence-row' }, h('span', { class: 'word' }, 'then'), columnSelect)
        : h('div', { class: 'sentence-row' }, h('span', { class: 'word' }, 'then'), columnSelect, h('span', { class: 'word' }, 'is'), valueInput, values)),
    preview,
    error,
    h('div', { class: 'form-actions' },
      button(b.editing ? 'Save rule' : 'Add rule', { kind: 'primary', type: 'submit', icon: b.editing ? 'check' : 'plus' }),
      b.editing || b.when.some((c) => c.text) || b.value
        ? button(b.editing ? 'Cancel' : 'Clear', {
          kind: 'ghost',
          onClick: () => {
            builder = { editing: null, column: b.column, when: [blankCondition()], value: '', match: 'all' };
            if (ctx.params.size) ctx.go(hashFor('rules'));
            else rebuild();
          },
        })
        : null),
  );
  renderPreview(preview, table, grid, draft());
  return card;
}

/** What saving a fill rule did to its column, as a sentence for the message. */
function filledEffect(table: Table, grid: Grid, op: Op, column: string): string {
  const next = apply(table, op, () => undefined);
  const nextGrid = resolve(next);
  const filled = (t: Table, g: Grid) => keptUtms(t).filter((u) => cellOf(g, u.key, column).from !== 'empty').length;
  const delta = filled(next, nextGrid) - filled(table, grid);
  return delta > 0 ? ` It fills ${plural(delta, 'more cell')}.` : delta < 0 ? ` ${plural(-delta, 'cell')} went back to empty.` : '';
}

/** What saving a remove rule did to the table, as a sentence for the message. */
function removedEffect(table: Table, op: Op): string {
  const delta = keptUtms(table).length - keptUtms(apply(table, op, () => undefined)).length;
  return delta > 0 ? ` It removes ${plural(delta, 'UTM')} from the table.` : delta < 0 ? ` ${plural(-delta, 'UTM')} came back.` : '';
}

function renderPreview(host: HTMLElement, table: Table, grid: Grid, rule: Rule): void {
  const complete = rule.when.every((c) => !needsText(c.op) || c.text);
  const ready = complete && (removes(rule) || rule.value);
  if (!rule.when.some((c) => !needsText(c.op) || c.text)) {
    fill(host, h('p', { class: 'muted' }, 'Type what the UTM should contain to see which UTMs it matches.'));
    return;
  }
  const p = previewRule(table, grid, rule);
  if (removes(rule)) {
    fill(
      host,
      h('p', { class: 'preview-head' }, icon('trash', 14), p.matches.length
        ? `Matches ${plural(p.matches.length, 'UTM')}. ${p.removes ? `${plural(p.removes, 'UTM')} would leave the table.` : 'They are already removed by another rule.'}`
        : 'Matches no UTMs yet. It will still remove any that arrive later.'),
      p.matches.length === table.utms.length && table.utms.length > 3
        ? h('p', { class: 'preview-warn' }, icon('outstanding', 14), 'It matches every UTM, so it would empty the table.')
        : null,
      p.matches.length
        ? h('ul', { class: 'preview-examples' }, ...p.matches.slice(0, 6).map((u) => h('li', null, h('span', { class: 'utm' }, displayUtm(u.raw)))),
          p.matches.length > 6 ? h('li', { class: 'muted' }, `and ${fmtInt(p.matches.length - 6)} more`) : null)
        : null,
    );
    return;
  }
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
  const broad = p.matches.length === keptUtms(table).length && keptUtms(table).length > 3;
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
      ...rule.when.flatMap((c, j) => [j ? (rule.match === 'any' ? ' or ' : ' and ') : 'If ', h('b', null, c.part), ` ${OP_LABEL[c.op]}`,
        needsText(c.op) ? [' ', h('code', null, c.text)] : null]),
      ' → ', removes(rule) ? h('strong', { class: 'rule-remove-text' }, 'remove the row') : h('strong', { class: 'rule-value-text' }, rule.value)),
    h('span', {
      class: 'rule-reach',
      title: removes(rule)
        ? `Matches ${plural(reach.matches, 'UTM')}. ${shadowed ? `${fmtInt(shadowed)} of them are removed by a rule above.` : 'It removes every one.'}`
        : `Matches ${plural(reach.matches, 'UTM')}. ${shadowed ? `${fmtInt(shadowed)} of them keep a value from a rule above or a typed value.` : 'It fills every one.'}`,
    }, `${removes(rule) ? 'removes' : 'fills'} ${fmtInt(reach.fills)}`, shadowed ? h('span', { class: 'muted' }, ` of ${fmtInt(reach.matches)}`) : null),
    h('span', { class: 'rule-actions' },
      button(null, { kind: 'ghost', icon: 'up', label: 'Move up', title: 'Move up', disabled: i === 0, onClick: () => ctx.commit(moveRule(table, rule.id, -1)) }),
      button(null, { kind: 'ghost', icon: 'down', label: 'Move down', title: 'Move down', disabled: i === count - 1, onClick: () => ctx.commit(moveRule(table, rule.id, 1)) }),
      button('Edit', {
        kind: 'ghost',
        onClick: () => {
          builder = { editing: rule.id, column: rule.column, when: rule.when.map((c) => ({ ...c })), value: rule.value, match: rule.match ?? 'all' };
          ctx.render();
          focusBuilder();
        },
      }),
      button(null, { kind: 'ghost', icon: 'trash', label: 'Delete rule', title: 'Delete', onClick: () => ctx.commit(deleteRule(table, rule.id)) })),
  );
}
