import type { SourceRow, UtmParts } from '../core/model';

/*
 * The demo's stand-in for GA4: nine months of UTM traffic for Zestify, a
 * fictional beverage brand, built from the habits of four fictional teams.
 * Seeded, so every visitor gets the same data. Each "refresh" returns the next
 * month, the way a GA4 pull would return new rows.
 */

export const SAMPLE_SOURCE = 'Sample GA4 (demo data)';

export const SAMPLE_MONTHS = [
  { period: '2026-01', label: 'Jan 2026' },
  { period: '2026-02', label: 'Feb 2026' },
  { period: '2026-03', label: 'Mar 2026' },
  { period: '2026-04', label: 'Apr 2026' },
  { period: '2026-05', label: 'May 2026' },
  { period: '2026-06', label: 'Jun 2026' },
  { period: '2026-07', label: 'Jul 2026' },
  { period: '2026-08', label: 'Aug 2026' },
  { period: '2026-09', label: 'Sep 2026' },
] as const;

interface Campaign {
  words: [string, string];
  short: string;
  months: [number, number];
}

const CAMPAIGNS: Campaign[] = [
  { words: ['winter', 'warmup'], short: 'ww', months: [0, 1] },
  { words: ['spring', 'refresh'], short: 'sr', months: [2, 3] },
  { words: ['summer', 'cup'], short: 'sc', months: [4, 7] },
  { words: ['fall', 'kickoff'], short: 'fk', months: [7, 8] },
];

type Style = 'upper' | 'suffix' | 'abbrevUpper' | 'brand' | 'title' | 'encoded' | 'typo' | 'snake'
  | 'newsletter' | 'concat' | 'camel' | 'kebab' | 'abbrevDash';

interface Channel {
  sources: string[];
  mediums: string[];
  weight: number;
}

interface Team {
  styles: Partial<Record<Style, number>>;
  channels: Channel[];
  contents: string[];
  terms: string[];
  sessions: [number, number];
  upper: boolean;
  noise: [campaign: string, months: [number, number]][];
}

const TEAMS: Team[] = [
  { // a paid-social agency that shouts
    styles: { upper: 3, suffix: 3, abbrevUpper: 2, brand: 2 },
    channels: [{ sources: ['FB', 'fb_paid', 'FACEBOOK'], mediums: ['PAID_SOCIAL', 'paid_social'], weight: 3 },
               { sources: ['IG', 'ig_paid'], mediums: ['PAID_SOCIAL'], weight: 2 }],
    contents: ['video_15s', 'video_6s', 'carousel', 'static', 'story', 'reel'],
    terms: [],
    sessions: [400, 5200],
    upper: true,
    noise: [],
  },
  { // the search team: Title Case, typos, encoded spaces
    styles: { title: 3, encoded: 2, typo: 3, snake: 2 },
    channels: [{ sources: ['google', 'Google Ads'], mediums: ['cpc', 'Paid Search'], weight: 3 },
               { sources: ['bing'], mediums: ['ppc'], weight: 1 }],
    contents: ['rsa_1', 'rsa_2', 'generic_ad', 'brand_ad'],
    terms: ['zestify soda', 'lemon lime soda', 'zero sugar soda', 'sparkling lime drink'],
    sessions: [250, 4200],
    upper: false,
    noise: [],
  },
  { // lifecycle: email and SMS, and every receipt and reminder
    styles: { newsletter: 4, concat: 2, camel: 2, typo: 1 },
    channels: [{ sources: ['sfmc', 'newsletter', 'email'], mediums: ['email', 'e-mail'], weight: 4 },
               { sources: ['sms', 'text'], mediums: ['sms', 'text'], weight: 1 }],
    contents: ['hero_banner', 'cta_button', 'footer_link', 'header_image'],
    terms: [],
    sessions: [80, 1600],
    upper: false,
    noise: [['order_confirmation', [0, 8]], ['receipt', [0, 8]], ['password_reset', [0, 8]],
            ['delivery_window_reminder', [0, 8]], ['route_change_notice', [2, 8]], ['holiday_hours', [5, 6]]],
  },
  { // a regional team: kebab-case and abbreviations
    styles: { kebab: 4, abbrevDash: 3, camel: 2 },
    channels: [{ sources: ['meta', 'facebook'], mediums: ['paid-social', 'social'], weight: 3 },
               { sources: ['tiktok'], mediums: ['paid-social'], weight: 2 },
               { sources: ['programmatic'], mediums: ['display'], weight: 1 }],
    contents: ['video_6s', 'static', 'carousel', 'ugc_clip'],
    terms: [],
    sessions: [150, 3200],
    upper: false,
    noise: [['holiday-hours', [5, 6]], ['store-locator-update', [3, 8]]],
  },
];

