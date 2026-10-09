import { createDemoWorkspace, DEMO_NAME } from '../core/demo';
import type { Workspace } from '../core/model';
import { emptyWorkspace } from '../core/workspace';
import type { Ctx } from './ctx';
import { hashFor } from './routes';

/** What a workspace started empty is called. */
export const OWN_NAME = 'My UTMs';

/** True while the workspace is still the Zestify sample, so the app can offer a way out of it. */
export const isSample = (ws: Workspace): boolean => ws.name === DEMO_NAME;

/** Clears out the sample (or anything else) for an empty table: no UTMs, columns, rules or history. */
export function startEmpty(ctx: Ctx): void {
  const what = isSample(ctx.ws) ? 'the Zestify sample data' : 'every UTM, column, rule and version in this workspace';
  if (!window.confirm(`Start with an empty table? This clears ${what}, including its history, and can't be undone. ` +
    'Download a backup first if you might want it back.')) return;
  // A table keeps the name someone gave it; only the sample's name goes with the sample.
  ctx.replace(emptyWorkspace(isSample(ctx.ws) ? OWN_NAME : ctx.ws.name, ctx.ws.user), 'Your table is empty and ready for your own UTMs.');
  ctx.go(hashFor('table'));
}

/** Puts the Zestify sample back, replacing whatever is in the workspace. */
export function loadSample(ctx: Ctx): void {
  if (!window.confirm('Load the Zestify sample data? It replaces everything in this workspace, including its history.')) return;
  ctx.replace({ ...createDemoWorkspace(ctx.now()), user: ctx.ws.user }, 'The Zestify sample is back to where it started.');
}
