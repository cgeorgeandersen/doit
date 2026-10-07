import type { SourceRow } from '../core/model';

/*
 * The real GA4 refresh, ready except for sign-in. GA4's Data API reports a
 * session's UTM values as these five dimensions; this builds the request,
 * sends it, and turns the answer into the same rows the sample source returns.
 *
 * TODO(sign-in): get an OAuth access token with the analytics.readonly scope
 * (Google Identity Services can do this in the browser), store the GA4
 * property id with the workspace, and allow https://analyticsdata.googleapis.com
 * in the Content-Security-Policy's connect-src (vercel.json).
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

export interface RunReportResponse {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

export function runReportBody(startDate: string, endDate: string) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: GA4_DIMENSIONS.map((name) => ({ name })),
    metrics: GA4_METRICS.map((name) => ({ name })),
    limit: 250000,
  };
}

/** GA4's answer as source rows: UTM-tagged sessions only, "(not set)" read as empty. */
export function parseRunReport(response: RunReportResponse, period: string): SourceRow[] {
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
      period,
      sessions: sessions!,
      keyEvents: keyEvents!,
    }];
  });
}

export async function fetchGa4Rows(
  propertyId: string,
  accessToken: string,
  range: { startDate: string; endDate: string; period: string },
  request: typeof fetch = fetch,
): Promise<SourceRow[]> {
  const response = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(runReportBody(range.startDate, range.endDate)),
  });
  if (!response.ok) throw new Error(`GA4 answered ${response.status}: ${await response.text()}`);
  return parseRunReport((await response.json()) as RunReportResponse, range.period);
}
