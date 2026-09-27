/**
 * Close: what the reader keeps, and the "My Rules for AI" card.
 *
 * The card is assembled from the case file, shown on the page, and can be
 * saved as a PNG (drawn on a canvas, in the browser) or copied as text.
 */
import { h, qs } from '../lib/dom';
import { caseFile, type CaseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { fmtDate, pct } from '../lib/format';
import { buildDate } from '../lib/timely';
import { KEEP_OPTIONS } from '../content/keep';
import { FRONTIER } from '../content/frontier';
import { DILEMMAS } from '../content/dilemmas';
import { QUADRANTS, TASKS, quadrantOf } from '../content/trustmap';

const MAX_KEEP = 3;
const RULE_COUNT = 3;

export function mountClose(section: HTMLElement): void {
  mountKeep(section);
  mountRules(section);
}

/* ------------------------------------------------------------------ */
/* What you keep                                                       */
/* ------------------------------------------------------------------ */

function mountKeep(section: HTMLElement): void {
  const host = qs('#keep-options', section);
  const status = qs('#keep-status', section);
  let chosen: string[] = [...(caseFile.get().keep ?? [])].filter((k) => KEEP_OPTIONS.includes(k));

  const buttons = KEEP_OPTIONS.map((option) =>
    h(
      'button',
      { type: 'button', class: 'choice keep-choice', 'aria-pressed': 'false' },
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
      h('span', {}, option),
    ),
  );
  host.replaceChildren(...buttons);

  const render = () => {
    buttons.forEach((b, i) => {
      const on = chosen.includes(KEEP_OPTIONS[i]!);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !on && chosen.length >= MAX_KEEP;
    });
    status.textContent =
      chosen.length >= MAX_KEEP
        ? 'Three chosen. Unpick one to change your mind.'
        : chosen.length
          ? `${chosen.length} of ${MAX_KEEP} chosen.`
          : '';
  };

  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      const option = KEEP_OPTIONS[i]!;
      chosen = chosen.includes(option) ? chosen.filter((k) => k !== option) : [...chosen, option].slice(0, MAX_KEEP);
      caseFile.update((f) => {
        f.keep = [...chosen];
      });
      render();
    }),
  );
  render();
}

/* ------------------------------------------------------------------ */
/* The rules card                                                      */
/* ------------------------------------------------------------------ */

