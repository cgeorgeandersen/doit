/**
 * Machine text: monospace, one span per token, each carrying the probability
 * the model gave it (--p). CSS turns low probability into a stronger dotted
 * underline and a deeper, slower flicker. Human text stays steady serif.
 */
import { h } from '../lib/dom';
import { needsSpaceBefore } from '../engine/tokenizer';

export interface MachineToken {
  /** what to display */
  text: string;
  /** the model token, used for spacing rules; defaults to text */
  token?: string;
  /** probability when chosen; omit when unknown */
  p?: number;
}

export interface MachineTextOptions {
  shimmer?: boolean;
  className?: string;
  /** add a hover title with each word's probability */
  showProbabilities?: boolean;
}

function rhythm(i: number): string {
  // Deterministic, varied timing so words don't pulse in lockstep.
  const dur = 2.4 + ((i * 37) % 17) / 10;
  const delay = -(((i * 53) % 29) / 10);
  return `--dur:${dur.toFixed(1)}s;--delay:${delay.toFixed(1)}s`;
}

export function machineText(tokens: MachineToken[], options: MachineTextOptions = {}): HTMLElement {
  const { shimmer = true, className = '', showProbabilities = false } = options;
  const root = h('span', { class: `machine-text ${shimmer ? 'shimmer' : ''} ${className}`.trim() });
  tokens.forEach((t, i) => {
    if (needsSpaceBefore(t.token ?? t.text, i === 0)) root.append(' ');
    const p = t.p === undefined ? 0.55 : Math.max(0, Math.min(1, t.p));
    const span = h('span', { class: 'mt', style: `--p:${p.toFixed(3)};${rhythm(i)}` }, t.text);
    if (showProbabilities && t.p !== undefined) span.title = `${(t.p * 100).toFixed(1)}% likely when chosen`;
    root.append(span);
  });
  return root;
}

/** Machine text from a plain string when the true probabilities are unknown. */
export function machineTextFromString(text: string, options: MachineTextOptions = {}): HTMLElement {
  const words = text.split(/\s+/).filter(Boolean);
  const root = h('span', {
    class: `machine-text ${options.shimmer === false ? '' : 'shimmer'} ${options.className ?? ''}`.trim(),
  });
  words.forEach((word, i) => {
    if (i > 0) root.append(' ');
    root.append(h('span', { class: 'mt', style: `--p:0.55;${rhythm(i)}` }, word));
  });
  return root;
}
