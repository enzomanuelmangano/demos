/* What a page preloads of the content's code (docs/decisions.md D24). Written by tools/preloads.ts into every built
   page's head, before Exact's scripts, with the build's chunk names in place of the placeholder.
   Exact's entry prepares every chunk its page's head does not preload as it starts: a low-priority `modulepreload`
   each, appended to the head (host/web-js/build.mjs, `__EXACT_DEFERRED_CHUNKS__`), so a chunk a later render needs is
   already fetched, offline too. Here that is every article's and every doc's body and the article cards (one module
   per page, tools/gen-content.ts): /demos and the home fetched 26 scripts they never run (Safari warns of each),
   about 107 KB at 4G, competing with what the page does need.
   So a page keeps only its own: /articles/<slug> its article, /docs/<slug> its doc, /articles and /series/<s> the
   cards. The chunks of the pages it links to are fetched once it has loaded and the main thread is idle, at low
   priority (requestIdleCallback; a timeout where there is none, Safari), so a tap or a click with no hover before it
   finds them fetched as Exact's own preload had them, but after the page's load instead of in it; a link the reader is
   about to follow (the pointer over it, its focus, a touch or press on it) fetches its chunk at once if it is not.
   Exact's own pieces (its glue, the canvas, the motion) are left as Exact prepares them. Nothing else is touched:
   the hold applies to `document.head.append` of those modulepreload links only. */
(function () {
  var C = '__REACTIIVE_CHUNKS__';
  if (typeof C === 'string' || !document.head) return;
  var held = {};
  var file = function (href) { return href.slice(href.lastIndexOf('/') + 1).split('?')[0]; };
  // The content chunks a page at `path` runs.
  var need = function (path) {
    var p = path.replace(/\/+$/, '') || '/', m;
    if (p === '/articles' || /^\/series\/[^/]+$/.test(p)) return [C.cards];
    if ((m = /^\/(articles|docs)\/([^/]+)$/.exec(p))) return [C[m[1]][m[2]]].filter(Boolean);
    return [];
  };
  var content = {};
  content[C.cards] = 1;
  for (var k in C.articles) content[C.articles[k]] = 1;
  for (var d in C.docs) content[C.docs[d]] = 1;
  var own = need(location.pathname);
  var head = document.head, append = head.append;
  head.append = function () {
    var kept = [];
    for (var i = 0; i < arguments.length; i++) {
      var n = arguments[i];
      if (n && n.tagName === 'LINK' && n.rel === 'modulepreload' && content[file(n.href)] && own.indexOf(file(n.href)) < 0) held[file(n.href)] = n.href;
      else kept.push(n);
    }
    return append.apply(this, kept);
  };
  var warmed = {};
  // A path's held chunks as modulepreloads (once each): `low` for the idle warm, the browser's default for intent.
  var warmPath = function (path, low) {
    need(path).forEach(function (f) {
      if (!f || warmed[f] || own.indexOf(f) >= 0) return;
      warmed[f] = 1;
      var l = document.createElement('link');
      l.rel = 'modulepreload';
      if (low) l.fetchPriority = 'low';
      l.href = held[f] || new URL('/' + f, location.href).href;
      append.call(head, l);
    });
  };
  var linkOf = function (t) { var a = t && t.closest && t.closest('a[href]'); return a && a.origin === location.origin ? a : null; };
  var warm = function (e) { var a = linkOf(e.target); if (a) warmPath(a.pathname, false); };
  ['pointerover', 'focusin', 'touchstart', 'pointerdown'].forEach(function (t) { addEventListener(t, warm, { capture: true, passive: true }); });
  // Once the page has loaded and the main thread is idle: the chunks of the pages this page links to (the header's
  // Articles, the cards of a list, a footer's docs), at low priority, so a tap with no hover before it (a touch screen,
  // a click without a move) finds its chunk fetched, as Exact's own preload had it, but after the page's load, not in it.
  var idle = function () {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) if (links[i].origin === location.origin) warmPath(links[i].pathname, true);
  };
  var later = function () { if (window.requestIdleCallback) requestIdleCallback(idle, { timeout: 1500 }); else setTimeout(idle, 300); };
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
})();
