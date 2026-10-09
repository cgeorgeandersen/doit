import type { UtmParts } from './model';

/*
 * The UTM builder: a few guided questions that turn into one tagged link with
 * a consistent campaign name. The name is the answers in a fixed order, each
 * cleaned the same way, so two people answering the same questions get the
 * same UTM: 2026-10_launch_summer-cup_prospecting_us.
 */

export interface BuilderAnswers {
  url: string;
  source: string;
  /** Free text, used when source is "other". */
  sourceOther: string;
  medium: string;
  time: string;
  objective: string;
  theme: string;
  audience: string;
  region: string;
  format: string;
  variant: string;
  term: string;
}

export type Choice = readonly [value: string, label: string];

export const SOURCES: Choice[] = [
  ['google', 'Google'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['linkedin', 'LinkedIn'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['bing', 'Microsoft Bing'],
  ['x', 'X (Twitter)'],
  ['reddit', 'Reddit'],
  ['newsletter', 'Newsletter'],
  ['partner', 'Partner or affiliate'],
  ['other', 'Something else…'],
];

export const MEDIUMS: Choice[] = [
  ['cpc', 'Paid search (cpc)'],
  ['paid_social', 'Paid social'],
  ['organic_social', 'Organic social'],
  ['email', 'Email'],
  ['display', 'Display'],
  ['video', 'Video'],
  ['sms', 'SMS'],
  ['affiliate', 'Affiliate'],
  ['referral', 'Referral or partner'],
];

/** The medium most teams use with each source, offered until someone picks one. */
export const DEFAULT_MEDIUM: Record<string, string> = {
  google: 'cpc',
  bing: 'cpc',
  facebook: 'paid_social',
  instagram: 'paid_social',
  linkedin: 'paid_social',
  tiktok: 'paid_social',
  x: 'paid_social',
  reddit: 'paid_social',
  youtube: 'video',
  newsletter: 'email',
  partner: 'affiliate',
};

export const OBJECTIVES: Choice[] = [
  ['launch', 'Launch'],
  ['promo', 'Promotion or sale'],
  ['always-on', 'Always on'],
  ['event', 'Event or webinar'],
  ['retargeting', 'Retargeting'],
  ['newsletter', 'Newsletter'],
  ['brand', 'Brand awareness'],
  ['lead-gen', 'Lead generation'],
];

export const AUDIENCES: Choice[] = [
  ['prospecting', 'New audiences (prospecting)'],
  ['retargeting', 'Past visitors (retargeting)'],
  ['customers', 'Existing customers'],
  ['lookalike', 'Lookalikes'],
  ['all', 'Everyone'],
];

export const REGIONS: Choice[] = [
  ['us', 'United States'],
  ['ca', 'Canada'],
  ['uk', 'United Kingdom'],
  ['eu', 'Europe'],
  ['apac', 'Asia Pacific'],
  ['latam', 'Latin America'],
  ['global', 'Global'],
];

export const FORMATS: Choice[] = [
  ['', 'No creative detail'],
  ['video', 'Video'],
  ['static', 'Static image'],
  ['carousel', 'Carousel'],
  ['story', 'Story or reel'],
  ['text', 'Text ad'],
  ['banner', 'Banner'],
  ['email-hero', 'Email hero'],
  ['link', 'Text link'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Time ranges to choose from, starting with the current month: six months, the next four quarters, and evergreen. */
export function timeChoices(today: string): Choice[] {
  const now = new Date(today);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const months: Choice[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month + i, 1));
    const m = d.getUTCMonth();
    return [`${d.getUTCFullYear()}-${String(m + 1).padStart(2, '0')}`, `${MONTHS[m]} ${d.getUTCFullYear()}`] as const;
  });
  const quarters: Choice[] = Array.from({ length: 4 }, (_, i) => {
    const q = Math.floor(month / 3) + i;
    const y = year + Math.floor(q / 4);
    return [`${y}-q${(q % 4) + 1}`, `Q${(q % 4) + 1} ${y}`] as const;
  });
  return [...months, ...quarters, ['evergreen', 'Evergreen (no end date)']];
}

/** One part of a name: lower case, words joined by hyphens, nothing but letters, digits and hyphens. */
export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The campaign name: time, objective, theme, audience and region, in that order, joined by underscores. */
export function campaignName(a: Pick<BuilderAnswers, 'time' | 'objective' | 'theme' | 'audience' | 'region'>): string {
  return [a.time, a.objective, a.theme, a.audience, a.region].map(slug).filter(Boolean).join('_');
}

export interface Built {
  parts: UtmParts;
  /** The landing page with the UTM parameters, or '' until the page address is valid. */
  url: string;
  /** What still needs answering, in question order. */
  missing: string[];
}

export function buildUtm(a: BuilderAnswers): Built {
  const source = a.source === 'other' ? slug(a.sourceOther) : a.source;
  const parts: UtmParts = {
    source,
    medium: a.medium,
    campaign: campaignName(a),
    content: [a.format, a.variant].map(slug).filter(Boolean).join('_'),
    term: a.term.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  const missing: string[] = [];
  const page = landingPage(a.url);
  if (!page) missing.push('the landing page');
  if (!source) missing.push('the source');
  if (!parts.medium) missing.push('the medium');
  if (!slug(a.theme)) missing.push('what the campaign is about');
  return { parts, url: page && !missing.length ? tag(page, parts) : '', missing };
}

/** A web address someone typed, as a URL, or null. "example.com/shop" counts: https:// is added. */
export function landingPage(text: string): URL | null {
  const value = text.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

function tag(page: URL, parts: UtmParts): string {
  const url = new URL(page.href);
  for (const [key, value] of Object.entries(parts)) {
    url.searchParams.delete(`utm_${key}`);
    if (value) url.searchParams.set(`utm_${key}`, value);
  }
  return url.href;
}
