/** The three project statuses, shared by the content schema, the status pill and the /projects filter. */
export const PROJECT_STATUSES = ['live', 'in progress', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'Live',
  'in progress': 'In progress',
  archived: 'Archived',
};

/** "in progress" → "in-progress", for CSS classes and URL parameters. */
export function statusSlug(status: ProjectStatus): string {
  return status.replace(' ', '-');
}
