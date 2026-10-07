import { describe, expect, it } from 'vitest';
import { createDemoWorkspace } from '../src/core/demo';
import { apply, emptyTable } from '../src/core/table';
import { latest, openBook } from '../src/core/workspace';
import { sqlName, warehouseColumns, warehouseDdl } from '../src/core/warehouse';

describe('the warehouse table', () => {
  it('turns column names into names a warehouse accepts, without collisions', () => {
    const taken = new Set(['utm_source', 'utm_campaign']);
    expect(sqlName('Budget owner', taken)).toBe('budget_owner');
    expect(sqlName('Budget-Owner!', taken)).toBe('budget_owner_2');
    expect(sqlName('UTM Campaign', taken)).toBe('utm_campaign_2');
    expect(sqlName('2026 Plan', taken)).toBe('c_2026_plan');
    expect(sqlName('***', taken)).toBe('column');
  });

  it('defines one row per UTM, one column per classification, and the version', () => {
    const t = latest(openBook(createDemoWorkspace('2026-10-07T12:00:00.000Z')));
    const ddl = warehouseDdl(t);
    expect(ddl.startsWith('create table utmdm.utm_classifications (')).toBe(true);
    for (const name of ['utm_key', 'utm_source', 'utm_term', 'channel', 'campaign', 'type', 'rules_version', 'exported_at']) {
      expect(ddl).toMatch(new RegExp(`\\n  ${name}\\s+(varchar|integer|timestamp)`));
    }
    expect(ddl).toContain('  primary key (utm_key)\n);');
    expect(warehouseColumns(t).map((c) => c.sql)).toEqual(['channel', 'campaign', 'type']);
  });

  it('follows the columns the team adds', () => {
    const t = apply(emptyTable(), { type: 'addColumn', column: { id: 'c1', name: 'Budget owner' } }, () => undefined);
    expect(warehouseDdl(t)).toMatch(/\n {2}budget_owner\s+varchar,\s+-- Budget owner\n/);
  });
});
