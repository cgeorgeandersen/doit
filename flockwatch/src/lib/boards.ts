/**
 * County commissioners, so someone can write to a whole board in one email.
 *
 * The county board approves the sheriff's and county police's camera
 * contracts, and on unincorporated land it is the only local government there
 * is. No free list of its members covers the country (Open States stops at
 * state legislatures, and Wikidata rarely has more than the chair), so each
 * state's boards are collected from the counties' own websites into
 * src/content/boards/<state>.json, keyed by the county's Census code, with the
 * page every address came from and the day it was checked. Georgia is first.
 */

export interface BoardMember {
  name: string;
  /** "Chairman", "District 3", "Post 2, vice chair": as the county writes it. */
  seat: string;
  email?: string;
  phone?: string;
}

export interface CountyBoard {
  /** "Cobb", without "County". */
  county: string;
  /** "Board of Commissioners", "Sole Commissioner", "Mayor and Commission", "Columbus Council". */
  body: string;
  members: BoardMember[];
  /** An address the county gives for the whole board, used when a member has none of their own. */
  shared?: string;
  phone?: string;
  /** The county page the names and addresses were copied from. */
  source: string;
  /** When they were last checked against that page, as YYYY-MM-DD. */
  checked: string;
}

export interface StateBoards {
  state: string;
  /** By the county's five-digit Census code (state + county FIPS), e.g. "13067" for Cobb. */
  counties: Record<string, CountyBoard>;
}

const files = import.meta.glob<StateBoards>('../content/boards/*.json', { import: 'default' });
const cache = new Map<string, Promise<StateBoards | null>>();

/** The board for a county, or null where none has been collected yet. */
export function loadBoard(state: string, fips: string): Promise<CountyBoard | null> {
  const st = state.toLowerCase();
  let hit = cache.get(st);
  if (!hit) {
    const load = files[`../content/boards/${st}.json`];
    hit = load ? load() : Promise.resolve(null);
    hit.catch(() => cache.delete(st));
    cache.set(st, hit);
  }
  return hit.then((file) => file?.counties[fips] ?? null);
}

/** Everyone an email to the whole board goes to: each member's own address, plus the board's when someone has none. */
export function recipients(board: CountyBoard): string[] {
  const to = board.members.flatMap((m) => (m.email ? [m.email] : []));
  if (board.shared && to.length < board.members.length) to.push(board.shared);
  return [...new Set(to.map((e) => e.toLowerCase()))];
}

/** Members the email won't reach: no address of their own, and no board address to stand in. */
export function unreached(board: CountyBoard): BoardMember[] {
  return board.shared ? [] : board.members.filter((m) => !m.email);
}

/** "Dear Commissioners", or "Dear Commissioner" for a sole commissioner, or the mayor too where one sits on the board. */
export function greeting(board: CountyBoard): string {
  if (board.members.length === 1) return /commissioner/i.test(board.body) ? 'Dear Commissioner' : `Dear ${board.members[0]!.seat}`;
  const council = /council/i.test(board.body);
  const mayor = board.members.some((m) => /^mayor\b/i.test(m.seat));
  const members = council ? 'Council members' : 'Commissioners';
  return mayor ? `Dear Mayor and ${members}` : `Dear ${members}`;
}

/** What the email says about the cameras: one camera's map link, or how many a drive or town has in the county. */
export type About = { camera: string } | { cameras: number; where: 'drive' | 'town' };

export interface Draft {
  subject: string;
  body: string;
}

/** A short, editable draft: a few questions and one ask, with room for the sender's own words. */
export function draft(board: CountyBoard, about: About): Draft {
  const county = `${board.county} County`;
  const which =
    'camera' in about
      ? `One of them is here: ${about.camera}`
      : about.where === 'drive'
        ? `A drive I make passes ${about.cameras === 1 ? 'one of them' : `${about.cameras} of them`}.`
        : `I count ${about.cameras === 1 ? 'one of them' : `${about.cameras} of them`} in my town.`;
  const lines = [
    `${greeting(board)},`,
    '',
    `I'm writing about the Flock license plate cameras in ${county}. ${which}`,
    '',
    'Each one photographs every passing car and keeps a searchable record of where it was and when. I would like to know:',
    '',
    '- How many of these cameras the county pays for, and what the contract costs',
    '- How long the records are kept',
    '- Which agencies can search them, including ones in other states and federal agencies',
    '- How searches are logged and audited',
    '',
    'Please put the camera contract on a public meeting agenda so residents can weigh in before it is renewed.',
    '',
    'Thank you,',
    '',
    '[Your name]',
    '[Your address]',
  ];
  return { subject: `Flock license plate cameras in ${county}`, body: lines.join('\r\n') };
}

/** A mailto link with every address on the To line and the draft filled in. */
export function mailtoHref(to: string[], d: Draft): string {
  return `mailto:${to.join(',')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

/** "cobbcounty.gov", for "Addresses from cobbcounty.gov". */
export function sourceHost(board: CountyBoard): string {
  try {
    return new URL(board.source).hostname.replace(/^www\./, '');
  } catch {
    return board.source;
  }
}
