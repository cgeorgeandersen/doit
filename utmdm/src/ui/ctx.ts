import type { Table, Workspace } from '../core/model';
import type { Grid } from '../core/table';
import type { Book, Draft } from '../core/workspace';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface CommitOptions {
  /** Replaces the default "Saved version n: …" message. */
  message?: string;
  /** Buttons after Undo, such as "Make it a rule". */
  actions?: ToastAction[];
}

/** What every screen can read and do. */
export interface Ctx {
  readonly book: Book;
  readonly ws: Workspace;
  readonly table: Table;
  readonly grid: Grid;
  readonly version: number;
  readonly params: URLSearchParams;
  now(): string;
  /** Saves a change as the next version and re-renders. Returns the new version, or null if nothing changed. */
  commit(draft: Draft, options?: CommitOptions): number | null;
  /** Re-renders without a change, after the current click finishes. */
  render(): void;
  go(hash: string): void;
  toast(message: string, actions?: ToastAction[]): void;
  setUser(name: string): void;
  /** Replaces the whole workspace (a backup, or the demo again). */
  replace(ws: Workspace, message: string): void;
}
