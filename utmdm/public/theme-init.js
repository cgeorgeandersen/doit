// Applies a saved dark-mode choice before the page paints; light is the default. Kept external (not
// inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('utmdm-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  } catch (e) {}
})();
