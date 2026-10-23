import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { draft, greeting, loadBoard, mailtoHref, recipients, unreached, type CountyBoard, type StateBoards } from '../src/lib/boards';
import { boardLabel, lowerFirst } from '../src/ui/contact';

const ga = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/content/boards/ga.json'), 'utf8')) as StateBoards;

const board = (over: Partial<CountyBoard>): CountyBoard => ({
  county: 'Example',
  body: 'Board of Commissioners',
  members: [
    { name: 'Ann Chair', seat: 'Chairman', email: 'ann@example.gov' },
    { name: 'Bo Two', seat: 'District 1', email: 'bo@example.gov' },
    { name: 'Cy Three', seat: 'District 2' },
  ],
  source: 'https://example.gov/boc',
  checked: '2026-10-23',
  ...over,
});

describe('the Georgia boards', () => {
  const entries = Object.entries(ga.counties);

  it('covers counties by their Census codes', () => {
    expect(ga.state).toBe('GA');
    expect(entries.length).toBeGreaterThan(50);
    for (const [fips] of entries) expect(fips).toMatch(/^13\d{3}$/);
  });

  it('says where every name came from, and when it was checked', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [, b] of entries) {
      expect(b.source, b.county).toMatch(/^https:\/\//);
      expect(b.checked, b.county).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.checked <= today, b.county).toBe(true);
    }
  });

  it('lists people with seats and well-formed addresses, each once', () => {
    for (const [, b] of entries) {
      expect(b.members.length, b.county).toBeGreaterThan(0);
      const emails = b.members.flatMap((m) => (m.email ? [m.email] : []));
      expect(new Set(emails).size, b.county).toBe(emails.length);
      for (const m of b.members) {
        expect(m.name.trim(), b.county).not.toBe('');
        expect(m.seat.trim(), b.county).not.toBe('');
      }
      for (const e of [...emails, ...(b.shared ? [b.shared] : [])]) {
        expect(e, b.county).toMatch(/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/);
      }
    }
  });

  it('loads one county from its state file', async () => {
    const cobb = await loadBoard('GA', '13067');
    expect(cobb?.county).toBe('Cobb');
    expect(await loadBoard('GA', '13999')).toBeNull();
    expect(await loadBoard('TX', '48201')).toBeNull();
  });
});

describe('recipients', () => {
  it('sends to everyone who has an address', () => {
    expect(recipients(board({}))).toEqual(['ann@example.gov', 'bo@example.gov']);
    expect(unreached(board({})).map((m) => m.name)).toEqual(['Cy Three']);
  });

  it('adds the board’s own address when someone has none of their own', () => {
    expect(recipients(board({ shared: 'boc@example.gov' }))).toEqual(['ann@example.gov', 'bo@example.gov', 'boc@example.gov']);
    expect(unreached(board({ shared: 'boc@example.gov' }))).toEqual([]);
  });

  it('leaves the board’s address off when every member has one', () => {
    const all = board({ shared: 'boc@example.gov', members: [{ name: 'Ann', seat: 'Chair', email: 'Ann@Example.gov' }] });
    expect(recipients(all)).toEqual(['ann@example.gov']);
  });

  it('uses the board’s address alone where nobody lists their own', () => {
    expect(recipients(board({ shared: 'boc@example.gov', members: [{ name: 'Ann', seat: 'Chair' }, { name: 'Bo', seat: 'Post 1' }] }))).toEqual([
      'boc@example.gov',
    ]);
  });
});

describe('the email', () => {
  it('greets the board the way it is made up', () => {
    expect(greeting(board({}))).toBe('Dear Commissioners');
    expect(greeting(board({ body: 'Sole Commissioner', members: [{ name: 'Noah', seat: 'Sole commissioner' }] }))).toBe('Dear Commissioner');
    expect(greeting(board({ body: 'Mayor and Commission', members: [{ name: 'L', seat: 'Mayor' }, { name: 'V', seat: 'District 1' }] }))).toBe(
      'Dear Mayor and Commissioners',
    );
    expect(greeting(board({ body: 'Columbus Council' }))).toBe('Dear Council members');
  });

  it('names the county and what the sender saw', () => {
    const one = draft(board({}), { camera: 'https://www.openstreetmap.org/node/1' });
    expect(one.subject).toBe('Flock license plate cameras in Example County');
    expect(one.body).toContain('One of them is here: https://www.openstreetmap.org/node/1');
    expect(draft(board({}), { cameras: 14, where: 'drive' }).body).toContain('A drive I make passes 14 of them.');
    expect(draft(board({}), { cameras: 1, where: 'town' }).body).toContain('I count one of them in my town.');
  });

  it('puts every address on the To line and encodes the draft', () => {
    const href = mailtoHref(['a@example.gov', 'b@example.gov'], { subject: 'Cameras & data', body: 'Line one\r\nLine two' });
    expect(href).toBe('mailto:a@example.gov,b@example.gov?subject=Cameras%20%26%20data&body=Line%20one%0D%0ALine%20two');
    const url = new URL(href);
    expect(url.searchParams.get('body')).toBe('Line one\r\nLine two');
  });
});

describe('the button', () => {
  it('says how many people it reaches', () => {
    expect(boardLabel(board({ shared: 'boc@example.gov' }))).toBe('Email all 3 commissioners');
    expect(boardLabel(board({}))).toBe('Email 2 of the 3 commissioners');
    expect(boardLabel(board({ members: [{ name: 'Noah', seat: 'Sole commissioner', email: 'n@example.gov' }] }))).toBe('Email the commissioner');
    expect(
      boardLabel(board({ members: [{ name: 'L', seat: 'Mayor', email: 'l@example.gov' }, { name: 'V', seat: 'District 1', email: 'v@example.gov' }] })),
    ).toBe('Email the mayor and the commissioner');
    expect(boardLabel(board({ body: 'Columbus Council', shared: 'c@example.gov' }))).toBe('Email all 3 council members');
  });

  it('keeps the capitals of a board’s proper name mid-sentence', () => {
    expect(lowerFirst('Board of Commissioners')).toBe('board of commissioners');
    expect(lowerFirst('Sole Commissioner')).toBe('sole commissioner');
    expect(lowerFirst('City council')).toBe('city council');
    expect(lowerFirst('Augusta Commission')).toBe('Augusta Commission');
    expect(lowerFirst('D.C. Council')).toBe('D.C. Council');
  });
});
