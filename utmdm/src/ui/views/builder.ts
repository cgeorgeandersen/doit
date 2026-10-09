import {
  AUDIENCES, DEFAULT_MEDIUM, FORMATS, MEDIUMS, OBJECTIVES, REGIONS, SOURCES, buildUtm, timeChoices,
  type BuilderAnswers, type Choice,
} from '../../core/builder';
import { UTM_PARTS } from '../../core/model';
import { normalizeParts, utmKey } from '../../core/normalize';
import { apply, cellOf, removedBy, resolve } from '../../core/table';
import { addUtms } from '../../core/workspace';
import { button, pageHeader, select } from '../components';
import type { Ctx } from '../ctx';
import { fill, h, type Child } from '../dom';
import { icon } from '../icons';
import { hashFor } from '../routes';

/*
 * The UTM builder: answer a few questions, get a tagged link whose campaign
 * name follows one pattern, see how your rules will classify it, and add it.
 * Kept between renders so a save elsewhere doesn't wipe the answers.
 */
let answers: BuilderAnswers | null = null;
let mediumTouched = false;
// Questions answered by typing instead of picking from the dropdown.
let typed = new Set<keyof BuilderAnswers>();
const OWN = '__own';

function fresh(today: string): BuilderAnswers {
  return {
    url: '', source: 'google', medium: DEFAULT_MEDIUM.google!, time: timeChoices(today)[0]![0],
    objective: 'launch', theme: '', audience: 'prospecting', region: 'us', format: '', variant: '', term: '',
  };
}

export function builderView(ctx: Ctx): HTMLElement {
  const a = (answers ??= fresh(ctx.now()));
  const output = h('div', { class: 'builder-output', 'aria-live': 'polite' });
  const update = () => fill(output, ...result(ctx, a));

  const text = (key: keyof BuilderAnswers, attrs: Record<string, string> = {}) =>
    h('input', {
      id: `b-${key}`, value: a[key], autocomplete: 'off', spellcheck: 'false', ...attrs,
      oninput: (e: Event) => {
        a[key] = (e.target as HTMLInputElement).value;
        update();
      },
    });

  /** A dropdown of standard answers, plus "Type your own…", which opens a text box for anything else. */
  const choose = (key: keyof BuilderAnswers, choices: Choice[], placeholder: string, after?: () => void) => {
    const own = typed.has(key) || (a[key] !== '' && !choices.some(([v]) => v === a[key]));
    const box = h('input', {
      id: `b-${key}-own`, value: own ? a[key] : '', autocomplete: 'off', spellcheck: 'false', placeholder, maxlength: 40,
      'aria-label': 'Your own answer',
      oninput: (e: Event) => {
        a[key] = (e.target as HTMLInputElement).value;
        after?.();
        update();
      },
    });
    box.hidden = !own;
    const picker = select([...choices, [OWN, 'Type your own…']], own ? OWN : a[key], {
      id: `b-${key}`,
      onchange: (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        if (value === OWN) {
          typed.add(key);
          box.hidden = false;
          a[key] = box.value;
          box.focus();
        } else {
          typed.delete(key);
          box.hidden = true;
          a[key] = value;
        }
        after?.();
        update();
      },
    });
    return { picker, box, controls: [picker, box] as Child[] };
  };

  const medium = choose('medium', MEDIUMS, 'e.g. podcast_ad', () => (mediumTouched = true));
  const source = choose('source', SOURCES, 'e.g. podcast_network', () => {
    const suggested = DEFAULT_MEDIUM[a.source];
    if (!mediumTouched && suggested) {
      a.medium = suggested;
      medium.picker.value = suggested;
      medium.box.hidden = true;
      typed.delete('medium');
    }
  });

  const question = (n: number, label: string, hint: string, controls: Child[]) =>
    h('li', { class: 'bq' },
      h('span', { class: 'bq-n', 'aria-hidden': 'true' }, String(n)),
      h('div', { class: 'bq-body' },
        h('label', { class: 'bq-label', for: (controls.find((c): c is HTMLElement => c instanceof HTMLElement))?.id }, label),
        h('p', { class: 'bq-hint' }, hint),
        h('div', { class: 'bq-controls' }, ...controls)));

  const form = h('section', { class: 'card builder-form', 'aria-label': 'Questions' },
    h('div', { class: 'card-head' },
      h('div', null, h('h2', null, 'Answer a few questions'),
        h('p', { class: 'card-intro' }, 'Pick a standard answer, or choose "Type your own…" on any question.')),
      button('Start over', {
        kind: 'ghost', icon: 'restore',
        onClick: () => {
          answers = fresh(ctx.now());
          mediumTouched = false;
          typed = new Set();
          ctx.render();
        },
      })),
    h('ol', { class: 'bq-list' },
      question(1, 'Where does the link go?', 'The landing page, with or without https://.',
        [text('url', { placeholder: 'https://example.com/summer-sale', inputmode: 'url' })]),
      question(2, 'Where will people click it?', 'The site, app or list the link appears in. This is utm_source.',
        source.controls),
      question(3, 'What kind of placement is it?', 'Paid, organic, email and so on. This is utm_medium; it follows the source until you change it.',
        medium.controls),
      question(4, 'When does it run?', 'The month or quarter it starts, evergreen, or your own label like "black-friday-2026".',
        choose('time', timeChoices(ctx.now()), 'e.g. black-friday-2026').controls),
      question(5, 'What is it for?', 'The goal of the campaign.',
        choose('objective', OBJECTIVES, 'e.g. referral-program').controls),
      question(6, 'What is it about?', 'A short name for the product, offer or theme, like "summer cup" or "spring sale".',
        [text('theme', { placeholder: 'summer cup', maxlength: '40' })]),
      question(7, 'Who is it for?', 'The audience it targets.',
        choose('audience', AUDIENCES, 'e.g. cart-abandoners').controls),
      question(8, 'Where?', 'The market it runs in.',
        choose('region', REGIONS, 'e.g. texas').controls),
      question(9, 'Content (utm_content, optional)', 'What tells this link apart from others in the same campaign: the creative format, plus anything you like, such as "v2" or "blue-button".',
        [...choose('format', FORMATS, 'e.g. ugc-video').controls,
          text('variant', { placeholder: 'Anything else, e.g. v2 or blue-button', maxlength: '40', 'aria-label': 'More content detail' })]),
      question(10, 'Term (utm_term, optional)', 'Usually the paid search keyword, but any short text works.',
        [text('term', { placeholder: 'running shoes', maxlength: '100' })])),
  );

  update();
  return h('div', { class: 'view view-builder' },
    pageHeader('UTM builder',
      'Build links that follow one naming pattern, so every campaign lands in your table already speaking the same language.'),
    h('div', { class: 'builder-split' }, form, h('aside', { class: 'builder-side' }, output)));
}

