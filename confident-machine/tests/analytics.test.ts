import { describe, expect, it } from 'vitest';
import { beforeSend } from '../src/lib/analytics';

describe('analytics page-view filter', () => {
  const site = 'https://doit-t17l.vercel.app/';

  it('sends the first page view, without its #fragment', () => {
    expect(beforeSend({ type: 'pageview', url: `${site}#opening` })).toEqual({ type: 'pageview', url: site });
  });

  it('skips jumps within the same page (chapter links, footnotes)', () => {
    expect(beforeSend({ type: 'pageview', url: `${site}#trust-map` })).toBeNull();
    expect(beforeSend({ type: 'pageview', url: site })).toBeNull();
  });

  it('still counts a genuinely different page', () => {
    expect(beforeSend({ type: 'pageview', url: `${site}other/#x` })).toEqual({ type: 'pageview', url: `${site}other/` });
  });

  it('passes custom events through, minus the fragment', () => {
    expect(beforeSend({ type: 'event', url: `${site}#rules` })).toEqual({ type: 'event', url: site });
  });
});
