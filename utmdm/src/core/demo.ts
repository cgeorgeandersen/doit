import { SAMPLE_MONTHS, SAMPLE_SOURCE, sampleRows } from '../sources/sample';
import type { Field, Rule, Workspace } from './model';
import { DEFAULT_PRIORITY, checkRule, commitRules, emptyWorkspace, ingest, type RuleDraft } from './workspace';

/** The three classifications every UTM gets. Values can be added; the fields themselves are fixed for now. */
export const FIELDS: Field[] = [
  {
    id: 'channel',
    name: 'Channel',
    target: 'medium',
    description: 'Where the traffic came from, in your own channel names.',
    values: ['Paid Social', 'Paid Search', 'Display', 'Email', 'SMS', 'Organic Social'],
  },
  {
    id: 'campaign',
    name: 'Campaign',
    target: 'campaign',
    description: 'The campaign it belongs to. "No campaign" is a decision, not a default.',
    values: ['Winter Warmup 2026', 'Spring Refresh 2026', 'Summer Cup 2026', 'Fall Kickoff 2026', 'Always-on', 'No campaign'],
  },
  {
    id: 'type',
    name: 'Type',
    target: 'campaign',
    description: "Marketing, or operational and transactional sends that aren't marketing at all.",
    values: ['Marketing', 'Operational', 'Transactional'],
  },
];

/** What a team writes on day one: the obvious patterns for what it has seen so far. */
export const STARTER_RULES: RuleDraft[] = [
  { field: 'channel', target: 'medium', match: 'regex', pattern: 'paid[ _-]?social|paidsocial', value: 'Paid Social' },
  { field: 'channel', target: 'medium', match: 'regex', pattern: '^(cpc|ppc)$|paid search', value: 'Paid Search' },
  { field: 'channel', target: 'medium', match: 'regex', pattern: '^e-?mail$', value: 'Email' },
  { field: 'channel', target: 'medium', match: 'exact', pattern: 'sms', value: 'SMS' },
  { field: 'channel', target: 'medium', match: 'exact', pattern: 'display', value: 'Display' },
  { field: 'campaign', target: 'campaign', match: 'regex', pattern: 'winter[ _-]?warm[ _-]?up', value: 'Winter Warmup 2026' },
  { field: 'campaign', target: 'campaign', match: 'regex', pattern: 'spring[ _-]?refresh', value: 'Spring Refresh 2026' },
  { field: 'campaign', target: 'campaign', match: 'regex', pattern: 'always[ _-]?on', value: 'Always-on' },
  { field: 'campaign', target: 'campaign', match: 'regex', pattern: 'receipt|order[ _-]?confirmation', value: 'No campaign', priority: 50 },
  { field: 'type', target: 'medium', match: 'regex', pattern: 'paid|cpc|ppc|display', value: 'Marketing' },
  { field: 'type', target: 'campaign', match: 'regex', pattern: 'newsletter|blast|email', value: 'Marketing' },
  { field: 'type', target: 'campaign', match: 'regex', pattern: 'receipt|order[ _-]?confirmation|password', value: 'Transactional', priority: 50 },
  { field: 'type', target: 'campaign', match: 'contains', pattern: 'reminder', value: 'Operational', priority: 50 },
];

export const FIRST_LOAD_MONTHS = 4; // the demo opens with January to April loaded

/** The demo as a new visitor finds it: four months of UTMs and the starter rules. */
export function createDemoWorkspace(at: string): Workspace {
  let ws = emptyWorkspace(structuredClone(FIELDS));
  const rows = SAMPLE_MONTHS.slice(0, FIRST_LOAD_MONTHS).flatMap((_, month) => sampleRows(month));
  ws = ingest(ws, rows, { source: SAMPLE_SOURCE, period: 'Jan–Apr 2026', at });
  const rules: Rule[] = STARTER_RULES.map((draft, i) => {
    const checked = checkRule(ws, draft);
    return {
      id: `R${i + 1}`,
      field: checked.field,
      target: checked.target,
      match: checked.match,
      pattern: checked.pattern,
      value: checked.value,
      priority: checked.priority ?? DEFAULT_PRIORITY,
      active: true,
      author: 'Starter rules',
      createdAt: at,
      note: '',
    };
  });
  ws = commitRules({ ...ws, user: 'UTMDM demo' }, rules, 'Starter rules: the obvious patterns for what the team has seen so far', at);
  return { ...ws, user: 'You', sampleCursor: FIRST_LOAD_MONTHS };
}

export function nextSampleMonth(ws: Workspace): (typeof SAMPLE_MONTHS)[number] | null {
  return SAMPLE_MONTHS[ws.sampleCursor] ?? null;
}

/** Pulls the next month from the sample source, as the GA4 refresh will pull new rows. Null when it has no more. */
export function refreshFromSample(ws: Workspace, at: string): Workspace | null {
  const month = nextSampleMonth(ws);
  if (!month) return null;
  const next = ingest(ws, sampleRows(ws.sampleCursor), { source: SAMPLE_SOURCE, period: month.label, at });
  return { ...next, sampleCursor: ws.sampleCursor + 1 };
}
