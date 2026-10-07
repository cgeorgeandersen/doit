import { createDemoWorkspace } from '../core/demo';
import type { Workspace } from '../core/model';
import type { Store } from '../core/store';
import { resolve, type Grid } from '../core/table';
import { latest, openBook, record, undo, versionOf, type Book } from '../core/workspace';
import { button } from './components';
import type { Ctx, ToastAction } from './ctx';
import { fill, h } from './dom';
import { icon } from './icons';
import { PAGES, hashFor, parseRoute } from './routes';
import { historyView } from './views/history';
import { rulesView } from './views/rules';
import { tableView } from './views/table';

export function startApp(root: HTMLElement, store: Store, clock: () => string = () => new Date().toISOString()): void {
  let book: Book = open(store.load() ?? createDemoWorkspace(clock()));
  let grid: Grid = resolve(latest(book));
  let route = parseRoute(location.hash);
  store.save(book.ws);

  function open(ws: Workspace): Book {
    try {
      return openBook(ws);
    } catch {
      return openBook(createDemoWorkspace(clock()));
    }
  }

  const toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  function toast(message: string, actions: ToastAction[] = []): void {
    const note = h('div', { class: 'toast' }, icon('check', 16), h('span', { class: 'toast-text' }, message));
    const dismiss = () => {
      note.classList.add('is-leaving');
      setTimeout(() => note.remove(), 300);
    };
    if (actions.length) {
      note.append(h('span', { class: 'toast-actions' }, ...actions.map((a) =>
        h('button', { type: 'button', class: 'toast-action', onclick: () => { dismiss(); a.run(); } }, a.label))));
    }
    toastRegion.querySelectorAll('.toast').forEach((old, i, all) => i < all.length - 1 && old.remove());
    toastRegion.append(note);
    setTimeout(dismiss, actions.length ? 9000 : 4500);
  }

  // A change made while the pointer is down (an edit saved because you clicked
  // somewhere else) re-renders once the click lands, so the click isn't lost.
  let pointerDown = false;
  let pending = false;
  document.addEventListener('pointerdown', () => (pointerDown = true), true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    setTimeout(() => pending && render(), 0);
  }, true);
  const schedule = () => (pointerDown ? (pending = true) : render());

  function set(next: Book): void {
    book = next;
    grid = resolve(latest(book));
    store.save(book.ws);
  }

  const ctx: Ctx = {
    get book() { return book; },
    get ws() { return book.ws; },
    get table() { return latest(book); },
    get grid() { return grid; },
    get version() { return versionOf(book); },
    get params() { return route.params; },
    now: clock,
    commit(draft, options = {}) {
      const next = record(book, draft, clock());
      if (!next) {
        schedule();
        return null;
      }
      set(next);
      const version = versionOf(book);
      schedule();
      toast(options.message ?? `Saved as version ${version}. ${draft.summary}.`, [
        { label: 'Undo', run: () => undoVersion(version) },
        ...(options.actions ?? []),
      ]);
      return version;
    },
    render: schedule,
    go(hash) {
      if (location.hash === hash || (hash === '#/' && !location.hash)) render();
      else location.hash = hash;
    },
    toast,
    setUser(name) {
      set({ ...book, ws: { ...book.ws, user: name } });
      render();
      toast(`Thanks, ${name}. Your changes will show your name in History.`);
    },
    replace(ws, message) {
      set(open(ws));
      render();
      toast(message);
    },
  };

  function undoVersion(version: number): void {
    if (versionOf(book) !== version) {
      toast(`Version ${version} isn't the latest any more. Restore an earlier version from History instead.`);
      return;
    }
    const next = record(book, undo(book, version), clock());
    if (!next) return;
    set(next);
    render();
    toast(`Undone. That's saved too, as version ${versionOf(book)}.`);
  }

  function render(): void {
    pending = false;
    const focused = document.activeElement?.id;
    const scrollLeft = root.querySelector('.table-wrap')?.scrollLeft ?? 0;
    route = parseRoute(location.hash);
    const view = { table: tableView, rules: rulesView, history: historyView }[route.page](ctx);
    fill(root, h('a', { class: 'skip', href: '#main' }, 'Skip to content'), topbar(), h('main', { id: 'main', class: 'page' }, view),
      footer(), toastRegion);
    document.title = `${PAGES.find((p) => p.page === route.page)!.label} · UTMDM`;
    const wrap = root.querySelector('.table-wrap');
    if (wrap) wrap.scrollLeft = scrollLeft;
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }

  function topbar(): HTMLElement {
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#/' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('database', 18)),
          h('span', { class: 'brand-name' }, 'UTMDM')),
        h('span', { class: 'workspace', title: 'The shared workspace. In this demo it lives in your browser.' },
          icon('columns', 14), book.ws.name),
        h('nav', { class: 'nav', 'aria-label': 'Main' },
          ...PAGES.map(({ page, label }) =>
            h('a', { href: hashFor(page), class: 'nav-link', 'aria-current': page === route.page ? 'page' : null }, label))),
        h('div', { class: 'topbar-actions' },
          h('a', { class: 'saved', href: hashFor('history'), title: 'Every change is saved as a version' },
            icon('check', 14), `Saved · v${versionOf(book)}`),
          themeToggle(), account()),
      ),
    );
  }

  function account(): HTMLElement {
    const name = h('input', { id: 'account-name', value: book.ws.user, maxlength: 40, 'aria-label': 'Your name' });
    const save = (event: Event) => {
      event.preventDefault();
      const value = name.value.replace(/\s+/g, ' ').trim();
      if (value && value !== book.ws.user) ctx.setUser(value);
    };
    return h(
      'details',
      { class: 'account' },
      h('summary', { class: 'account-chip', title: 'Account' }, h('span', { class: 'avatar' }, (book.ws.user[0] ?? 'Y').toUpperCase()),
        h('span', { class: 'account-name' }, book.ws.user)),
      h(
        'form',
        { class: 'account-panel', onsubmit: save },
        h('p', { class: 'account-title' }, icon('lock', 16), 'Just you, for now'),
        h('p', null, 'Sign-in and a shared database come next, so your whole team works in this one table. ',
          'Until then the workspace lives in this browser.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Your name, as History shows it'), name),
        button('Save name', { kind: 'primary', type: 'submit' }),
      ),
    );
  }

  function footer(): HTMLElement {
    return h('footer', { class: 'footer' },
      h('p', null, h('strong', null, 'UTMDM'), ' demo. Zestify and its team are made up, and so are their UTMs. ',
        'Everything you do here stays in this browser.'));
  }

  window.addEventListener('hashchange', () => {
    render();
    document.querySelector<HTMLElement>('.drawer [data-autofocus]')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const close = document.querySelector<HTMLAnchorElement>('.drawer .drawer-close');
    if (close) location.hash = close.getAttribute('href') ?? '#/';
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
  });
  render();
}

function themeToggle(): HTMLElement {
  const dark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const control = button(null, {
    kind: 'ghost',
    icon: dark() ? 'sun' : 'moon',
    label: 'Switch light or dark theme',
    title: dark() ? 'Light theme' : 'Dark theme',
    onClick: () => {
      const theme = dark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem('utmdm-theme', theme);
      } catch {
        // the choice lasts for this visit
      }
      control.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'));
      control.title = theme === 'dark' ? 'Light theme' : 'Dark theme';
    },
  });
  return control;
}
