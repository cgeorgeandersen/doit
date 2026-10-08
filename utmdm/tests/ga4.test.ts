import { describe, expect, it } from 'vitest';
import { GA4_DIMENSIONS, PAGE_LIMIT, fetchGa4Rows, listGa4Properties, parseRunReport, runReportBody } from '../src/sources/ga4';

const response = {
  rows: [
    { dimensionValues: [{ value: 'fb' }, { value: 'paid_social' }, { value: 'sc-26' }, { value: 'video' }, { value: '(not set)' }],
      metricValues: [{ value: '1204' }, { value: '31' }] },
    { dimensionValues: [{ value: '(direct)' }, { value: '(none)' }, { value: '(direct)' }, { value: '(not set)' }, { value: '(not set)' }],
      metricValues: [{ value: '9000' }, { value: '200' }] },
    { dimensionValues: [{ value: 'google' }, { value: 'organic' }, { value: '(organic)' }, { value: '(not set)' }, { value: '(not set)' }],
      metricValues: [{ value: '5000' }, { value: '90' }] },
  ],
};

describe('the GA4 refresh', () => {
  it('asks GA4 for the five UTM dimensions with sessions and key events', () => {
    const body = runReportBody('2026-05-01', '2026-05-31');
    expect(body.dimensions.map((d) => d.name)).toEqual([...GA4_DIMENSIONS]);
    expect(body.metrics.map((m) => m.name)).toEqual(['sessions', 'keyEvents']);
    expect(body.dateRanges).toEqual([{ startDate: '2026-05-01', endDate: '2026-05-31' }]);
  });

  it('keeps UTM-tagged sessions only, and reads "(not set)" as empty', () => {
    expect(parseRunReport(response)).toEqual([
      { source: 'fb', medium: 'paid_social', campaign: 'sc-26', content: 'video', term: '', sessions: 1204, keyEvents: 31 },
    ]);
  });

  it('calls the Data API with the token and the property', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify(response), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await fetchGa4Rows('123456', 'token', { startDate: '2026-05-01', endDate: '2026-05-31' }, fake);
    expect(rows).toHaveLength(1);
    expect(seen!.url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer token');
  });

  it('pages through reports bigger than one page', async () => {
    const offsets: number[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { offset: number };
      offsets.push(body.offset);
      return new Response(JSON.stringify({ ...response, rowCount: PAGE_LIMIT + 5 }), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await fetchGa4Rows('1', 'token', { startDate: '90daysAgo', endDate: 'today' }, fake);
    expect(offsets).toEqual([0, PAGE_LIMIT]);
    expect(rows).toHaveLength(2);
  });

  it('lists the properties a Google account can read, across pages and accounts', async () => {
    const pages = [
      { accountSummaries: [{ displayName: 'Zestify', propertySummaries: [{ property: 'properties/22', displayName: 'Zestify web' }] }], nextPageToken: 'p2' },
      { accountSummaries: [{ displayName: 'Agency', propertySummaries: [{ property: 'properties/11', displayName: 'Client site' }] }] },
    ];
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await listGa4Properties('token', fake)).toEqual([
      { id: '11', name: 'Client site', account: 'Agency' },
      { id: '22', name: 'Zestify web', account: 'Zestify' },
    ]);
    expect(urls[1]).toContain('pageToken=p2');
  });

  it('turns Google errors into sentences', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: 'User does not have sufficient permissions' } }), { status: 403 })) as unknown as typeof fetch;
    await expect(listGa4Properties('token', fake)).rejects.toThrow('Google refused: User does not have sufficient permissions.');
  });
});
