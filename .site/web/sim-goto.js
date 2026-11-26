/* A demo post and the phone (docs/decisions.md D21, D25). Two jobs, both by message with the framed app
   (tools/demos-web/bridge.js), so nothing here reaches into the app.
   1. reactiive.io/demos/<slug> from 1024 px is the article with the phone beside it, and the phone goes to that demo by
      itself: the launcher pages to the demo's page with the pager's own swipe, then the demo opens with its own flight
      (`{ demos: 'goto', slug, still }`; the app finds the page from the launcher's layout and presses the icon). Under
      1024 px a post has no phone: its button opens the demo full screen.
      - When: once the visible frame is live (the app has drawn and the frame has faded in over the still), 300 ms later;
        never before, so it costs the frame's first paint nothing.
      - The URL stays /demos/<slug>: the open replaces the frame's entry (the bridge's press rule), so Back leaves the
        page to wherever the reader came from, as any link; no entry is added that the reader did not make.
      - Route changes keep it in step, with the kept frame alive (D17): to /demos/<slug>, go there (no reload); to
        /demos (a link or Back), close the demo the goto opened; elsewhere (a post without a phone too), stop a sequence
        under way and leave the demo open for a return.
      - Any pointer, wheel or key on the page during the sequence stops the rest (input inside the app stops it there):
        reading wheels the page, so a reader who scrolls at once keeps the launcher where it got to.
      - The one-time touch demo (web/sim-hint.js) is for a reader who has not found the phone: a post marks it seen for
        the session. The arrow plays on /demos only (D22).
      - Reduced motion: `still`, the pages jump and the demo opens without its flight.
   2. "Read article" (D25): the framed app's menus ask (`{ demos: 'read', slug }`, the app's slug), and the page goes to
      that post as a link would (the same tab, one history entry, Back returns), starting at the article's top; on that
      post already, it scrolls to the top. Only a visible Demos frame of this page is heard, from its opaque (sandboxed)
      origin or this one. */
(function () {
  // The posts whose demo the app has under another slug (tools/demos-web/legacy-posts.ts ALIASES; compose checks).
  var ALIASES = { '3d-scroll-transition': 'scroll-transition-3d' };
  // The posts whose demo the app has not (tools/head.ts writes the list): no phone on their page.
  var NO_APP = ('__NO_APP__').split(' ');
  var wide = matchMedia('(min-width: 1024px)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var postOf = function (path) { var m = /^\/demos\/([a-z0-9-]+)\/?$/.exec(path); return m && m[1] !== 'app' ? m[1] : null; };
  var slugOf = function (path) { var p = postOf(path); return p && NO_APP.indexOf(p) < 0 ? ALIASES[p] || p : null; };
  var onDemos = function (path) { return /^\/demos\/?$/.test(path); };
  var want = null, sent = '', running = false, timer = 0, tries = 0, target = null;
  function frames() { return Array.prototype.filter.call(document.querySelectorAll('iframe[title="Demos"]'), function (f) { return /\/demos\/app\//.test(f.src); }); }
  function shown() {
    return frames().find(function (f) { var r = f.getBoundingClientRect(); return f.matches('[data-motion~=live]') && r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility(); }) || null;
  }
  function say(f, m) { try { f.contentWindow.postMessage(m, '*'); } catch (e) {} }
  function mark() { try { sessionStorage.setItem('reactiive.demos.hint', '1'); } catch (e) {} }
  function stop(close) {
    clearTimeout(timer);
    if (!running && !close) return;
    running = false;
    var fs = frames();
    for (var i = 0; i < fs.length; i++) say(fs[i], { demos: 'goto', slug: '', close: close });
    if (close) sent = '';
  }
  function look() {
    clearTimeout(timer);
    if (!want || !wide.matches || document.hidden) return;
    if (++tries > 300) return; // 30 s on this visit
    var f = shown();
    if (!f) { timer = setTimeout(look, 100); return; }
    timer = setTimeout(function () {
      if (!want || shown() !== f) return look();
      target = f; running = true; sent = want;
      say(f, { demos: 'goto', slug: want, still: reduce.matches });
    }, 300);
  }
  function at(path) {
    var s = slugOf(path);
    if (s) { mark(); if (s === want && (running || sent === s)) return; want = s; tries = 0; running = false; look(); return; }
    want = null;
    if (onDemos(path)) { if (sent) stop(true); else stop(false); }
    else stop(false);
  }
  addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.demos !== 'goto' || !target || e.source !== target.contentWindow) return;
    if (m.state === 'opened' || m.state === 'missing' || m.state === 'stopped') running = false;
  });
  // "Read article": the app's slug back to its post's.
  function read(app) {
    var post = app;
    for (var k in ALIASES) if (ALIASES[k] === app) post = k;
    if (postOf(location.pathname) === post) return void scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    // A link click, which the page's runtime routes in place (the kept frame stays); without it, the browser's own.
    var link = document.createElement('a');
    link.href = '/demos/' + post;
    link.hidden = true;
    (document.getElementById('exact-root') || document.body).appendChild(link);
    link.click();
    link.remove();
  }
  addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.demos !== 'read' || typeof m.slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(m.slug)) return;
    if (e.origin !== 'null' && e.origin !== location.origin) return;
    if (frames().some(function (f) { return f.contentWindow === e.source && f.checkVisibility(); })) read(m.slug);
  });
  function input(e) { if (running && e.isTrusted) stop(false); }
  addEventListener('pointerdown', input, true); addEventListener('wheel', input, { capture: true, passive: true }); addEventListener('keydown', input, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && want && !running && sent !== want) look(); });
  if (window.navigation) {
    navigation.addEventListener('navigate', function (e) { try { at(new URL(e.destination.url).pathname); } catch (x) {} });
    navigation.addEventListener('navigateerror', function () { at(location.pathname); });
  }
  addEventListener('popstate', function () { at(location.pathname); });
  // Without the Navigation API (Safari before 26.2, older Firefox) an in-app link (the runtime's pushState) fires no
  // popstate, and /demos/<slug> to /demos changes no DOM (one page): the history writes themselves are watched (this
  // script runs in the head, before the runtime). at() ignores a path it already acted on.
  if (!window.navigation) {
    ['pushState', 'replaceState'].forEach(function (k) {
      var write = history[k];
      history[k] = function () { var from = location.pathname, r = write.apply(this, arguments); if (location.pathname !== from) at(location.pathname); return r; };
    });
  }
  at(location.pathname);
})();
