/**
 * Who paid for a camera and who runs it: the "Funded and operated by" line on
 * the camera card.
 *
 * Operated by: the customer that runs the camera and searches what it records,
 * from OpenStreetMap's operator tag (recorded for about 1 in 7 Flock cameras).
 * Under Flock's standard contract Flock itself owns the hardware and bills the
 * customer yearly, so the customer is the operator that matters here.
 *
 * Funded by: only what a cited public record says (FUNDING below), plus one
 * rule: a business or association pays for its own cameras. Running a camera
 * doesn't mean paying for it (Texas paid for thousands that city police run),
 * so everything else is unknown.
 */

import { haversine, type LngLat } from './geo';

export type Kind = 'city' | 'county' | 'metro' | 'state' | 'federal' | 'tribal' | 'private';

const STATES =
  'alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming';

// Checked in order against the lower-cased name; the first match wins, and a
// null kind means the name alone doesn't say (a campus, a bare place name).
const RULES: Array<[RegExp, Kind | null]> = [
  // Businesses that run many cameras.
  [/\b(lowe[’']?s|home depot?|walmart|sam[’']?s club|meijer|kroger|safeway|cvs|walgreens|costco|fedex|dierbergs|kaiser|simon property|brookfield propert|great wolf|wholesale mortgage|sun city texas)/, 'private'],
  // Businesses and associations in general, but not police named for a place (Falls Church Police Department).
  [/^(?!.*\b(police|pd|sheriff|public safety|marshal)\b).*\b(casinos?|credit union|bank|hoa|poa|homeowners?|home owners|association|apartments?|llc|inc|corp|corporation|company|mall|shopping (center|centre)|outlets?|hotel|resort|country club|church)\b/, 'private'],
  [/\b(national park service|united states|u\.s\.|border patrol|customs and border|homeland security|federal bureau|drug enforcement|veterans affairs|air force base|naval (air )?station|police f[ée]d[ée]rale)/, 'federal'],
  [/\b(tribal|tribe|indian police|nation (police|marshal)|pueblo of|band of)\b/, 'tribal'],
  // Places named for a campus: University Heights, College Station, State College.
  [/\b((university|college) (heights|park|place|station|hill|grove|point)|state college)\b/, 'city'],
  [/\b(university|college|school|schools|isd|cisd|usd|campus)\b/, null],
  [new RegExp(`\\b(state (police|patrol|troopers?)|highway patrol|caltrans|txdot|turnpikes?)\\b|^(the )?(${STATES})( state)? (department|dept\\.?|bureau|division) of (public safety|transportation|highways)\\b|^(${STATES}) (dps|dot|transportation authority)\\b`), 'state'],
  // Police for several towns at once, and special districts: the name doesn't say which government.
  [/\b(regional police|(improvement|utility|special) district)\b/, null],
  [/\bmetro(politan)?\b.*\b(police|pd|sheriff)/, 'metro'],
  [/\b(sheriff|county|parish|constable)/, 'county'],
  // Cities' public safety departments: Sunnyvale DPS, Kalamazoo Department of Public Safety.
  [/\b(police|pd|dps|public safety|city|town of|village of|township|twp|borough|marshal|municipal)\b/, 'city'],
];

export function operatorKind(name: string): Kind | null {
  const trimmed = name.trim();
  // "JCPD" or "CCPD" could be a city's police or a county's.
  if (/^[A-Z.&]{2,8}$/.test(trimmed)) return null;
  const n = trimmed.toLowerCase();
  for (const [rx, kind] of RULES) if (rx.test(n)) return kind;
  return null;
}

/** "city", "county", "township", …: what the card shows beside an operator's name. */
export function kindLabel(kind: Kind, name: string): string {
  if (kind === 'city') {
    const n = name.toLowerCase();
    if (/\b(township|twp)\b/.test(n)) return 'township';
    if (/\bvillage\b/.test(n)) return 'village';
    if (/\bborough\b/.test(n)) return 'borough';
    if (/\btown\b/.test(n)) return 'town';
    return 'city';
  }
  return kind === 'metro' ? 'city-county' : kind;
}

/** A public record of who paid for an operator's Flock cameras (not its other makers' cameras). */
export interface Funding {
  /** The operator names this record covers. */
  operators: RegExp;
  /** For a city or county agency: its cameras must be within 50 km of here (Dallas, Georgia has police too). */
  near?: LngLat;
  /** Who paid, when it wasn't the operator itself. */
  funder?: string;
  /** A qualifier the card adds after the funder's name: "at least in part". */
  how?: string;
  source: string;
  /** The source's date, YYYY-MM. */
  asOf: string;
}

const NEAR_M = 50_000;
const TEXAS_TRIBUNE = 'https://www.texastribune.org/2026/08/28/texas-flock-cameras-auto-insurance-fee-mvcpa-grants/';
// The Tribune found state grants behind these cities' Flock cameras, all or in part.
const texasGrant = (city: string, near: LngLat): Funding => ({
  operators: new RegExp(`^${city} (police( department)?|pd)$`, 'i'),
  near,
  funder: 'Texas state grant',
  how: 'at least in part',
  source: TEXAS_TRIBUNE,
  asOf: '2026-08',
});

/** Public records of who paid. Add one when a source says so; the tests check each has a source and date. */
export const FUNDING: Funding[] = [
  {
    operators: /^california highway patrol\b/i,
    source: 'https://www.gov.ca.gov/2024/04/02/governor-newsom-announces-contract-to-install-480-new-high-tech-cameras-in-east-bay-to-improve-public-safety/',
    asOf: '2024-04',
  },
  { operators: /^texas (department of public safety|dps)$/i, source: TEXAS_TRIBUNE, asOf: '2026-08' },
  texasGrant('dallas', [-96.797, 32.777]),
  texasGrant('laredo', [-99.507, 27.531]),
  texasGrant('el paso', [-106.485, 31.762]),
  texasGrant('temple', [-97.343, 31.098]),
  texasGrant('cibolo', [-98.227, 29.562]),
  texasGrant('bellmead', [-97.109, 31.594]),
];

export interface FundingRow {
  label: 'Funded and operated by' | 'Funded by' | 'Operated by';
  /** Null means unknown. */
  name: string | null;
  kind?: string;
  how?: string;
  source?: string;
}

/** The card's one or two rows for a camera's operator (as recorded), location and maker. */
export function fundingRows(operator: string, at: LngLat, flock: boolean): FundingRow[] {
  const name = operator.trim();
  if (!name || /^(unknown|none|n\/?a|\?+)$/i.test(name)) return [{ label: 'Funded and operated by', name: null }];
  const kind = operatorKind(name);
  const operated: FundingRow = { label: 'Operated by', name, ...(kind && { kind: kindLabel(kind, name) }) };
  if (kind === 'private') return [{ ...operated, label: 'Funded and operated by' }];
  const record = flock ? FUNDING.find((f) => f.operators.test(name) && (!f.near || haversine(f.near, at) <= NEAR_M)) : undefined;
  if (!record) return [{ label: 'Funded by', name: null }, operated];
  if (!record.funder) return [{ ...operated, label: 'Funded and operated by', source: record.source }];
  return [{ label: 'Funded by', name: record.funder, how: record.how, source: record.source }, operated];
}
