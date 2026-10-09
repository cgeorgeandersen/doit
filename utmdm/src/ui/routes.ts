export type Page = 'table' | 'rules' | 'builder' | 'data' | 'history';

export const PAGES: { page: Page; label: string }[] = [
  { page: 'table', label: 'Table' },
  { page: 'rules', label: 'Rules' },
  { page: 'builder', label: 'UTM builder' },
  { page: 'data', label: 'Import & export' },
  { page: 'history', label: 'History' },
];

export function parseRoute(hash: string): { page: Page; params: URLSearchParams } {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page = PAGES.find((p) => p.page === path)?.page ?? 'table';
  return { page, params: new URLSearchParams(query) };
}

/** A link inside the app, e.g. hashFor('table', { show: 'open' }) → "#/?show=open". */
export function hashFor(page: Page, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return `#/${page === 'table' ? '' : page}${query ? `?${query}` : ''}`;
}