interface Fact {
  label: string;
  value: string;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function frontierSplit(f: CaseFile): { matched: number; over: number; under: number; sorted: number } | null {
  if (!f.frontier?.revealed) return null;
  let matched = 0;
  let over = 0;
  let under = 0;
  let sorted = 0;
  for (const card of FRONTIER) {
    const pick = f.frontier.sorts[card.id];
    if (!pick) continue;
    sorted += 1;
    if (pick === card.verdict) matched += 1;
    else if (pick === 'great') over += 1;
    else under += 1;
  }
  return sorted ? { matched, over, under, sorted } : null;
}

/** Three starting rules, shaped by what the reader did along the way. */
export function suggestRules(f: CaseFile): string[] {
  const rules: string[] = [];
  const cal = f.calibration?.summary;
  if (cal && cal.n >= 5 && cal.verdict === 'overconfident') {
    rules.push('Before I rely on an answer, I ask how I would know if it were wrong.');
  } else if (cal && cal.n >= 5 && cal.verdict === 'underconfident') {
    rules.push('I trust what I know enough to question a confident answer.');
  } else {
    rules.push('I judge an answer by its sources, not by its tone.');
  }

  rules.push('I use AI where checking is cheaper than doing, and I check before anything leaves my hands.');

  const split = frontierSplit(f);
  if (split && split.over > split.under) {
    rules.push('I test AI on a new kind of task before I trust it with one that matters.');
  } else if (f.keep?.length) {
    rules.push(`I keep ${lowerFirst(f.keep[0]!)}.`);
  } else if (f.dilemmas?.privacy && f.dilemmas.privacy !== 'allow') {
    rules.push('I know where my data goes before I paste it anywhere.');
  } else {
    rules.push('For decisions about people, a person who can explain the reasons makes the call.');
  }
  return rules;
}

function factsFrom(f: CaseFile): Fact[] {
  const facts: Fact[] = [];
  const cal = f.calibration?.summary;
  facts.push({
    label: 'Calibration',
    value:
      cal && cal.n
        ? `${pct(cal.meanConfidence, 0)} sure on average, right ${pct(cal.accuracy, 0)} of the time (${cal.n} ${cal.n === 1 ? 'answer' : 'answers'}): ${cal.verdict}.`
        : 'Not measured yet. The quiz is in Chapter 2.',
  });

  const split = frontierSplit(f);
  facts.push({
    label: 'The frontier',
    value: split
      ? `Matched the research on ${split.matched} of ${split.sorted}; over-trusted ${split.over}, under-trusted ${split.under}.`
      : 'Not sorted yet. The tasks are in Chapter 3.',
  });

  const placed = Object.entries(f.trustmap?.placements ?? {});
  const human = TASKS.filter((t) => {
    const p = f.trustmap?.placements[t.id];
    return p && quadrantOf(p.x, p.y) === 'human';
  }).map((t) => t.short);
  facts.push({
    label: QUADRANTS.human.title,
    value: placed.length
      ? human.length
        ? human.join(', ') + '.'
        : `None of the ${placed.length} tasks you placed.`
      : 'Not mapped yet. The trust map is in Chapter 4.',
  });

  const picks = DILEMMAS.map((d) => {
    const c = d.choices.find((x) => x.id === f.dilemmas?.[d.id]);
    return c ? `${d.principle}: ${c.short}` : null;
  }).filter(Boolean);
  facts.push({ label: 'My decisions', value: picks.length ? picks.join('. ') + '.' : 'Not made yet. The dilemmas are in Chapter 5.' });

  facts.push({ label: 'I keep', value: f.keep?.length ? f.keep.join('. ') + '.' : 'Not chosen yet. Pick up to three above.' });
  return facts;
}

function mountRules(section: HTMLElement): void {
  const card = qs('#rules-card', section);
  const fields = qs('#rules-fields', section);
  const note = qs('#rules-note', section);
  const imageHost = qs('#rules-image', section);
  const pngButton = qs<HTMLButtonElement>('#rules-png', section);
  const copyButton = qs<HTMLButtonElement>('#rules-copy', section);
  const resetButton = qs<HTMLButtonElement>('#rules-reset', section);

  let rules: string[] = (caseFile.get().rules?.length === RULE_COUNT ? caseFile.get().rules! : suggestRules(caseFile.get())).slice();

  const inputs = Array.from({ length: RULE_COUNT }, (_, i) => {
    const id = `rule-${i + 1}`;
    const area = h('textarea', { id, rows: 2, maxlength: 140, spellcheck: 'true' });
    area.value = rules[i] ?? '';
    area.addEventListener('input', () => {
      rules[i] = area.value;
      saveRules();
      renderCard();
    });
    return { area, wrap: h('div', { class: 'rule-field' }, h('label', { class: 'field-label', for: id }, `Rule ${i + 1}`), area) };
  });
  fields.replaceChildren(...inputs.map((x) => x.wrap));

  let saveTimer = 0;
  function saveRules(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      caseFile.update((f) => {
        f.rules = rules.map((r) => r.trim());
      });
    }, 400);
  }

  function renderCard(): void {
    const f = caseFile.get();
    card.replaceChildren(
      h(
        'header',
        { class: 'rc-head' },
        h('p', { class: 'rc-kicker' }, h('span', { class: 'rc-mark', 'aria-hidden': 'true' }), 'The Confident Machine'),
        h('h4', { class: 'rc-title' }, 'My Rules for AI'),
      ),
      h('ol', { class: 'rc-rules' }, ...rules.map((r) => h('li', {}, r.trim() || '…'))),
      h('dl', { class: 'rc-facts' }, ...factsFrom(f).map((x) => h('div', { class: 'rc-fact' }, h('dt', {}, x.label), h('dd', {}, x.value)))),
      h('p', { class: 'rc-foot' }, `From my case file · ${fmtDate(new Date().toISOString().slice(0, 10))}`),
    );
  }

  resetButton.addEventListener('click', () => {
    rules = suggestRules(caseFile.get());
    inputs.forEach((x, i) => {
      x.area.value = rules[i] ?? '';
    });
    saveRules();
    renderCard();
    note.textContent = 'New suggestions, based on your case file.';
  });

  copyButton.addEventListener('click', () => {
    const text = cardText(rules, factsFrom(caseFile.get()));
    const fallback = () => {
      const area = h('textarea', { class: 'rules-copy-fallback', rows: 8, readonly: true, 'aria-label': 'Your rules as text' });
      area.value = text;
      note.replaceChildren('Copying isn’t allowed here. Select the text below and copy it:', area);
      area.focus();
      area.select();
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          note.textContent = 'Copied. Paste it anywhere.';
          announce('Your rules were copied as text.');
        },
        fallback,
      );
    } else fallback();
  });

  let lastUrl: string | null = null;
  pngButton.addEventListener('click', async () => {
    pngButton.disabled = true;
    note.textContent = 'Drawing your card…';
    try {
      const blob = await drawCard(rules, factsFrom(caseFile.get()));
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      const link = h('a', { href: lastUrl, download: 'my-rules-for-ai.png' });
      document.body.append(link);
      link.click();
      link.remove();
      const img = h('img', { src: lastUrl, alt: 'Your My Rules for AI card, as an image.', width: 540, height: 675 });
      imageHost.replaceChildren(img, ...[...imageHost.querySelectorAll('figcaption')]);
      imageHost.hidden = false;
      note.textContent = 'Saved as my-rules-for-ai.png.';
      announce('Your card was saved as an image.');
    } catch (err) {
      console.error(err);
      note.textContent = 'Sorry, the image could not be made in this browser. Try “Copy as text”.';
    } finally {
      pngButton.disabled = false;
    }
  });

  renderCard();
  caseFile.subscribe(() => renderCard());
}

