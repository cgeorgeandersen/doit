/**
 * Social media monitoring: a keyword list over public posts, a score, and a
 * watchlist that turns handles into names and addresses.
 */
import { homeOn, fullName, type Person } from '../../core/people';
import { flagPosts, type Post, scorePost } from '../../core/social';
import { dayOf, fmtRelativeDay, fmtTime } from '../../core/time';
import type { Console, Tool } from '../console';
import { clear, h, plural, svgIcon } from '../dom';
import type { MapView } from '../map';

export function socialTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let showAll = false;
  let scanned = false;
  const identified = new Set<number>();
  let results: HTMLElement;
  let watch: HTMLElement;

  const overlay = {
    draw(_ctx: CanvasRenderingContext2D, map: MapView) {
      for (const id of app.watchlist) {
        const p = w.people[id] as Person;
        const home = w.city.places[homeOn(p, dayOf(app.now))];
        if (home && home.kind !== 'outside') map.pin(home.x, home.y, '#ff5fd2', p.handle ?? fullName(p), 5);
      }
    },
  };

  function render(): void {
    clear(root);
    const chips = h('div', { class: 'chips keywords' });
    const drawChips = () => {
      clear(chips);
      for (const [term, weight] of Object.entries(app.keywords)) {
        chips.append(
          h(
            'span',
            { class: 'chip chip-term' },
            term,
            h('span', { class: 'chip-weight' }, `+${weight}`),
            h('button', { type: 'button', 'aria-label': `Remove ${term}`, onclick: () => { delete app.keywords[term]; drawChips(); if (scanned) drawResults(); } }, '×'),
          ),
        );
      }
    };
    drawChips();
    const add = h('input', { class: 'input', type: 'text', placeholder: 'Add a word or phrase', 'aria-label': 'Add a watch term' });
    const reason = c.reasonField();
    results = h('div', { class: 'results' });
    watch = h('div', { class: 'watchlist' });
    root.append(
      h('div', { class: 'tool-head' }, h('h2', null, 'Social media monitoring'), h('p', { class: 'tool-sub' }, `${plural(app.posts.length, 'public post')} from Port Avery accounts this week · keyword watch`)),
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); if (!reason.check()) return; scan(reason.value()); } },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Watch terms'), chips),
        h(
          'div',
          { class: 'field add-term' },
          add,
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => { const t = add.value.trim().toLowerCase(); if (t) { app.keywords[t] = 2; add.value = ''; drawChips(); if (scanned) drawResults(); } } }, 'Add'),
        ),
        h('p', { class: 'hint' }, 'A post is flagged when its terms add up to 2 points or more.'),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Scan posts'),
      ),
      results,
      watch,
    );
    if (scanned) drawResults();
    drawWatch();
  }

  function highlight(text: string): (Node | string)[] {
    const terms = Object.keys(app.keywords).sort((a, b) => b.length - a.length);
    if (terms.length === 0) return [text];
    const re = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const out: (Node | string)[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      out.push(text.slice(last, m.index));
      out.push(h('mark', null, m[0]));
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }

  function scan(reason: string): void {
    scanned = true;
    const flags = flagPosts(app.posts, app.keywords);
    app.log('social', `keyword scan (${Object.keys(app.keywords).length} terms)`, reason, flags.map((f) => f.post.author));
    app.emit('social-scan', { flagged: flags.length });
    drawResults();
  }

  function drawResults(): void {
    clear(results);
    const flags = flagPosts(app.posts, app.keywords);
    const posts: { post: Post; score: number }[] = showAll ? app.posts.map((p) => ({ post: p, score: scorePost(p.text, app.keywords).score })) : flags;
    results.append(
      h(
        'div',
        { class: 'result-bar' },
        h('p', { class: 'result-sum' }, `${plural(flags.length, 'post')} flagged of ${app.posts.length}.`),
        h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: showAll, onchange: (e: Event) => { showAll = (e.target as HTMLInputElement).checked; drawResults(); } }), ' Show unflagged posts'),
      ),
      h('ul', { class: 'posts' }, ...posts.slice(0, 120).map(({ post, score }) => postCard(post, score))),
    );
  }

  function postCard(post: Post, score: number): HTMLElement {
    const p = w.people[post.author] as Person;
    const who = identified.has(p.id) ? h('span', { class: 'post-name' }, `${fullName(p)} · ${w.city.places[homeOn(p, dayOf(app.now))]?.address}`) : null;
    const tone = score >= 4 ? 'high' : score >= 2 ? 'mid' : 'low';
    return h(
      'li',
      { class: 'post' },
      h('div', { class: 'post-head' }, h('span', { class: 'post-handle' }, p.handle ?? '@unknown'), h('span', { class: 'muted small' }, `${fmtRelativeDay(dayOf(post.t), app.now)} ${fmtTime(post.t)}`), score > 0 ? h('span', { class: `score-pill score-${tone}` }, `risk ${score}`) : null),
      who,
      h('p', { class: 'post-text' }, ...highlight(post.text)),
      h(
        'div',
        { class: 'actions' },
        identified.has(p.id)
          ? null
          : h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { identify(p); drawResults(); } }, 'Identify account'),
        app.watchlist.has(p.id)
          ? h('span', { class: 'badge badge-sens' }, 'on watchlist')
          : h('button', { class: 'btn btn-small', type: 'button', onclick: () => { addToWatch(p); drawResults(); } }, '+ Watchlist'),
      ),
    );
  }

  function identify(p: Person): void {
    identified.add(p.id);
    app.log('social', `identify ${p.handle}`, app.lastReason || 'identify', [p.id]);
    app.emit('account-resolved', { person: p.id });
  }

  function addToWatch(p: Person): void {
    if (!identified.has(p.id)) identify(p);
    app.watchlist.add(p.id);
    app.emit('watchlist', { people: [...app.watchlist] });
    drawWatch();
  }

  function drawWatch(): void {
    clear(watch);
    if (app.watchlist.size === 0) return;
    watch.append(
      h('h3', { class: 'section' }, 'Watchlist'),
      h(
        'ul',
        { class: 'rows' },
        ...[...app.watchlist].map((id) => {
          const p = w.people[id] as Person;
          return h(
            'li',
            { class: 'row static' },
            h('span', { class: 'row-main' }, fullName(p)),
            h('span', { class: 'row-sub' }, `${p.handle ?? ''} · ${w.city.places[homeOn(p, dayOf(app.now))]?.address ?? ''}`),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${fullName(p)}`, onclick: () => { app.watchlist.delete(id); app.emit('watchlist', { people: [...app.watchlist] }); drawWatch(); } }, svgIcon('close', 14)),
          );
        }),
      ),
      h('p', { class: 'hint' }, 'Their home addresses are pinned on the map.'),
    );
  }

  return {
    id: 'social',
    name: 'Social media monitoring',
    short: 'Social',
    icon: 'social',
    layers: { cameras: false },
    mount(el: HTMLElement) {
      root = el;
      c.map.overlays.set('watchlist', overlay);
      render();
    },
  };
}
