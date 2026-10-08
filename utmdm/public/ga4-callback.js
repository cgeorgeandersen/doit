// Google sends the pop-up here with the result in the URL fragment. Hand it to the
// TagFluent page that opened the pop-up (same site only, over a broadcast channel,
// since Google's pages can cut the pop-up's link to its opener), then close.
(function () {
  var params = {};
  new URLSearchParams(location.hash.slice(1) || location.search.slice(1)).forEach(function (value, key) {
    params[key] = value;
  });
  history.replaceState(null, '', location.pathname);
  var channel = new BroadcastChannel('utmdm-google');
  channel.postMessage({ params: params });
  channel.close();
  window.close();
})();
