// Applies a saved light or dark choice before the page paints, the same way
// the portfolio does (same "ga-theme" key). Kept external, not inline, so the
// Content-Security-Policy can forbid inline scripts.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var t = localStorage.getItem('ga-theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) {}
})();
