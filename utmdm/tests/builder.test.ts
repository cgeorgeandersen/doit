import { describe, expect, it } from 'vitest';
import { buildUtm, campaignName, cleanValue, landingPage, slug, timeChoices, type BuilderAnswers } from '../src/core/builder';

const answers = (over: Partial<BuilderAnswers> = {}): BuilderAnswers => ({
  url: 'example.com/shop', source: 'facebook', medium: 'paid_social', time: '2026-10',
  objective: 'launch', theme: 'Summer Cup!', audience: 'prospecting', region: 'us', format: '', variant: '', term: '',
  ...over,
});

describe('the UTM builder', () => {
  it('cleans every part the same way', () => {
    expect(slug('  Summer   Cup! ')).toBe('summer-cup');
    expect(slug('Café_Crème 2026')).toBe('cafe-creme-2026');
  });

  it('names a campaign from the answers in a fixed order', () => {
    expect(campaignName(answers())).toBe('2026-10_launch_summer-cup_prospecting_us');
  });

  it('builds a tagged link, keeping the page\'s own query and replacing old UTMs', () => {
    const built = buildUtm(answers({ url: 'https://shop.example.com/sale?ref=nav&utm_source=old#top', format: 'video', variant: '15s' }));
    expect(built.missing).toEqual([]);
    const url = new URL(built.url);
    expect(url.searchParams.get('ref')).toBe('nav');
    expect(url.searchParams.get('utm_source')).toBe('facebook');
    expect(url.searchParams.get('utm_campaign')).toBe('2026-10_launch_summer-cup_prospecting_us');
    expect(url.searchParams.get('utm_content')).toBe('video_15s');
    expect(url.searchParams.has('utm_term')).toBe(false);
    expect(url.hash).toBe('#top');
  });

  it('says what is still needed instead of building half a link', () => {
    const built = buildUtm(answers({ url: 'not a page', theme: '', source: '  ' }));
    expect(built.url).toBe('');
    expect(built.missing).toEqual(['the landing page', 'the source', 'what the campaign is about']);
    expect(landingPage('example.com')?.href).toBe('https://example.com/');
    expect(landingPage('javascript:alert(1)')).toBeNull();
  });

  it('offers the next six months, four quarters and evergreen', () => {
    const choices = timeChoices('2026-11-15T12:00:00Z');
    expect(choices[0]).toEqual(['2026-11', 'November 2026']);
    expect(choices[2]![0]).toBe('2027-01');
    expect(choices.slice(6, 10).map((c) => c[0])).toEqual(['2026-q4', '2027-q1', '2027-q2', '2027-q3']);
    expect(choices.at(-1)![0]).toBe('evergreen');
  });

  it('accepts your own answer on any question, cleaned the same way as the standard ones', () => {
    expect(cleanValue('  Podcast Network ')).toBe('podcast_network');
    expect(cleanValue('Paid--Social!!')).toBe('paid-social');
    const built = buildUtm(answers({
      source: 'Podcast Network', medium: 'Audio Ad', time: 'Black Friday 2026', objective: 'Referral Program',
      audience: 'Cart abandoners', region: 'Texas', format: 'UGC Video', variant: 'Blue Button', term: '  Best  Running Shoes ',
    }));
    expect(built.parts).toEqual({
      source: 'podcast_network',
      medium: 'audio_ad',
      campaign: 'black-friday-2026_referral-program_summer-cup_cart-abandoners_texas',
      content: 'ugc-video_blue-button',
      term: 'best running shoes',
    });
  });
});

