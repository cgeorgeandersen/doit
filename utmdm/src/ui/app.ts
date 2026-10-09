import { createDemoWorkspace } from '../core/demo';
import type { Workspace } from '../core/model';
import type { Account } from '../cloud/auth';
import { TableLimitError, type Tables } from '../cloud/cloud-store';
import type { SaveStatus, Store } from '../core/store';
import { resolve, type Grid } from '../core/table';
import { emptyWorkspace, latest, openBook, record, undo, versionOf, withTaxonomyOf, type Book } from '../core/workspace';
import { button, field, themeToggle, wordmark } from './components';
import { isSample } from './fresh-start';
import type { Ctx, ToastAction } from './ctx';
import { fill, h } from './dom';
import { icon } from './icons';
import { PAGES, hashFor, parseRoute } from './routes';
import { builderView } from './views/builder';
import { dataView } from './views/data';
import { historyView } from './views/history';
import { rulesView } from './views/rules';
import { tableView } from './views/table';

export interface AppOptions {
  /** The signed-in account, when the workspace is kept in the cloud. */
  account?: Account;
  /** Turns on the GA4 import. */
  googleClientId?: string;
  /** The account's tables, when it can have more than one. */
  tables?: Tables;
  clock?: () => string;
}

export function startApp(root: HTMLElement, store: Store, options: AppOptions = {}): void {
  const clock = options.clock ?? (() => new Date().toISOString());
  const { account: signedIn, tables } = options;
  const fresh = (): Workspace => {
    const ws = createDemoWorkspace(clock());
    return signedIn ? { ...ws, user: signedIn.email.split('@')[0] ?? ws.user } : ws;
  };
  let book: Book = open(store.load() ?? fresh());
  let saveStatus: SaveStatus = 'saved';
  store.onStatus?.((status) => {
    const was = saveStatus;
    saveStatus = status;
    paintSaved();
    if (status === 'conflict' && was !== 'conflict') {
      toast('This workspace was changed in another tab or by someone else. Reload to see the latest before editing.',
        [{ label: 'Reload', run: () => location.reload() }]);
    } else if (status === 'failed' && was !== 'failed') {
      toast("Couldn't save that change to your account. Check your connection; the next change will try again.");
    } else if (status === 'signed-out') {
      toast('Your sign-in expired. Sign in again to keep saving.', [{ label: 'Sign in', run: () => location.reload() }]);
    }
  });
  let grid: Grid = resolve(latest(book));
  let route = parseRoute(location.hash);
  store.save(book.ws);

  function open(ws: Workspace): Book {
    try {
      return openBook(ws);
    } catch {
      return openBook(fresh());
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
    googleClientId: options.googleClientId,
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
    const kept = root.querySelector('.table-wrap');
    const [scrollLeft, scrollTop] = [kept?.scrollLeft ?? 0, kept?.scrollTop ?? 0];
    route = parseRoute(location.hash);
    const view = { table: tableView, rules: rulesView, builder: builderView, data: dataView, history: historyView }[route.page](ctx);
    fill(root, h('a', { class: 'skip', href: '#main' }, 'Skip to content'), topbar(), h('main', { id: 'main', class: 'page' }, view),
      footer(), toastRegion);
    document.title = `${PAGES.find((p) => p.page === route.page)!.label} · TagFluent`;
    const wrap = root.querySelector('.table-wrap');
    if (wrap) wrap.scrollTo({ left: scrollLeft, top: scrollTop });
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }

  function topbar(): HTMLElement {
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#/', 'aria-label': 'TagFluent, your table' }, wordmark()),
        tables
          ? tablePicker(tables)
          : h('span', { class: 'workspace', title: 'The workspace. In this copy it lives in your browser.' }, icon('columns', 14), book.ws.name),
        h('nav', { class: 'nav', 'aria-label': 'Main' },
          ...PAGES.map(({ page, label }) =>
            h('a', { href: hashFor(page), class: 'nav-link', 'aria-current': page === route.page ? 'page' : null }, label))),
        h('div', { class: 'topbar-actions' },
          savedChip(),
          themeToggle(), account()),
      ),
    );
  }

  /** Which table is open, the others to switch to, and + for a new one. */
  function tablePicker(t: Tables): HTMLElement {
    const list = t.list.some((x) => x.id === t.current) ? t.list : [...t.list, { id: t.current, name: book.ws.name }];
    const full = list.length >= t.limit;
    const name = h('input', { id: 'table-name', value: book.ws.name, maxlength: 60, required: true, 'aria-label': 'Table name' });
    const rename = (event: Event) => {
      event.preventDefault();
      const value = name.value.replace(/\s+/g, ' ').trim();
      if (!value || value === book.ws.name) return;
      set({ ...book, ws: { ...book.ws, name: value } });
      const entry = t.list.find((x) => x.id === t.current);
      if (entry) entry.name = value;
      render();
      toast(`Renamed this table to ${value}.`);
    };
    const remove = async () => {
      if (!window.confirm(`Delete "${book.ws.name}"? This deletes its UTMs, columns, rules and history, and can't be undone. ` +
        'Download a backup from Import & export first if you might want it back.')) return;
      try {
        await t.remove(t.current);
        t.open(t.list[0]!.id);
      } catch {
        toast("Couldn't delete that table. Check your connection and try again.");
      }
    };
    const newButton = (text: string | null) => button(text, {
      icon: 'plus', kind: text ? 'secondary' : 'ghost', label: text ? undefined : 'New table',
      title: full ? `Your account can have up to ${t.limit} tables` : 'New table',
      disabled: full, onClick: () => newTableDialog(t),
    });
    return h('div', { class: 'tables' },
      h('details', { class: 'tables-menu' },
        h('summary', { class: 'tables-chip', title: 'Switch tables' },
          icon('columns', 14), h('span', { class: 'tables-current' }, book.ws.name), icon('down', 14)),
        h('div', { class: 'tables-panel' },
          h('p', { class: 'tables-title' }, 'Your tables', h('span', { class: 'muted' }, `${list.length} of ${t.limit}`)),
          h('ul', { class: 'tables-list' }, ...list.map((x) => h('li', null,
            x.id === t.current
              ? h('span', { class: 'tables-item is-current', 'aria-current': 'true' }, icon('check', 14), book.ws.name)
              : h('button', { type: 'button', class: 'tables-item', onclick: () => t.open(x.id) }, h('span', { class: 'tables-dot' }), x.name)))),
          newButton('New table'),
          full ? h('p', { class: 'tables-note' }, `Your account can have up to ${t.limit} tables. Delete one to make room.`) : null,
          h('form', { class: 'tables-rename', onsubmit: rename },
            field('Rename this table', name),
            h('div', { class: 'form-actions' },
              button('Save name', { type: 'submit' }),
              button('Delete table', {
                kind: 'ghost', icon: 'trash', onClick: () => void remove(), disabled: list.length <= 1,
                title: list.length <= 1 ? 'Your only table stays. Add another first.' : undefined,
              }))))),
      newButton(null));
  }

  /** Name a new table, optionally starting from this one's columns and rules, and open it. */
  function newTableDialog(t: Tables): void {
    const name = h('input', { id: 'new-table-name', required: true, maxlength: 60, autocomplete: 'off', placeholder: 'e.g. Acme Co. or EU property' });
    const hasTaxonomy = ctx.table.columns.length > 0;
    const copy = h('input', { id: 'new-table-copy', type: 'checkbox', checked: hasTaxonomy, disabled: !hasTaxonomy });
    const status = h('p', { class: 'demo-status', role: 'status', 'aria-live': 'polite' });
    const submit = button('Create table', { kind: 'primary', type: 'submit' });
    const dialog: HTMLDialogElement = h('dialog', { class: 'demo-dialog table-dialog', 'aria-labelledby': 'new-table-title' },
      h('button', { type: 'button', class: 'button button-ghost button-icon demo-close', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close')),
      h('div', { class: 'demo-body' },
        h('h2', { id: 'new-table-title' }, 'New table'),
        h('p', { class: 'demo-intro' }, 'Each table has its own UTMs, columns, rules and history. Use one per client, brand or Google Analytics property.'),
        h('form', {
          class: 'demo-form',
          onsubmit: (event: Event) => {
            event.preventDefault();
            void create();
          },
        },
        field('Name', name),
        h('label', { class: 'check-field', for: 'new-table-copy' }, copy,
          h('span', null, h('strong', null, `Start with this table's columns and rules`),
            h('span', { class: 'field-hint' }, hasTaxonomy
              ? `${ctx.table.columns.length} columns and ${ctx.table.rules.length} rules from ${book.ws.name}, without its UTMs.`
              : 'This table has no columns yet, so the new one starts empty.'))),
        status,
        h('div', { class: 'form-actions' }, submit))));

    async function create(): Promise<void> {
      const value = name.value.replace(/\s+/g, ' ').trim();
      if (!value) return;
      submit.disabled = true;
      status.textContent = '';
      const ws = copy.checked ? withTaxonomyOf(ctx.table, value, book.ws.user, clock()) : emptyWorkspace(value, book.ws.user);
      try {
        t.open(await t.create(ws));
      } catch (error) {
        status.className = 'demo-status is-error';
        status.textContent = error instanceof TableLimitError
          ? `Your account can have up to ${error.limit} tables. Delete one to make room.`
          : "Couldn't create the table. Check your connection and try again.";
        submit.disabled = false;
      }
    }

    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (event) => event.target === dialog && dialog.close());
    root.querySelector<HTMLDetailsElement>('.tables-menu')?.removeAttribute('open');
    document.body.append(dialog);
    dialog.showModal();
    name.focus();
  }

  function savedChip(): HTMLElement {
    const chip = h('a', { class: `saved is-${saveStatus}`, href: hashFor('history'), title: 'Every change is saved as a version' });
    fillSaved(chip);
    return chip;
  }

  function fillSaved(chip: Element): void {
    const label = {
      saved: `Saved · v${versionOf(book)}`,
      saving: 'Saving…',
      failed: 'Not saved',
      conflict: 'Changed elsewhere',
      'signed-out': 'Signed out',
    }[saveStatus];
    chip.className = `saved is-${saveStatus}`;
    chip.replaceChildren(icon(saveStatus === 'saved' || saveStatus === 'saving' ? 'check' : 'outstanding', 14), label);
  }

  function paintSaved(): void {
    const chip = root.querySelector('.saved');
    if (chip) fillSaved(chip);
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
        signedIn
          ? [h('p', { class: 'account-title' }, icon('lock', 16), 'Signed in'),
            h('p', null, signedIn.email, '. Your workspace is saved to your account, so it follows you to any browser.')]
          : [h('p', { class: 'account-title' }, icon('lock', 16), 'Just you, for now'),
            h('p', null, 'This copy of the demo keeps the workspace in this browser.')],
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Your name, as History shows it'), name),
        h('div', { class: 'form-actions' },
          button('Save name', { kind: 'primary', type: 'submit' }),
          signedIn ? button('Sign out', { onClick: () => signedIn.signOut() }) : null),
      ),
    );
  }

  function footer(): HTMLElement {
    return h('footer', { class: 'footer' },
      h('p', null, h('strong', null, 'TagFluent'), isSample(book.ws) ? '. The sample data is made up: Zestify, its team and their UTMs. ' : '. ',
        signedIn ? 'Your workspace is saved to your account.' : 'Everything you do here stays in this browser.'));
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
