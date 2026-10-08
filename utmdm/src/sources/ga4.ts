import type { UtmParts } from '../core/model';

/*
 * Importing UTMs from Google Analytics 4. GA4's Data API reports a session's
 * UTM values as these five dimensions; this lists the properties someone can
 * read, asks one for every UTM-tagged session in a date range, and turns the
 * answer into UTM rows with their sessions. The rows go into the table the same
 * way a paste does (an addUtms change), so spellings that differ only in case,
 * spaces or encoding merge, and UTMs already in the table aren't duplicated.
 *
 * The access token comes from src/cloud/google.ts (read-only, about an hour).
 */

export const GA4_DIMENSIONS = [
  'sessionSource',
  'sessionMedium',
  'sessionCampaignName',
  'sessionManualAdContent',
  'sessionManualTerm',
] as const;
export const GA4_METRICS = ['sessions', 'keyEvents'] as const;

// GA4 fills these in for sessions that carried no UTM campaign at all.
const NOT_A_UTM = new Set(['(direct)', '(organic)', '(referral)', '(not set)', '(none)', '']);

export interface Ga4Row extends UtmParts {
  sessions: number;
  keyEvents: number;
}

export interface RunReportResponse {
  rowCount?: number;
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

export const PAGE_LIMIT = 100000;

export function runReportBody(startDate: string, endDate: string, offset = 0) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: GA4_DIMENSIONS.map((name) => ({ name })),
    metrics: GA4_METRICS.map((name) => ({ name })),
    limit: PAGE_LIMIT,
    offset,
  };
}

/** The date ranges people can pick, in GA4's relative date terms. */
export const GA4_RANGES = [
  { id: '28', label: 'Last 28 days', startDate: '28daysAgo' },
  { id: '90', label: 'Last 90 days', startDate: '90daysAgo' },
  { id: '365', label: 'Last 12 months', startDate: '365daysAgo' },
  { id: '730', label: 'Last 2 years', startDate: '730daysAgo' },
] as const;

export interface Ga4Property {
  /** The numeric id, as in properties/123456789. */
  id: string;
  name: string;
  account: string;
}

interface AccountSummaries {
  accountSummaries?: { displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] }[];
  nextPageToken?: string;
}

/** Every GA4 property the signed-in Google account can read, A to Z. */
export async function listGa4Properties(accessToken: string, request: typeof fetch = fetch): Promise<Ga4Property[]> {
  const properties: Ga4Property[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '200', ...(pageToken ? { pageToken } : {}) });
    const response = await request(`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(await ga4Error(response));
    const page = (await response.json()) as AccountSummaries;
    for (const account of page.accountSummaries ?? []) {
      for (const p of account.propertySummaries ?? []) {
        const id = (p.property ?? '').replace('properties/', '');
        if (id) properties.push({ id, name: p.displayName ?? id, account: account.displayName ?? '' });
      }
    }
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return properties.sort((a, b) => `${a.account} ${a.name}`.localeCompare(`${b.account} ${b.name}`));
}

/** Google's error message, in a sentence people can act on. */
async function ga4Error(response: Response): Promise<string> {
  let detail = '';
  try {
    detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    // no JSON body
  }
  if (response.status === 401) return 'Google sign-in expired. Connect Google Analytics again.';
  if (response.status === 403) return `Google refused: ${detail || 'this account can\'t read that property'}.`;
  if (response.status === 429) return 'Google Analytics is rate-limiting this property. Try again in a few minutes.';
  return `Google Analytics answered ${response.status}${detail ? `: ${detail}` : ''}.`;
}

/** GA4's answer as UTM rows: UTM-tagged sessions only, "(not set)" read as empty. */
export function parseRunReport(response: RunReportResponse): Ga4Row[] {
  return (response.rows ?? []).flatMap((row) => {
    const [source, medium, campaign, content, term] = GA4_DIMENSIONS.map((_, i) => row.dimensionValues?.[i]?.value ?? '');
    if (NOT_A_UTM.has(campaign!)) return [];
    const blank = (value: string) => (value === '(not set)' ? '' : value);
    const [sessions, keyEvents] = GA4_METRICS.map((_, i) => Number(row.metricValues?.[i]?.value ?? 0) || 0);
    return [{
      source: blank(source!),
      medium: blank(medium!),
      campaign: campaign!,
      content: blank(content!),
      term: blank(term!),
      sessions: sessions!,
      keyEvents: keyEvents!,
    }];
  });
}

/** Every UTM-tagged row for the range, page by page. */
export async function fetchGa4Rows(
  propertyId: string,
  accessToken: string,
  range: { startDate: string; endDate: string },
  request: typeof fetch = fetch,
): Promise<Ga4Row[]> {
  const rows: Ga4Row[] = [];
  let offset = 0;
  let total = 0;
  do {
    const response = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(runReportBody(range.startDate, range.endDate, offset)),
    });
    if (!response.ok) throw new Error(await ga4Error(response));
    const page = (await response.json()) as RunReportResponse;
    rows.push(...parseRunReport(page));
    total = page.rowCount ?? 0;
    offset += PAGE_LIMIT;
  } while (offset < total);
  return rows;
}
