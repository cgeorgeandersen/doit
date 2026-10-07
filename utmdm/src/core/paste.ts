import { UTM_PARTS, type UtmPart, type UtmParts } from './model';

/*
 * Reads UTMs from whatever a marketer has to hand:
 *   - tagged links:  https://zestify.example/cup?utm_source=fb&utm_medium=paid_social&utm_campaign=summer_cup
 *   - rows copied from a spreadsheet (tabs) or a CSV file (commas, or
 *     semicolons as some Excel versions save it), with or without a header
 *     row; without one, columns are read as source, medium, campaign,
 *     content, term. Columns it doesn't know are ignored.
 */

/** The file people can download to start from. */
export const CSV_TEMPLATE = [
  'utm_source,utm_medium,utm_campaign,utm_content,utm_term',
  'facebook,paid_social,summer_cup_2026,video_15s,',
  'google,cpc,summer_cup_2026,rsa_1,zestify soda',
  'newsletter,email,welcome_series,hero_banner,',
].join('\n') + '\n';

export interface Parsed {
  rows: UtmParts[];
  /** Lines that had text but no UTM in them. */
  skipped: string[];
}

const HEADER = /^(utm[_ -]?)?(source|medium|campaign|content|term)$/;

function blank(): UtmParts {
  return { source: '', medium: '', campaign: '', content: '', term: '' };
}

function fromLink(line: string): UtmParts | null {
  const start = line.indexOf('?');
  const query = (start >= 0 ? line.slice(start + 1) : line).split('#')[0]!;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }
  const row = blank();
  let found = false;
  for (const [key, value] of params) {
    const part = key.trim().toLowerCase().replace(/^utm_/, '') as UtmPart;
    if (key.trim().toLowerCase().startsWith('utm_') && UTM_PARTS.includes(part) && !row[part]) {
      row[part] = value.trim();
      found = found || Boolean(value.trim());
    }
  }
  return found ? row : null;
}

/** Splits one line of CSV or tab-separated text, honoring quotes. */
export function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) quoted = true;
    else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

const count = (text: string, ch: string) => text.split(ch).length - 1;

/** Tabs from a spreadsheet paste, semicolons from a European Excel, otherwise commas. */
function pickDelimiter(lines: string[]): string {
  if (lines.some((l) => l.includes('\t'))) return '\t';
  const first = lines[0] ?? '';
  return count(first, ';') > count(first, ',') ? ';' : ',';
}

/**
 * A link on a CSV row sits in one cell, beside others like an owner or a date.
 * Pick that cell, unless the "cells" are just pieces of one link with commas in it.
 */
function linkCell(line: string, delimiter: string): string {
  const cells = splitLine(line, delimiter);
  if (cells.length < 2) return line;
  const link = cells.find(isLink);
  return link && cells.filter((c) => c !== link).every((c) => !c.includes('=')) ? link : line;
}

const isLink = (line: string) => /(^|[?&#])utm_[a-z]+=/i.test(line);

export function parseUtms(text: string): Parsed {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delimiter = pickDelimiter(lines.filter((l) => !isLink(l)));
  const hasLinks = lines.some(isLink);
  const rows: UtmParts[] = [];
  const skipped: string[] = [];
  let order: (UtmPart | null)[] = [...UTM_PARTS];
  let headerRead = false;
  let hasHeader = false;

  for (const line of lines) {
    if (isLink(line)) {
      const row = fromLink(linkCell(line, delimiter));
      if (row) rows.push(row);
      else skipped.push(line);
      continue;
    }
    const cells = splitLine(line, delimiter);
    if (!headerRead) {
      headerRead = true;
      const names = cells.map((c) => c.toLowerCase().match(HEADER)?.[2] as UtmPart | undefined);
      if (names.some(Boolean)) {
        order = names.map((n) => n ?? null);
        hasHeader = true;
        continue;
      }
    }
    // Without a header, one word on a line is too little to tell which part it is, and
    // beside tagged links, a line without one is a header or a note, not a UTM.
    if (!hasHeader && (cells.length < 2 || hasLinks)) {
      skipped.push(line);
      continue;
    }
    const row = blank();
    order.forEach((part, i) => {
      if (part && !row[part]) row[part] = cells[i] ?? '';
    });
    if (UTM_PARTS.some((p) => row[p])) rows.push(row);
    else skipped.push(line);
  }
  return { rows, skipped };
}
