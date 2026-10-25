/**
 * The audit log: every search, who ran it, and the reason they typed. Plate
 * reader systems keep one. A reason field accepts anything ("inv", "asdf",
 * "protest"), and a log only protects anyone if someone reads it.
 */
export type ToolId = 'plates' | 'location' | 'stingray' | 'face' | 'acoustic' | 'social' | 'forecast' | 'dossier';

export interface AuditEntry {
  id: number;
  /** Simulation time. */
  t: number;
  tool: ToolId;
  user: string;
  query: string;
  reason: string;
  /** People whose records came back. */
  people: number[];
}

export class AuditLog {
  entries: AuditEntry[] = [];
  /** Everyone whose data any search has touched this shift. */
  touched = new Set<number>();
  private listeners: (() => void)[] = [];

  add(entry: Omit<AuditEntry, 'id'>): AuditEntry {
    const full = { ...entry, id: this.entries.length + 1 };
    this.entries.push(full);
    for (const p of entry.people) this.touched.add(p);
    for (const l of this.listeners) l();
    return full;
  }

  /** Marks people as touched without a new entry (a search widened after the fact). */
  touch(people: Iterable<number>): void {
    for (const p of people) this.touched.add(p);
    for (const l of this.listeners) l();
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  byUser(user: string): AuditEntry[] {
    return this.entries.filter((e) => e.user === user);
  }
}
