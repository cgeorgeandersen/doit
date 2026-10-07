import { describe, expect, it } from 'vitest';
import { parseUtms, splitLine } from '../src/core/paste';

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
});
