import { gavel as knock } from './audio';
import { h, svg } from './dom';

export interface Gavel {
  el: HTMLElement;
  /** Swings the gavel and plays the knock, as if the player had struck it. */
  strike(): void;
  /** The words under the gavel telling the player what a strike will do. Empty hides them. */
  setHint(text: string): void;
  /** Makes the gavel glow when striking it is what the game is waiting for. */
  setEager(on: boolean): void;
}

/**
 * The judge's gavel and its sound block. It is a real button, so a tap, a
 * click, Enter or Space all strike it, and the G key does too from anywhere.
 */
export function createGavel(onStrike: () => void): Gavel {
  const art = svg(
    'svg',
    { viewBox: '0 0 200 120', class: 'gavel-art', 'aria-hidden': 'true' },
    // Sound block.
    svg('ellipse', { cx: 70, cy: 104, rx: 54, ry: 10, fill: '#2a170d' }),
    svg('rect', { x: 18, y: 86, width: 104, height: 18, rx: 6, fill: '#6b3d1f' }),
    svg('ellipse', { cx: 70, cy: 86, rx: 52, ry: 9, fill: '#8a5228' }),
    svg('ellipse', { cx: 70, cy: 86, rx: 38, ry: 5.5, fill: '#9c5f2f', opacity: 0.7 }),
    // The gavel, which pivots at the end of its handle.
    svg(
      'g',
      { class: 'gavel-swing' },
      svg('rect', { x: 66, y: 50, width: 120, height: 9, rx: 4.5, fill: '#7a4421' }),
      svg('rect', { x: 170, y: 49, width: 18, height: 11, rx: 5, fill: '#5a3018' }),
      svg('rect', { x: 40, y: 34, width: 56, height: 40, rx: 9, fill: '#8b4c22' }),
      svg('rect', { x: 34, y: 32, width: 10, height: 44, rx: 4, fill: '#c9a24a' }),
      svg('rect', { x: 92, y: 32, width: 10, height: 44, rx: 4, fill: '#c9a24a' }),
      svg('rect', { x: 50, y: 37, width: 34, height: 6, rx: 3, fill: '#a9652f', opacity: 0.8 }),
    ),
  );
  const burst = h('span', { class: 'gavel-burst', 'aria-hidden': 'true' });
  const hint = h('span', { class: 'gavel-hint' });
  const button = h('button', { type: 'button', class: 'gavel', 'aria-label': 'Strike the gavel' }, art, burst);
  const el = h('div', { class: 'gavel-wrap' }, button, hint);

  let swinging: number | undefined;
  const strike = () => {
    knock();
    button.classList.remove('struck');
    // Restart the animation even on rapid strikes.
    void button.offsetWidth;
    button.classList.add('struck');
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    window.clearTimeout(swinging);
    swinging = window.setTimeout(() => {
      button.classList.remove('struck');
      document.body.classList.remove('shake');
    }, 400);
    navigator.vibrate?.(18);
  };

  button.addEventListener('click', () => {
    strike();
    onStrike();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'g' || event.repeat || event.metaKey || event.ctrlKey) return;
    if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return;
    event.preventDefault();
    button.click();
  });

  return {
    el,
    strike,
    setHint(text) {
      hint.textContent = text;
      hint.hidden = !text;
    },
    setEager(on) {
      button.classList.toggle('eager', on);
    },
  };
}
