import { fill, h } from './dom';
import { link, renderHome, type Template } from './home';
import { renderPoll } from './poll';

/**
 * Two pages: / to make a poll, /p/<id> to vote on one. Plain history routing;
 * vercel.json sends /p/* to index.html.
 */
export function startApp(root: HTMLElement): void {
  const page = h('main', { class: 'page', id: 'main' });
  let leave: (() => void) | undefined;

  function route(template?: Template): void {
    leave?.();
    leave = undefined;
    const match = /^\/p\/([a-z0-9]+)\/?$/.exec(location.pathname);
    if (match) leave = renderPoll(page, match[1]!, go);
    else renderHome(page, go, template);
  }

  function go(path: string, template?: Template): void {
    history.pushState(null, '', path);
    window.scrollTo(0, 0);
    route(template);
  }

  window.addEventListener('popstate', () => route());

  fill(
    root,
    h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
    h(
      'header',
      { class: 'site-head' },
      h(
        'a',
        { class: 'brand', href: '/', onclick: link(go, '/') },
        h('span', { class: 'brand-seal', 'aria-hidden': 'true' }),
        'Sealed',
      ),
      h('span', { class: 'brand-tag' }, 'Secret votes for groups'),
    ),
    page,
    h(
      'footer',
      { class: 'site-foot' },
      h('p', null, 'Polls are deleted 60 days after their last change. No accounts, no ads.'),
    ),
  );
  route();
}
