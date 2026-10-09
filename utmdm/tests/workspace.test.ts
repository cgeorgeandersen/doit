import { describe, expect, it } from 'vitest';
import { tableCsv } from '../src/core/csv';
import { createDemoWorkspace } from '../src/core/demo';
import type { UtmParts } from '../src/core/model';
import { memoryStore, parseWorkspace } from '../src/core/store';
import { cellOf, coverage, resolve } from '../src/core/table';
import {
  addColumn, addRule, addUtms, columnNameProblem, deleteColumn, emptyWorkspace, historyEntries, latest, openBook,
  record, restore, setCell, undo, versionOf, withTaxonomyOf, type Book,
} from '../src/core/workspace';

const AT = '2026-10-07T12:00:00.000Z';
const utm = (source: string, medium: string, campaign: string): UtmParts => ({ source, medium, campaign, content: '', term: '' });

function start(): Book {
  let book = openBook(emptyWorkspace('Test', 'Sam'));
  book = record(book, addUtms(latest(book), [utm('fb', 'paid_social', 'summer_cup'), utm('google', 'cpc', 'kickoff_promo')]), AT)!;
  const column = addColumn(book, 'Type');
  book = record(book, column, AT)!;
  return book;
}

describe('versions', () => {
  it('saves every change as the next version, with who, when and what', () => {
    const book = start();
    expect(versionOf(book)).toBe(2);
    expect(book.ws.changes.map((c) => [c.version, c.author, c.summary])).toEqual([
      [1, 'Sam', 'Added 2 UTMs from a paste'],
      [2, 'Sam', 'Added column Type'],
    ]);
  });

  it('saves nothing when nothing changes, but does record a new spelling of a known UTM', () => {
    const book = start();
    expect(record(book, addUtms(latest(book), [utm('fb', 'paid_social', 'summer_cup')]), AT)).toBeNull();
    const respelled = record(book, addUtms(latest(book), [utm('FB', 'Paid_Social', 'Summer_Cup')]), AT)!;
    expect(latest(respelled).utms).toHaveLength(2);
    expect(latest(respelled).utms[0]!.spellings).toEqual(['fb / paid_social / summer_cup', 'FB / Paid_Social / Summer_Cup']);
  });

  it('counts UTMs already in the table apart from spellings repeated within one import', () => {
    const book = start();
    const draft = addUtms(latest(book), [
      utm('FB', 'Paid_Social', 'Summer_Cup'), // already in the table
      utm('meta', 'paid', 'back_to_school'),
      utm('Meta', 'Paid', 'Back_To_School'), // the same new UTM again
    ], 'Google Analytics 4');
    expect(draft).toMatchObject({ known: 1, repeats: 1 });
    expect(draft.added.map((u) => u.raw.source)).toEqual(['meta']);
    expect(draft.summary).toBe('Added 1 UTM from Google Analytics 4 (1 UTM already in the table, 1 spelling merged)');
  });

  it('turns "if campaign contains kickoff, then Type is Marketing" into a rule that classifies every match', () => {
    let book = start();
    const draft = addRule(book, { column: 'c2', when: [{ part: 'campaign', op: 'contains', text: 'KICKOFF' }], value: 'Marketing' });
    expect(draft.problem).toBeNull();
    expect(draft.summary).toBe('Added rule: If campaign contains "KICKOFF", then Type is Marketing');
    book = record(book, draft, AT)!;
    const t = latest(book);
    expect(cellOf(resolve(t), t.utms[1]!.key, 'c2')).toMatchObject({ value: 'Marketing', from: 'rule' });
  });

  it('restores an earlier version as a new version, so the restore can be undone too', () => {
    let book = start();
    book = record(book, setCell(latest(book), latest(book).utms[0]!, 'c2', 'Promo'), AT)!;
    book = record(book, deleteColumn(latest(book), 'c2'), AT)!;
    expect(latest(book).columns).toEqual([]);
    book = record(book, restore(3), AT)!;
    expect(versionOf(book)).toBe(5);
    expect(latest(book).typed.c2).toEqual({ [latest(book).utms[0]!.key]: 'Promo' });
    book = record(book, undo(book, 5), AT)!;
    expect(latest(book).columns).toEqual([]);
    expect(book.ws.changes.at(-1)!.summary).toBe('Undid version 5: Restored version 3');
  });

  it('rebuilds every version from the saved changes alone', () => {
    let book = start();
    book = record(book, restore(1), AT)!;
    book = record(book, restore(2), AT)!;
    const again = openBook(JSON.parse(JSON.stringify(book.ws)));
    expect(again.tables).toEqual(book.tables);
    expect(latest(again).columns.map((c) => c.name)).toEqual(['Type']);
  });

  it('gives new columns and rules ids that are never reused', () => {
    let book = start();
    book = record(book, deleteColumn(latest(book), 'c2'), AT)!;
    const again = addColumn(book, 'Type');
    expect(again.id).toBe('c4');
  });

  it('checks column names', () => {
    const t = latest(start());
    expect(columnNameProblem(t, ' ')).toMatch(/name/);
    expect(columnNameProblem(t, 'type')).toMatch(/already/);
    expect(columnNameProblem(t, 'type', 'c2')).toBeNull();
    expect(columnNameProblem(t, 'Region')).toBeNull();
  });

  it('typing a value with other capitals uses the spelling already in the column', () => {
    let book = start();
    book = record(book, addRule(book, { column: 'c2', when: [{ part: 'campaign', op: 'contains', text: 'cup' }], value: 'Marketing' }), AT)!;
    const draft = setCell(latest(book), latest(book).utms[1]!, 'c2', 'marketing ');
    expect(draft.op).toMatchObject({ type: 'setCell', value: 'Marketing' });
    expect(draft.summary).toBe('Typed Marketing in Type for google / cpc / kickoff_promo');
  });
});

