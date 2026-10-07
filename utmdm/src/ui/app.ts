import { classifyWorkspace, coverage, outstanding } from '../core/classify';
import { createDemoWorkspace, nextSampleMonth, refreshFromSample } from '../core/demo';
import type { Store } from '../core/store';
import { SAMPLE_SOURCE } from '../sources/sample';
import { button } from './components';
import type { Ctx } from './ctx';
import { fill, h } from './dom';
import { fmtInt } from './format';
import { icon } from './icons';
import { dashboardView } from './views/dashboard';
import { historyView } from './views/history';
import { rulesView } from './views/rules';
import { utmsView } from './views/utms';
import { PAGES, hashFor, parseRoute } from './routes';

export function startApp(root: HTMLElement, store: Store, clock: () => string = () => new Date().toISOString()): void {
  let ws = store.load() ?? createDemoWorkspace(clock());
  store.save(ws);
  let results = classifyWorkspace(ws);
  let refreshing = false;
  let route = parseRoute(location.hash);

  const toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  const toast = (message: string) => {
    const note = h('div', { class: 'toast' }, icon('check', 16), h('span', null, message));
    toastRegion.append(note);
    setTimeout(() => note.classList.add('is-leaving'), 4200);
    setTimeout(() => note.remove(), 4600);
  };

  const ctx: Ctx = {
    get ws() { return ws; },
    get results() { return results; },
    get refreshing() { return refreshing; },
    get params() { return route.params; },
    now: clock,
    commit(next, message) {
      if (next === ws) {
        toast('Nothing changed, so no new version.');
        return;
      }
      ws = next;
      results = classifyWorkspace(ws);
      store.save(ws);
      render();
      if (message) toast(message);
    },
    go(hash) {
      if (location.hash === hash) render();
      else location.hash = hash;
    },
    toast,
    async refresh() {
      const month = nextSampleMonth(ws);
      if (refreshing) return;
      if (!month) {
        toast("The sample data ends in September 2026, so you're up to date.");
        return;
      }
      refreshing = true;
      render();
      await new Promise((resolve) => setTimeout(resolve, 700)); // the feel of a real pull
      const next = refreshFromSample(ws, clock())!;
      refreshing = false;
      const pulled = next.refreshes.at(-1)!;
      const nextResults = classifyWorkspace(next);
      const newOpen = outstanding(next.utms.filter((u) => pulled.newKeys.includes(u.key)), nextResults).length;
      ctx.commit(next, `Pulled ${month.label}: ${fmtInt(pulled.rows)} rows, ${fmtInt(pulled.newUtms)} new UTMs, ${fmtInt(newOpen)} of them outstanding.`);
    },
    reset() {
      if (!window.confirm('Start the demo over? Your rules, versions and refreshes in this browser will be replaced.')) return;
      store.clear();
      ctx.commit(createDemoWorkspace(clock()), 'The demo is back to its first day.');
    },
  };

  function render(): void {
    const focused = document.activeElement?.id;
    route = parseRoute(location.hash);
    const view = { dashboard: dashboardView, utms: utmsView, rules: rulesView, history: historyView }[route.page](ctx);
    fill(root, h('a', { class: 'skip', href: '#main' }, 'Skip to content'), topbar(), h('main', { id: 'main', class: 'page' }, view),
      footer(), toastRegion);
    document.title = `${PAGES.find((p) => p.page === route.page)!.label} · UTMDM`;
    if (focused) document.getElementById(focused)?.focus();
  }

  function topbar(): HTMLElement {
    const next = nextSampleMonth(ws);
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#/' }, logo(), h('span', { class: 'brand-name' }, 'UTMDM'),
          h('span', { class: 'brand-tag' }, 'UTM master data')),
        h('nav', { class: 'nav', 'aria-label': 'Main' },
          ...PAGES.map(({ page, label }) =>
            h('a', { href: hashFor(page), class: 'nav-link', 'aria-current': page === route.page ? 'page' : null }, label))),
        h(
          'div',
          { class: 'topbar-actions' },
          route.page === 'dashboard' ? null : button(refreshing ? 'Pulling…' : next ? 'Refresh' : 'Up to date', {
            icon: 'refresh',
            kind: 'secondary',
            busy: refreshing,
            disabled: refreshing || !next,
            onClick: () => void ctx.refresh(),
            title: next ? `Pull ${next.label} from ${SAMPLE_SOURCE}` : 'The sample data ends in September 2026',
          }),
          themeToggle(),
          account(),
        ),
      ),
    );
  }

  function account(): HTMLElement {
    const name = h('input', { id: 'account-name', value: ws.user, maxlength: 40, 'aria-label': 'Your name' });
    return h(
      'details',
      { class: 'account' },
      h('summary', { class: 'account-chip', title: 'Account' }, h('span', { class: 'avatar' }, (ws.user[0] ?? 'Y').toUpperCase()),
        h('span', { class: 'account-name' }, ws.user)),
      h(
        'div',
        { class: 'account-panel' },
        h('p', { class: 'account-title' }, icon('lock', 16), 'Only you, for now'),
        h('p', null, 'Sign-in arrives with the hosted database. Until then this workspace lives in this browser, and nobody else sees it.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Your name, as it appears on versions'), name),
        button('Save name', {
          kind: 'primary',
          onClick: () => {
            const value = name.value.replace(/\s+/g, ' ').trim();
            if (value && value !== ws.user) ctx.commit({ ...ws, user: value }, `Saved. New versions will say ${value}.`);
          },
        }),
      ),
    );
  }

  function footer(): HTMLElement {
    const cov = coverage(ws.utms, results);
    return h(
      'footer',
      { class: 'footer' },
      h('p', null, h('strong', null, 'UTMDM'), ` demo · ${fmtInt(cov.utms)} UTMs of fictional data for Zestify, a made-up brand · `,
        'everything stays in this browser.'),
    );
  }

  window.addEventListener('hashchange', () => {
    render();
    document.querySelector<HTMLElement>('.drawer [data-autofocus]')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && route.params.size) {
      const close = document.querySelector<HTMLAnchorElement>('.drawer .drawer-close');
      if (close) location.hash = close.getAttribute('href') ?? '#/';
    }
  });
  render();
}

function logo(): HTMLElement {
  return h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('database', 18));
}

function themeToggle(): HTMLElement {
  const dark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const control = button(icon(dark() ? 'sun' : 'moon'), {
    kind: 'ghost',
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
  control.setAttribute('aria-label', 'Switch light or dark theme');
  return control;
}
