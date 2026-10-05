// Applies a saved light or dark choice before the page paints, the same way
// the portfolio does (same "ga-theme" key). The build writes it inline into
// index.html (see scripts/inline.ts); vercel.json allows it by its hash, so
// change the hash there when you change this file (npm test says how).
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var t = localStorage.getItem('ga-theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) {}
})();
