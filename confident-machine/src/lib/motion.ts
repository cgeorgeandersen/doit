const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function reducedMotion(): boolean {
  return query?.matches ?? false;
}

export function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? 'auto' : 'smooth';
}

/** Milliseconds for a transition, or 0 when the reader prefers reduced motion. */
export function duration(ms: number): number {
  return reducedMotion() ? 0 : ms;
}
