import { describe, expect, it } from 'vitest';
import { tableCsv } from '../src/core/csv';
import { createDemoWorkspace } from '../src/core/demo';
import { CSV_TEMPLATE, parseUtms, splitLine } from '../src/core/paste';
import { resolve } from '../src/core/table';
import { addUtms, latest, openBook } from '../src/core/workspace';

describe('pasting UTMs', () => {
  it('reads tagged links, decoding spaces and ignoring other parameters', () => {
    const { rows, skipped } = parseUtms([
      'https://zestify.example/cup?ref=1&utm_source=facebook&utm_medium=paid_social&utm_campaign=Summer%20Cup&utm_content=video#top',
      'zestify.example/?UTM_SOURCE=google&utm_medium=cpc&utm_campaign=summer_cup&utm_term=zestify+soda',
      'https://zestify.example/no-tags',
    ].join('\n'));
    expect(rows).toEqual([
      { source: 'facebook', medium: 'paid_social', campaign: 'Summer Cup', content: 'video', term: '' },
      { source: 'google', medium: 'cpc', campaign: 'summer_cup', content: '', term: 'zestify soda' },
    ]);
    expect(skipped).toEqual(['https://zestify.example/no-tags']);
  });

  it('reads rows copied from a spreadsheet, in source, medium, campaign, content, term order', () => {
    const { rows } = parseUtms('fb\tpaid_social\tsc26_promo\tvideo_15s\nsms\tsms\tpassword_reset');
    expect(rows).toEqual([
      { source: 'fb', medium: 'paid_social', campaign: 'sc26_promo', content: 'video_15s', term: '' },
      { source: 'sms', medium: 'sms', campaign: 'password_reset', content: '', term: '' },
    ]);
  });

  it('follows a header row in any order, and skips columns it does not know', () => {
    const { rows } = parseUtms('Campaign,Owner,utm_source,utm_medium\nwinter_warmup,Theo,google,cpc\n"spring, refresh",Ana,newsletter,email');
    expect(rows).toEqual([
      { source: 'google', medium: 'cpc', campaign: 'winter_warmup', content: '', term: '' },
      { source: 'newsletter', medium: 'email', campaign: 'spring, refresh', content: '', term: '' },
    ]);
  });

  it('takes a single column when a header names it, and skips lone words without one', () => {
    expect(parseUtms('utm_campaign\nsummer_cup\nfall_kickoff').rows.map((r) => r.campaign)).toEqual(['summer_cup', 'fall_kickoff']);
    expect(parseUtms('hello\nfb,cpc,x')).toEqual({ rows: [{ source: 'fb', medium: 'cpc', campaign: 'x', content: '', term: '' }], skipped: ['hello'] });
  });

  it('splits CSV with quotes', () => {
    expect(splitLine('a,"b, c","say ""hi""", d ', ',')).toEqual(['a', 'b, c', 'say "hi"', 'd']);
  });

  it('reads files saved by Excel: a byte-order mark, Windows line ends, and semicolons', () => {
    const { rows } = parseUtms('\uFEFFUTM Source;UTM-Medium;Campaign\r\nfb;paid_social;"summer; cup"\r\n');
    expect(rows).toEqual([{ source: 'fb', medium: 'paid_social', campaign: 'summer; cup', content: '', term: '' }]);
  });

  it('reads a column of links inside a CSV straight from the link', () => {
    const { rows } = parseUtms('url,owner\nhttps://zestify.example/?utm_source=sms&utm_medium=sms&utm_campaign=order_confirmation,Ana');
    expect(rows).toEqual([{ source: 'sms', medium: 'sms', campaign: 'order_confirmation', content: '', term: '' }]);
    expect(parseUtms('url,owner\nhttps://zestify.example/?utm_source=sms&utm_campaign=x,Ana').skipped).toEqual(['url,owner']);
    // a link with a raw comma in a value is still one link
    expect(parseUtms('https://zestify.example/?utm_source=ig&utm_content=red,blue&utm_campaign=c').rows[0]).toMatchObject({ content: 'red,blue', campaign: 'c' });
  });

  it('reads the downloadable template', () => {
    expect(parseUtms(CSV_TEMPLATE)).toEqual({
      rows: [
        { source: 'facebook', medium: 'paid_social', campaign: 'summer_cup_2026', content: 'video_15s', term: '' },
        { source: 'google', medium: 'cpc', campaign: 'summer_cup_2026', content: 'rsa_1', term: 'zestify soda' },
        { source: 'newsletter', medium: 'email', campaign: 'welcome_series', content: 'hero_banner', term: '' },
      ],
      skipped: [],
    });
  });

  it('takes back a CSV exported from UTMDM without duplicating anything', () => {
    const book = openBook(createDemoWorkspace('2026-10-07T12:00:00.000Z'));
    const t = latest(book);
    const exported = tableCsv(t, resolve(t), 8);
    const { rows, skipped } = parseUtms(exported);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(t.utms.length);
    expect(addUtms(t, rows).added).toEqual([]);
  });
});