function cardText(rules: string[], facts: Fact[]): string {
  return [
    'My Rules for AI',
    '',
    ...rules.map((r, i) => `${i + 1}. ${r.trim()}`),
    '',
    ...facts.map((f) => `${f.label}: ${f.value}`),
    '',
    `From my case file, The Confident Machine (${fmtDate(new Date().toISOString().slice(0, 10))}).`,
  ].join('\n');
}

/* ---------- Drawing the PNG ---------- */

const CARD = { width: 1080, height: 1350, pad: 88 };
const INK = { paper: '#faf9f5', ink: '#191a1c', ink2: '#45464b', ink3: '#6a6b70', rule: '#dedbd2', machine: '#08856a', human: '#ad721c' };
const FONTS = {
  display: '"Bodoni Moda", Didot, Georgia, serif',
  text: 'Newsreader, Georgia, serif',
  mono: '"IBM Plex Mono", Menlo, Consolas, monospace',
};

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function drawCard(rules: string[], facts: Fact[]): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`500 80px ${FONTS.display}`),
    document.fonts.load(`400 38px ${FONTS.text}`),
    document.fonts.load(`500 20px ${FONTS.mono}`),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');

  // Shrink the type until everything fits the card.
  for (let scale = 1; scale >= 0.6; scale -= 0.05) {
    if (layout(ctx, rules, facts, scale, false) <= CARD.height - CARD.pad) {
      layout(ctx, rules, facts, scale, true);
      break;
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** Lays out (and optionally paints) the card at a type scale; returns the height used. */
function layout(ctx: CanvasRenderingContext2D, rules: string[], facts: Fact[], scale: number, paint: boolean): number {
  const { width, height, pad } = CARD;
  const inner = width - pad * 2;
  if (paint) {
    ctx.fillStyle = INK.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = INK.rule;
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, width - 72, height - 72);
  }
  ctx.textBaseline = 'alphabetic';
  let y = pad + 20;

  // Kicker with the essay's two marks: a machine square and a human dot.
  if (paint) {
    ctx.fillStyle = INK.machine;
    ctx.fillRect(pad, y - 18, 18, 18);
    ctx.fillStyle = INK.human;
    ctx.beginPath();
    ctx.arc(pad + 36, y - 9, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK.ink3;
    ctx.font = `500 22px ${FONTS.mono}`;
    ctx.fillText('THE CONFIDENT MACHINE', pad + 60, y);
  }
  y += 88 * scale;
  ctx.font = `500 ${Math.round(84 * scale)}px ${FONTS.display}`;
  if (paint) {
    ctx.fillStyle = INK.ink;
    ctx.fillText('My Rules for AI', pad, y);
  }
  y += 56 * scale;

  // Rules
  const ruleSize = Math.round(40 * scale);
  const ruleLine = Math.round(ruleSize * 1.28);
  rules.forEach((rule, i) => {
    ctx.font = `500 ${ruleSize}px ${FONTS.text}`;
    const lines = wrap(ctx, rule.trim() || '…', inner - 64);
    if (paint) {
      ctx.fillStyle = INK.human;
      ctx.font = `500 ${ruleSize}px ${FONTS.text}`;
      ctx.fillText(String(i + 1), pad, y + ruleSize);
      ctx.fillStyle = INK.ink;
    }
    lines.forEach((line, j) => {
      if (paint) ctx.fillText(line, pad + 64, y + ruleSize + j * ruleLine);
    });
    y += lines.length * ruleLine + 26 * scale;
  });

  y += 18 * scale;
  if (paint) {
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  y += 44 * scale;

  // Facts from the case file
  const labelSize = Math.round(19 * scale);
  const valueSize = Math.round(27 * scale);
  const valueLine = Math.round(valueSize * 1.3);
  for (const fact of facts) {
    if (paint) {
      ctx.font = `500 ${labelSize}px ${FONTS.mono}`;
      ctx.fillStyle = INK.ink3;
      ctx.fillText(fact.label.toUpperCase(), pad, y);
    }
    y += valueSize + 6 * scale;
    ctx.font = `400 ${valueSize}px ${FONTS.text}`;
    const lines = wrap(ctx, fact.value, inner);
    lines.forEach((line, j) => {
      if (paint) {
        ctx.fillStyle = INK.ink2;
        ctx.fillText(line, pad, y + j * valueLine);
      }
    });
    y += (lines.length - 1) * valueLine + 38 * scale;
  }

  if (paint) {
    ctx.font = `400 18px ${FONTS.mono}`;
    ctx.fillStyle = INK.ink3;
    ctx.fillText(`From my case file · ${fmtDate(new Date().toISOString().slice(0, 10))} · essay built ${fmtDate(buildDate().toISOString().slice(0, 10))}`, pad, height - 60);
  }
  return y;
}
