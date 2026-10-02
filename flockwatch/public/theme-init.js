// Applies a saved light/dark choice before the page paints. Kept external (not
// inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  document.documentElement.classList.add('js');
  try {
    var t = localStorage.getItem('fw-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