function result(ctx: Ctx, a: BuilderAnswers): Child[] {
  const built = buildUtm(a);
  const { parts } = built;
  const pattern = h('p', { class: 'builder-pattern' }, icon('columns', 14),
    'Campaign names follow ', h('code', null, 'time_goal_theme_audience_region'), '.');

  const partRows = h('dl', { class: 'builder-parts' },
    ...UTM_PARTS.flatMap((p) => [h('dt', null, `utm_${p}`), h('dd', { class: parts[p] ? '' : 'is-blank' }, parts[p] || '–')]));

  if (!built.url) {
    return [
      h('section', { class: 'card builder-result is-waiting' },
        h('h2', null, 'Your link'),
        h('p', { class: 'muted' }, `Still needed: ${built.missing.join(', ')}.`),
        partRows, pattern),
    ];
  }

  // How the table would read this UTM: added, run through the rules, and looked up.
  const { table } = ctx;
  const key = utmKey(normalizeParts(parts));
  const exists = table.utms.some((u) => u.key === key);
  const draft = addUtms(table, [parts], 'the UTM builder');
  const next = apply(table, draft.op, () => undefined);
  const removed = removedBy(next).has(key);
  const grid = resolve(next);
  const classified = table.columns.map((c) => ({ column: c, cell: cellOf(grid, key, c.id) }));
  const filled = classified.filter((c) => c.cell.from !== 'empty').length;

  const copy = button('Copy link', {
    kind: 'primary', icon: 'copy',
    onClick: () => {
      navigator.clipboard?.writeText(built.url).then(() => ctx.toast('Copied the link.'), () => ctx.toast("Couldn't copy here. Select the link instead."));
    },
  });
  const add = exists
    ? h('p', { class: 'builder-note' }, icon('check', 14), 'This UTM is already in your table.')
    : button('Add to table', {
      icon: 'plus',
      onClick: () => ctx.commit(draft, { message: `Added ${parts.campaign} to the table from the UTM builder.` }),
    });

  return [
    h('section', { class: 'card builder-result' },
      h('h2', null, 'Your link'),
      h('p', { class: 'builder-url', tabindex: 0 }, built.url),
      h('div', { class: 'form-actions' }, copy, add),
      partRows,
      pattern),
    h('section', { class: 'card builder-classify' },
      h('h2', null, 'How your table will read it'),
      removed
        ? h('p', { class: 'builder-note is-warn' }, icon('trash', 14), 'A removal rule takes this UTM out of the table. ',
          h('a', { href: hashFor('rules') }, 'See the rules'))
        : table.columns.length
          ? [
            h('ul', { class: 'builder-cells' }, ...classified.map(({ column, cell }) => h('li', null,
              h('span', { class: 'builder-col' }, column.name),
              cell.from === 'empty'
                ? h('span', { class: 'cell-chip is-empty' }, 'needs a value')
                : h('span', { class: `cell-chip is-${cell.from}` }, icon(cell.from === 'rule' ? 'bolt' : 'pencil', 12), cell.value)))),
            h('p', { class: 'muted' }, filled === classified.length
              ? 'Your rules classify it completely, before it ever runs.'
              : `Your rules fill ${filled} of ${classified.length} columns. `,
            filled < classified.length ? h('a', { href: hashFor('rules') }, 'Add a rule') : null),
          ]
          : h('p', { class: 'muted' }, 'Add columns to your table to see how it would be classified.')),
  ];
}
