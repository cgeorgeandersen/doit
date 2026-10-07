import type { Condition, MatchOp, Op, Rule, UtmPart, UtmParts, Workspace } from './model';
import { describeRule } from './rules';
import { addUtms, emptyWorkspace, latest, openBook, record, type Book, type Draft } from './workspace';

/*
 * The demo workspace: Zestify, a fictional beverage brand, and the UTMs four
 * fictional teammates have been tagging links with. It starts the way a real
 * team's table would after a couple of weeks: three columns, a few rules,
 * some typed values, and plenty still empty.
 */

export const DEMO_NAME = 'Zestify Marketing';
export const DEMO_USER = 'You';

interface Team {
  who: string;
  channels: [source: string, medium: string][];
  campaigns: string[];
  contents: string[];
  terms?: string[];
}

const TEAMS: Team[] = [
  {
    who: 'Maya (Social)',
    channels: [['facebook', 'paid_social'], ['FB', 'PAID_SOCIAL'], ['fb', 'cpc'], ['instagram', 'paid_social'], ['ig', 'paid_social'], ['tiktok', 'paid_social']],
    campaigns: ['summer_cup_2026', 'SUMMER_CUP_LAUNCH', 'sc26_promo', 'winter_warmup_2026', 'WW26_PROMO', 'spring_refresh_2026', 'SR26_launch', 'brand_always_on'],
    contents: ['video_15s', 'carousel', 'story', 'static'],
  },
  {
    who: 'Theo (Search)',
    channels: [['google', 'cpc'], ['Google Ads', 'Paid Search'], ['bing', 'ppc']],
    campaigns: ['Summer Cup 2026', 'summer%20cup', 'winter_warmup', 'spring_reresh', 'Spring Refresh 2026', 'brand_always_on'],
    contents: ['rsa_1', 'rsa_2'],
    terms: ['zestify soda', 'lemon lime soda', 'zero sugar soda'],
  },
  {
    who: 'Ana (Lifecycle)',
    channels: [['newsletter', 'email'], ['sfmc', 'email'], ['email', 'e-mail'], ['sms', 'sms'], ['text', 'sms']],
    campaigns: ['weekly_newsletter', 'welcome_series', 'summer_cup_newsletter', 'winterWarmup', 'order_confirmation', 'password_reset', 'delivery_window_reminder', 'holiday_hours'],
    contents: ['hero_banner', 'cta_button', 'footer_link'],
  },
  {
    who: 'Leo (Regional)',
    channels: [['meta', 'paid-social'], ['facebook', 'social'], ['tiktok', 'paid-social'], ['programmatic', 'display'], ['youtube', 'video']],
    campaigns: ['summer-cup', 'spring-into-summer-cup', 'winter-warmup', 'always-on-brand', 'store-locator-update'],
    contents: ['video_6s', 'static', 'ugc_clip'],
  },
];

// A later paste: the Fall Kickoff links, once the campaign started.
const FALL: Team[] = [
  { ...TEAMS[0]!, campaigns: ['fall_kickoff_2026', 'FK26_TEASER'] },
  { ...TEAMS[1]!, campaigns: ['Fall Kickoff 2026'] },
  { ...TEAMS[3]!, campaigns: ['fall-kickoff'] },
];

/** mulberry32: a small seeded random generator, so every visitor gets the same demo. */
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

function rowsFor(teams: Team[], seed: number): UtmParts[] {
  const rand = random(seed);
  const pick = <T>(list: readonly T[], n: number): T[] => {
    const pool = [...list];
    const out: T[] = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
    return out;
  };
  const rows: UtmParts[] = [];
  for (const team of teams) {
    for (const campaign of team.campaigns) {
      // Lifecycle messages go out by email or text, never both from every tool.
      for (const [source, medium] of pick(team.channels, 2 + Math.floor(rand() * 2))) {
        for (const content of pick(team.contents, 1 + Math.floor(rand() * 2))) {
          const term = team.terms && /cpc|ppc|search/i.test(medium) ? pick(team.terms, 1)[0]! : '';
          rows.push({ source, medium, campaign, content, term });
        }
      }
    }
  }
  // The same links typed again by someone else: louder, or with an encoded space. They merge.
  for (const row of rows.filter((_, i) => i % 11 === 3)) {
    rows.push({ ...row, campaign: row.campaign.toUpperCase(), source: row.source.toUpperCase() });
  }
  return rows;
}

export const demoRows = (): UtmParts[] => rowsFor(TEAMS, 2026);
export const fallRows = (): UtmParts[] => rowsFor(FALL, 909);

