/**
 * Sticky scrollytelling on wide screens, a stepper on phones.
 *
 * Wide: the graphic stays pinned while the steps scroll past; the step crossing
 * the reading line becomes active.
 * Narrow: the graphic sits in the flow with the current step's text right below
 * it (graphic above text), and Previous/Next move between steps.
 *
 * On every layout, each step is reachable with the buttons, and with the left
 * and right arrow keys while the graphic has focus.
 *
 * Expected markup:
 *   <div class="scrolly">
 *     <div class="scrolly-graphic" tabindex="0">
 *       <div class="scrolly-stage">…</div>
 *       <div class="scrolly-controls"></div>
 *     </div>
 *     <div class="scrolly-steps"><section class="step"><div class="step-inner">…</div></section>…</div>
 *   </div>
 */
import { h, qs, qsa } from './dom';
import { scrollBehavior } from './motion';
import { announce } from './announce';

export interface Scrolly {
  goTo(index: number, scroll?: boolean): void;
  current(): number;
  count: number;
}

const NARROW = '(max-width: 959px)';

export function createScrolly(root: HTMLElement, onStep: (index: number) => void): Scrolly {
  const steps = qsa<HTMLElement>('.step', root);
  const graphic = qs<HTMLElement>('.scrolly-graphic', root);
  const controls = qs<HTMLElement>('.scrolly-controls', root);
  const mirror = h('div', { class: 'scrolly-mirror', 'aria-live': 'polite' });
  controls.before(mirror);
  let active = -1;
  let programmaticUntil = 0;
  const isNarrow = () => window.matchMedia(NARROW).matches;

  const prev = h('button', { type: 'button', class: 'btn btn--quiet scrolly-prev', 'aria-label': 'Previous step' }, '← Prev');
  const next = h('button', { type: 'button', class: 'btn btn--quiet scrolly-next', 'aria-label': 'Next step' }, 'Next →');
  const counter = h('span', { class: 'scrolly-count mono' });
  const dots = h(
    'span',
    { class: 'scrolly-dots', 'aria-hidden': 'true' },
    ...steps.map(() => h('span', { class: 'scrolly-dot' })),
  );
  controls.replaceChildren(prev, h('span', { class: 'scrolly-where' }, dots, counter), next);

  steps.forEach((step, i) => {
    step.dataset.step = String(i);
    if (!step.id) step.id = `${root.id || 'scrolly'}-step-${i + 1}`;
  });

  function setActive(index: number, fromUser: boolean): void {
    const i = Math.max(0, Math.min(steps.length - 1, index));
    if (i === active) return;
    active = i;
    steps.forEach((step, j) => {
      step.classList.toggle('is-active', j === i);
      if (j === i) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    [...dots.children].forEach((d, j) => d.classList.toggle('is-on', j <= i));
    counter.textContent = `Step ${i + 1} of ${steps.length}`;
    prev.disabled = i === 0;
    next.disabled = i === steps.length - 1;
    const inner = steps[i]!.querySelector('.step-inner');
    mirror.replaceChildren(...(inner ? [...inner.childNodes].map((n) => n.cloneNode(true)) : []));
    root.dataset.activeStep = String(i);
    onStep(i);
    if (fromUser && !isNarrow()) {
      const heading = steps[i]!.querySelector('h4');
      announce(`Step ${i + 1} of ${steps.length}. ${heading?.textContent?.trim() ?? ''}`);
    }
  }

  function goTo(index: number, scroll = true): void {
    const i = Math.max(0, Math.min(steps.length - 1, index));
    setActive(i, true);
    if (!scroll) return;
    if (isNarrow()) {
      // Keep the stepper in view without jumping past it.
      const top = graphic.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) graphic.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    } else {
      programmaticUntil = performance.now() + 900;
      steps[i]!.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }
  }

  prev.addEventListener('click', () => goTo(active - 1));
  next.addEventListener('click', () => goTo(active + 1));
  graphic.addEventListener('keydown', (event) => {
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(active - 1);
    }
  });

  let io: IntersectionObserver | null = null;
  const observe = () => {
    io?.disconnect();
    io = null;
    if (isNarrow()) return; // the stepper is driven by its buttons
    io = new IntersectionObserver(
      (entries) => {
        if (performance.now() < programmaticUntil) return;
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step), false);
        }
      },
      { rootMargin: '-48% 0px -50% 0px' },
    );
    steps.forEach((s) => io!.observe(s));
  };
  observe();
  window.matchMedia(NARROW).addEventListener('change', observe);

  setActive(0, false);
  return { goTo, current: () => active, count: steps.length };
}