const ALWAYS_ON = ['brand_always_on', 'Brand - Always On', 'always-on-brand'];
// Placements that name two campaigns at once.
const AMBIGUOUS: [team: number, campaign: string, month: number][] = [
  [0, 'SUMMER_CUP_TO_FALL_KICKOFF', 7],
  [3, 'spring-into-summer-cup', 4],
  [2, 'winter_warmup_to_spring_refresh', 2],
];
const SUFFIXES = ['launch', 'promo', 'q2', 'retargeting', 'push'];
const PLACEMENTS = 20; // per team and campaign

/** mulberry32: a small seeded random generator, so the sample is the same everywhere. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(): SourceRow[][] {
  const rand = random(2026);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const weighted = <T>(entries: [T, number][]): T => {
    let roll = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [item, w] of entries) if ((roll -= w) < 0) return item;
    return entries[entries.length - 1]![0];
  };
  const title = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  const typo = (w: string) => {
    const i = 1 + Math.floor(rand() * (w.length - 2));
    return pick([w.slice(0, i) + w.slice(i + 1), w.slice(0, i) + w[i] + w.slice(i), w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)]);
  };
  const spell = (style: Style, { words, short }: Campaign): string => {
    const [a, b] = words;
    switch (style) {
      case 'upper': return `${a}_${b}_2026`.toUpperCase();
      case 'suffix': return `${a}_${b}_${pick(SUFFIXES)}`.toUpperCase();
      case 'abbrevUpper': return `${short.toUpperCase()}26_${title(pick(SUFFIXES))}`;
      case 'brand': return `${pick(['ZESTIFY_', 'ZST-'])}${title(a)}${title(b)}`;
      case 'title': return `${title(a)} ${title(b)} 2026`;
      case 'encoded': return `${title(a)}${pick(['%20', '+'])}${title(b)}${pick(['', '%202026'])}`;
      case 'typo': return rand() < 0.5 ? `${typo(a)} ${b} 2026` : `${a}_${typo(b)}_26`;
      case 'snake': return `${a}_${b}_2026`;
      case 'newsletter': return `${a}_${b}${pick(['_newsletter', '_email', '_blast'])}`;
      case 'concat': return `${a}${b}${pick(['', '26'])}`;
      case 'camel': return `${title(a)}${title(b)}2026`;
      case 'kebab': return `${a}-${b}-26`;
      case 'abbrevDash': return pick([`${short}-26`, `${short}-26-${pick(SUFFIXES)}`]);
    }
  };
  const recase = (text: string) => (rand() < 0.5 ? text.toLowerCase() : text.toUpperCase());
  const months: SourceRow[][] = SAMPLE_MONTHS.map(() => []);

  const place = (team: Team, campaign: string, span: [number, number], scale = 1) => {
    const channel = weighted(team.channels.map((c) => [c, c.weight] as [Channel, number]));
    const content = pick(team.contents);
    const parts: UtmParts = {
      source: pick(channel.sources),
      medium: pick(channel.mediums),
      campaign,
      content: team.upper ? content.toUpperCase() : content,
      term: team.terms.length && channel.mediums.some((m) => /cpc|ppc|search/i.test(m)) ? pick(team.terms) : '',
    };
    const [low, high] = team.sessions;
    const base = (low + rand() * rand() * (high - low)) * scale;
    for (let month = span[0]; month <= span[1]; month++) {
      if (rand() < 0.12) continue; // not every placement runs every month
      const sessions = Math.max(1, Math.round(base * (0.6 + rand() * 0.8)));
      // Now and then the same UTM is typed with different capitals: the same UTM, a new spelling.
      const spelled = rand() < 0.12 ? { ...parts, source: recase(parts.source) } : parts;
      months[month]!.push({
        ...spelled,
        period: SAMPLE_MONTHS[month]!.period,
        sessions,
        keyEvents: Math.round(sessions * (0.005 + rand() * 0.035)),
      });
    }
  };

  for (const campaign of CAMPAIGNS) {
    for (const team of TEAMS) {
      const styles = Object.entries(team.styles) as [Style, number][];
      const spellings = [weighted(styles), weighted(styles), weighted(styles)].map((style) => spell(style, campaign));
      for (let i = 0; i < PLACEMENTS; i++) {
        place(team, weighted([[spellings[0]!, 5], [spellings[1]!, 3], [spellings[2]!, 2]]), campaign.months);
      }
    }
  }
  for (let i = 0; i < 8; i++) place(TEAMS[1]!, pick(ALWAYS_ON), [0, 8], 1.4);
  for (const team of TEAMS) for (const [campaign, span] of team.noise) place(team, campaign, span, 0.15);
  for (const [team, campaign, month] of AMBIGUOUS) place(TEAMS[team]!, campaign, [month, month]);
  return months;
}

let cache: SourceRow[][] | null = null;

/** The rows for one month of the sample (0 = January 2026). */
export function sampleRows(month: number): SourceRow[] {
  cache ??= generate();
  return (cache[month] ?? []).map((row) => ({ ...row }));
}
