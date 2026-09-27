/**
 * The chapter navigator: a slim bar with chapter names and a reading-progress
 * line. On narrow screens it collapses to the current chapter plus a menu.
 */
import { h, qsa } from '../lib/dom';
import { themeToggle } from './themeToggle';

export function initNavigator(host: HTMLElement): void {
  const chapters = qsa<HTMLElement>('[data-chapter][data-nav-label]');
  const current = h('span', { class: 'nav-current' }, chapters[0]?.dataset.navLabel ?? '');
  const toggle = h(
    'button',
    { type: 'button', class: 'nav-toggle', 'aria-expanded': 'false', 'aria-controls': 'nav-menu' },
    h('span', { class: 'visually-hidden' }, 'Chapters: '),
    current,
    h('span', { class: 'nav-caret', 'aria-hidden': 'true' }, '▾'),
  );
  const links = chapters.map((ch) =>
    h(
      'a',
      { href: `#${ch.id}`, 'data-target': ch.id },
      h('span', { class: 'nav-num', 'aria-hidden': 'true' }, ch.dataset.navNum ?? ''),
      h('span', { class: 'nav-name' }, ch.dataset.navLabel ?? ''),
    ),
  );
  const menu = h('ol', { id: 'nav-menu', class: 'nav-menu' }, ...links.map((a) => h('li', {}, a)));
  const bar = h('span', { class: 'nav-progress-bar' });
  const nav = h(
    'nav',
    { class: 'nav', 'aria-label': 'Chapters' },
    h(
      'div',
      { class: 'nav-inner' },
      h('a', { href: '#top', class: 'nav-brand' }, 'The Confident Machine'),
      toggle,
      menu,
      h('div', { class: 'nav-tools' }, themeToggle()),
    ),
    h('div', { class: 'nav-progress', 'aria-hidden': 'true' }, bar),
  );
  host.replaceChildren(nav);

  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    if (open) links[0]?.focus();
  });
  links.forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && e.target instanceof Node && !nav.contains(e.target)) close();
  });

  // Which chapter is on screen.
  const setCurrent = (id: string) => {
    links.forEach((a) => {
      const on = a.dataset.target === id;
      if (on) {
        a.setAttribute('aria-current', 'location');
        current.textContent = a.querySelector('.nav-name')?.textContent ?? '';
      } else a.removeAttribute('aria-current');
    });
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent((entry.target as HTMLElement).id);
    },
    { rootMargin: '-35% 0px -60% 0px' },
  );
  chapters.forEach((ch) => io.observe(ch));

  // Reading progress.
  let frame = 0;
  const progress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  };
  window.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(progress);
    },
    { passive: true },
  );
  progress();
}
