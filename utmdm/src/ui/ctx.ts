import type { Results } from '../core/classify';
import type { Workspace } from '../core/model';

/** What every view gets: the workspace, its classification, and the ways to change them. */
export interface Ctx {
  readonly ws: Workspace;
  readonly results: Results;
  readonly refreshing: boolean;
  readonly params: URLSearchParams;
  now(): string;
  /** Makes `next` the workspace: saves it, re-renders, and confirms with `message`. */
  commit(next: Workspace, message?: string): void;
  go(hash: string): void;
  toast(message: string): void;
  refresh(): Promise<void>;
  reset(): void;
}
