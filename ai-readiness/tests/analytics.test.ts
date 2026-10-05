import { describe, expect, it } from 'vitest';
import { createBeforeSend, pageAddress } from '../src/lib/analytics.ts';

describe('pageAddress', () => {
  it('never reports the answers after the #', () => {
    expect(pageAddress('https://example.com/results#v=1&m=d&a=012301230123012301&t=2026-10-05')).toBe('https://example.com/results');
  });

  it('keeps campaign tags and drops every other parameter', () => {
    expect(pageAddress('https://example.com/?utm_source=linkedin&utm_medium=social&fbclid=abc&li_fat_id=xyz')).toBe(
      'https://example.com/?utm_source=linkedin&utm_medium=social',
    );
    expect(pageAddress('https://example.com/?ref=newsletter')).toBe('https://example.com/?ref=newsletter');
    expect(pageAddress('https://example.com/?email=someone%40example.com')).toBe('https://example.com/');
  });
});

describe('beforeSend', () => {
  it('counts moving between questions as one view', () => {
    const beforeSend = createBeforeSend();
    expect(beforeSend({ type: 'pageview', url: 'https://example.com/' })).toEqual({ type: 'pageview', url: 'https://example.com/' });
    expect(beforeSend({ type: 'pageview', url: 'https://example.com/' })).toBeNull();
    expect(beforeSend({ type: 'pageview', url: 'https://example.com/results#v=1&m=d&a=0' })).toEqual({
      type: 'pageview',
      url: 'https://example.com/results',
    });
    // Starting over is a new view of the first screen.
    expect(beforeSend({ type: 'pageview', url: 'https://example.com/' })).not.toBeNull();
  });

  it('cleans custom events without skipping them', () => {
    const beforeSend = createBeforeSend();
    beforeSend({ type: 'pageview', url: 'https://example.com/results#a=1' });
    expect(beforeSend({ type: 'event', url: 'https://example.com/results#a=1' })).toEqual({ type: 'event', url: 'https://example.com/results' });
  });
});
