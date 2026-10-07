import { describe, expect, it } from 'vitest';
import { GA4_DIMENSIONS, fetchGa4Rows, parseRunReport, runReportBody } from '../src/sources/ga4';

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
});
