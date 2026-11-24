/* A demo post's deep link (docs/decisions.md D21): reactiive.io/demos/<slug> is the /demos page, and its framed phone
   goes to that demo by itself: the launcher pages to the demo's page with the pager's own swipe, then the demo opens
   with its own flight. This script only says where to go; the framed app does it (tools/demos-web/bridge.js
   `{ demos: 'goto', slug, still }`, which finds the page from the launcher's layout and presses the icon), so nothing
   here reaches into the app. From 768 px only (a phone has no frame: its button opens the demo, D20, D21).
   - When: once the visible frame is live (the app has drawn and the frame has faded in over the still), 300 ms later;
     never before, so the deep link costs the frame's first paint nothing.
   - The URL stays /demos/<slug>: the open replaces the frame's entry (the bridge's press rule), so Back leaves the page
     to wherever the reader came from, as any link; no entry is added that the reader did not make.
   - Route changes keep it in step, with the kept frame alive (D17): to /demos/<slug>, go there (no reload); to /demos
     (a link or Back), close the demo the goto opened; elsewhere, stop a sequence under way and leave the demo open
     for a return.
   - Any pointer, wheel or key on the page during the sequence stops the rest (input inside the app stops it there).
   - The one-time touch demo and the arrow (web/sim-hint.js) are for a reader who has not found the phone: a deep link
     marks both as seen for the session.
   - Reduced motion: `still`, the pages jump and the demo opens without its flight. */
(function () {
  // The posts whose demo the app has under another slug (tools/demos-web/legacy-posts.ts ALIASES; compose checks).
  var ALIASES = { '3d-scroll-transition': 'scroll-transition-3d' };
  var wide = matchMedia('(min-width: 768px)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var slugOf = function (path) { var m = /^\/demos\/([a-z0-9-]+)\/?$/.exec(path); return m && m[1] !== 'app' ? ALIASES[m[1]] || m[1] : null; };
  var onDemos = function (path) { return /^\/demos\/?$/.test(path); };
  var want = null, sent = '', running = false, timer = 0, tries = 0, target = null;
  function frames() { return Array.prototype.filter.call(document.querySelectorAll('iframe[title="Demos"]'), function (f) { return /\/demos\/app\//.test(f.src); }); }
  function shown() {
    return frames().find(function (f) { var r = f.getBoundingClientRect(); return f.matches('[data-motion~=live]') && r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility(); }) || null;
  }
  function say(f, m) { try { f.contentWindow.postMessage(m, '*'); } catch (e) {} }
  function mark() { try { ['hint', 'arrow'].forEach(function (k) { sessionStorage.setItem('reactiive.demos.' + k, '1'); }); } catch (e) {} }
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
  function input(e) { if (running && e.isTrusted) stop(false); }
  addEventListener('pointerdown', input, true); addEventListener('wheel', input, { capture: true, passive: true }); addEventListener('keydown', input, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && want && !running && sent !== want) look(); });
  if (window.navigation) {
    navigation.addEventListener('navigate', function (e) { try { at(new URL(e.destination.url).pathname); } catch (x) {} });
    navigation.addEventListener('navigateerror', function () { at(location.pathname); });
  }
  addEventListener('popstate', function () { at(location.pathname); });
  at(location.pathname);
})();
