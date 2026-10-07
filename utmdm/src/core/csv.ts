import { utmStatus, type Results } from './classify';
import { UTM_PARTS, type Workspace } from './model';

function cell(value: string | number): string {
  const text = String(value);
  // Quote anything with a comma, quote or line break; neutralize spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The UTM table with every classification, the rule behind it, and the rules version it came from. */
export function utmTableCsv(ws: Workspace, results: Results): string {
  const version = ws.versions.at(-1)?.number ?? 0;
  const header = [
    ...UTM_PARTS.map((part) => `utm_${part}`),
    'first_seen',
    'last_seen',
    'sessions',
    'key_events',
    'status',
    ...ws.fields.flatMap((field) => [field.name.toLowerCase(), `${field.name.toLowerCase()}_rule`]),
    'rules_version',
  ];
  const rows = ws.utms.map((utm) => {
    const classification = results.get(utm.key);
    return [
      ...UTM_PARTS.map((part) => utm.raw[part]),
      utm.firstSeen,
      utm.lastSeen,
      utm.sessions,
      utm.keyEvents,
      utmStatus(classification),
      ...ws.fields.flatMap((field) => {
        const outcome = classification?.[field.id];
        const value = outcome?.status === 'classified' ? outcome.value! : `[${outcome?.status ?? 'outstanding'}]`;
        return [value, (outcome?.rules ?? []).map((rule) => rule.id).join(' ')];
      }),
      version,
    ];
  });
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}
