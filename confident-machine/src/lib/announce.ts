/** One polite live region, so screen-reader users hear the result of each interaction. */
let region: HTMLElement | null = null;

export function announce(message: string): void {
  region ??= document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  // A new frame makes assistive tech treat repeated messages as new.
  requestAnimationFrame(() => {
    if (region) region.textContent = message;
  });
}