describe('the demo', () => {
  const ws = createDemoWorkspace(AT);
  const book = openBook(ws);
  const t = latest(book);
  const cov = coverage(t, resolve(t));

  it('is the same for everyone, and made of fictional names only', () => {
    expect(createDemoWorkspace(AT)).toEqual(ws);
    const text = JSON.stringify(ws).toLowerCase();
    for (const real of ['fifa', 'coca', 'pepsi', 'nike', 'adidas']) expect(text).not.toContain(real);
  });

  it('starts partly classified, with work left to do', () => {
    expect(cov.utms).toBe(102);
    expect(t.columns.map((c) => c.name)).toEqual(['Channel', 'Campaign', 'Type']);
    expect(cov.complete).toBe(42);
    expect(cov.byRule).toBeGreaterThan(cov.typed);
    expect(cov.empty).toBeGreaterThan(50);
  });

  it('shows a team at work: several people, and rules classifying links that arrived later', () => {
    expect(new Set(ws.changes.map((c) => c.author)).size).toBe(4);
    const entries = historyEntries(book);
    const fall = entries.at(-1)!;
    expect(fall.change.summary).toMatch(/Fall Kickoff/);
    expect(fall.complete).toBeGreaterThan(entries.at(-2)!.complete);
  });

  it('the tip\'s example rule fills a column and completes UTMs', () => {
    const draft = addRule(book, { column: 'c2-2', when: [{ part: 'campaign', op: 'contains', text: 'cup' }], value: 'Marketing' });
    const next = latest(record(book, draft, AT)!);
    expect(coverage(next, resolve(next)).complete).toBe(55);
  });
});

describe('export and storage', () => {
  it('exports the table with every column, the version, and spreadsheet formulas neutralized', () => {
    let book = start();
    book = record(book, addUtms(latest(book), [utm('=HYPERLINK("x")', 'cpc', 'a,b')]), AT)!;
    book = record(book, setCell(latest(book), latest(book).utms[0]!, 'c2', 'Promo'), AT)!;
    const t = latest(book);
    const csv = tableCsv(t, resolve(t), versionOf(book));
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('utm_source,utm_medium,utm_campaign,utm_content,utm_term,Type,version');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",cpc,"a,b",,,,4`);
    expect(csv).toContain('fb,paid_social,summer_cup,,,Promo,4');
  });

  it('round-trips a workspace and refuses files that are not backups', () => {
    const ws = start().ws;
    const store = memoryStore();
    store.save(ws);
    expect(store.load()).toEqual(ws);
    expect(parseWorkspace(JSON.stringify(ws))).toEqual(ws);
    expect(() => parseWorkspace('{"schema":1,"fields":[]}')).toThrow("That file isn't a TagFluent backup.");
    expect(() => parseWorkspace(JSON.stringify({ ...ws, changes: [{ ...ws.changes[0], version: 7 }] }))).toThrow();
  });
});

describe('a new table from another one', () => {
  it('copies the columns and rules, but no UTMs, typed values or history', () => {
    const source = latest(openBook(createDemoWorkspace('2026-10-01T00:00:00Z')));
    expect(source.utms.length).toBeGreaterThan(0);
    const ws = withTaxonomyOf(source, 'Client B', 'george', '2026-10-09T00:00:00Z');
    expect(ws.name).toBe('Client B');
    expect(ws.changes).toHaveLength(1);
    const table = latest(openBook(ws));
    expect(table.columns).toEqual(source.columns);
    expect(table.rules).toEqual(source.rules);
    expect(table.utms).toEqual([]);
    expect(table.typed).toEqual({});
  });

  it('is simply empty when there is nothing to copy', () => {
    const ws = withTaxonomyOf(latest(openBook(emptyWorkspace('A', 'me'))), 'B', 'me', '2026-10-09T00:00:00Z');
    expect(ws).toEqual(emptyWorkspace('B', 'me'));
  });
});
