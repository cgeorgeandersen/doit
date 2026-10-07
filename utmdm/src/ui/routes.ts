export type Page = 'dashboard' | 'utms' | 'rules' | 'history';

export const PAGES: { page: Page; label: string }[] = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'utms', label: 'UTM table' },
  { page: 'rules', label: 'Rules' },
  { page: 'history', label: 'History' },
];

export function parseRoute(hash: string): { page: Page; params: URLSearchParams } {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page = PAGES.find((p) => p.page === path)?.page ?? 'dashboard';
  return { page, params: new URLSearchParams(query) };
}

/** A link inside the app, e.g. hashFor('utms', { status: 'outstanding' }) → "#/utms?status=outstanding". */
export function hashFor(page: Page, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return `#/${page === 'dashboard' ? '' : page}${query ? `?${query}` : ''}`;
}