const when = (part: UtmPart, op: MatchOp, text: string, ...more: Condition[]): Condition[] => [{ part, op, text }, ...more];
const rule = (id: string, column: string, conditions: Condition[], value: string): Rule => ({ id, column, when: conditions, value });

const CHANNEL = 'c2';
const CAMPAIGN = 'c2-1';
const TYPE = 'c2-2';

const RULES: [author: string, column: string, rules: Rule[]][] = [
  ['Maya (Social)', CHANNEL, [
    rule('r3', CHANNEL, when('medium', 'contains', 'social'), 'Social'),
    rule('r3-1', CHANNEL, when('source', 'contains', 'google', { part: 'medium', op: 'is', text: 'cpc' }), 'Search'),
    rule('r3-2', CHANNEL, when('medium', 'is', 'email'), 'Email'),
    rule('r3-3', CHANNEL, when('medium', 'is', 'sms'), 'SMS'),
    rule('r3-4', CHANNEL, when('medium', 'is', 'display'), 'Display'),
  ]],
  ['Theo (Search)', CAMPAIGN, [
    rule('r4', CAMPAIGN, when('campaign', 'contains', 'cup'), 'Summer Cup'),
    rule('r4-1', CAMPAIGN, when('campaign', 'contains', 'winter'), 'Winter Warmup'),
    rule('r4-2', CAMPAIGN, when('campaign', 'contains', 'spring'), 'Spring Refresh'),
    rule('r4-3', CAMPAIGN, when('campaign', 'contains', 'always'), 'Always On'),
    rule('r4-4', CAMPAIGN, when('campaign', 'contains', 'fall'), 'Fall Kickoff'),
  ]],
  ['Ana (Lifecycle)', TYPE, [
    rule('r5', TYPE, when('campaign', 'is', 'password_reset'), 'Operational'),
    rule('r5-1', TYPE, when('campaign', 'is', 'order_confirmation'), 'Operational'),
    rule('r5-2', TYPE, when('campaign', 'contains', 'newsletter'), 'Marketing'),
    rule('r5-3', TYPE, when('campaign', 'contains', 'winter'), 'Marketing'),
    rule('r5-4', TYPE, when('campaign', 'contains', 'spring'), 'Marketing'),
    rule('r5-5', TYPE, when('campaign', 'contains', 'always'), 'Marketing'),
    rule('r5-6', TYPE, when('campaign', 'contains', 'fall'), 'Marketing'),
  ]],
];

/** The demo as a list of changes, the way the team would have made them, ending `at`. */
export function createDemoWorkspace(at: string): Workspace {
  const end = new Date(at).getTime();
  const hoursAgo = (h: number) => new Date(end - h * 3_600_000).toISOString();
  let book: Book = openBook(emptyWorkspace(DEMO_NAME, DEMO_USER));
  const save = (draft: Draft, author: string, hours: number) => {
    book = record(book, draft, hoursAgo(hours), author) ?? book;
  };

  save(addUtms(latest(book), demoRows(), 'the team spreadsheet'), 'Maya (Social)', 330);
  save({
    op: { type: 'batch', ops: [CHANNEL, CAMPAIGN, TYPE].map((id, i) => ({ type: 'addColumn', column: { id, name: ['Channel', 'Campaign', 'Type'][i]! } })) },
    summary: 'Added columns Channel, Campaign and Type',
  }, 'Maya (Social)', 329);
  RULES.forEach(([author, column, rules], i) => {
    const table = latest(book);
    const name = table.columns.find((c) => c.id === column)!.name;
    save({
      op: { type: 'batch', ops: rules.map((r): Op => ({ type: 'addRule', rule: r })) },
      summary: `Added ${rules.length} rules for ${name}, starting with: ${describeRule(rules[0]!, table)}`,
    }, author, 300 - i * 40);
  });
  const typed = latest(book).utms.filter((u) => u.parts.campaign === 'holiday_hours' || u.parts.campaign === 'delivery_window_reminder');
  save({
    op: { type: 'batch', ops: typed.map((u): Op => ({ type: 'setCell', column: TYPE, utm: u.key, value: 'Operational' })) },
    summary: `Typed Operational in Type for ${typed.length} holiday hours and delivery reminder UTMs`,
  }, 'Ana (Lifecycle)', 150);
  const bing = latest(book).utms.filter((u) => u.parts.source === 'bing');
  save({
    op: { type: 'batch', ops: bing.map((u): Op => ({ type: 'setCell', column: CHANNEL, utm: u.key, value: 'Search' })) },
    summary: `Typed Search in Channel for ${bing.length} bing UTMs`,
  }, 'Theo (Search)', 96);
  save(addUtms(latest(book), fallRows(), 'a list of Fall Kickoff links'), 'Leo (Regional)', 20);
  return book.ws;
}
