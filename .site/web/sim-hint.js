/* /demos's frame host (D19, docs/isolation.md §6): tells every framed Demos app where the page is, so the app's
   history (joint with the page's) moves in place only while the page is really elsewhere. `{ demos: 'page', current,
   visible }`: current = the page is on /demos, visible = the frame is on screen; sent when a frame loads, at every
   route change (the Navigation API's navigate, at once, before the route's own work; popstate) and every change of
   the frame's visibility (IntersectionObserver) or the tab's. */
(function () {
  // A demo post (/demos/<slug>, D21) is the /demos page too.
  var onDemos = function (path) { return /^\/demos(\/(?!app(\/|$))[a-z0-9-]+)?\/?$/.test(path); };
  var current = onDemos(location.pathname), seen = new WeakSet(), shown = new WeakMap();
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) { shown.set(es[i].target, es[i].isIntersecting); tell(es[i].target); }
  }) : null;
  function tell(f) {
    if (!f.contentWindow || !/\/demos\/app\//.test(f.src)) return;
    f.contentWindow.postMessage({ demos: 'page', current: current, visible: !document.hidden && shown.get(f) !== false && f.checkVisibility() }, '*');
  }
  function frames() { return document.querySelectorAll('iframe[title="Demos"]'); }
  function all() { var fs = frames(); for (var i = 0; i < fs.length; i++) adopt(fs[i]); }
  function adopt(f) {
    if (!seen.has(f)) { seen.add(f); f.addEventListener('load', function () { tell(f); }); if (io) io.observe(f); }
    tell(f);
  }
  var shownPath = location.pathname;
  function at(path) { shownPath = path; current = onDemos(path); all(); }
  if (window.navigation) {
    navigation.addEventListener('navigate', function (e) { try { at(new URL(e.destination.url).pathname); } catch (x) {} });
    // A navigate that is cancelled or fails leaves the page where it was: derive again from the address.
    navigation.addEventListener('navigateerror', function () { at(location.pathname); });
    navigation.addEventListener('navigatesuccess', function () { if (location.pathname !== shownPath) at(location.pathname); });
  }
  addEventListener('popstate', function () { at(location.pathname); });
  addEventListener('pageshow', function () { at(location.pathname); });
  document.addEventListener('visibilitychange', all);
  // A route drawn or a frame added: derive `current` from the address again. Without the Navigation API (Safari before
  // 26, older Firefox) an in-app link away from /demos fires no popstate; the route's own DOM change catches it.
  // (With the API the navigate events keep it; the address may lag a navigate under way, so it is not read here.)
  // The frames are a live list: each batch looks at those few, never at every node added.
  var live = document.getElementsByTagName('iframe');
  new MutationObserver(function () {
    if (!window.navigation && location.pathname !== shownPath) return at(location.pathname);
    for (var i = 0; i < live.length; i++) if (!seen.has(live[i]) && live[i].title === 'Demos') return at(location.pathname);
  }).observe(document.documentElement, { childList: true, subtree: true });
  all();
})();
/* /demos's arrow (D22: on every arrival at /demos). The one-time touch demo that followed it (D19) is gone (owner,
   2026-11-26: "the sim must be interactive and usable from the start; the arrow says it is interactive"): nothing here
   ever presses anything in the app. The arrow takes no pointer and fades at the first input, hover of the phone, or
   leaving /demos. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The measuring tools turn the arrow off for their session (`reactiive.demos.arrow` = 'off'); a reader never does.
  var noArrow = function () { try { return sessionStorage.getItem('reactiive.demos.arrow') === 'off'; } catch (e) { return false; } };
  var wide = matchMedia('(min-width: 768px)');
  var onDemos = function () { return /^\/demos\/?$/.test(location.pathname); };
  // idle: waiting for /demos; armed: the arrow; rest: done for this visit (a new arrival makes it idle again). `visit` tags each arrival, so a late callback of an earlier one
  // (a quick back-and-forth) does nothing.
  var state = 'idle', frame = null, timer = 0, tries = 0, visit = 0, lastInput = -1e9;
  var visible = function () { return !!frame && frame.isConnected && frame.checkVisibility() && onDemos(); };
  function stop() {
    if (state !== 'armed') return;
    state = 'rest';
    clearTimeout(timer);
    off();
    unarrow(200);
  }
  function onInput() { stop(); }
  function onHide() { if (document.hidden) stop(); }
  // Leaving: the page is hidden, or a navigation's destination (or, after a popstate, the address) is not /demos. A
  // traversal back to /demos fires navigate and popstate too; it must not stop the visit it has just begun.
  var isDemos = function (path) { return /^\/demos\/?$/.test(path); };
  function onLeave(e) {
    if (e && e.type === 'navigate') { try { if (isDemos(new URL(e.destination.url).pathname)) return; } catch (x) {} }
    else if (e && e.type === 'popstate' && isDemos(location.pathname)) return;
    stop();
  }
  function on() {
    addEventListener('pointerdown', onInput, true); addEventListener('wheel', onInput, { capture: true, passive: true }); addEventListener('keydown', onInput, true);
    document.addEventListener('visibilitychange', onHide); addEventListener('popstate', onLeave); addEventListener('pagehide', onLeave);
    if (window.navigation) navigation.addEventListener('navigate', onLeave);
  }
  function off() {
    removeEventListener('pointerdown', onInput, true); removeEventListener('wheel', onInput, true); removeEventListener('keydown', onInput, true);
    document.removeEventListener('visibilitychange', onHide); removeEventListener('popstate', onLeave); removeEventListener('pagehide', onLeave);
    if (window.navigation) navigation.removeEventListener('navigate', onLeave);
  }
  addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m.demos !== 'string') return;
    // The reader's own input in the app, wherever it is framed: an arrival right after it skips the arrow.
    if (m.demos === 'input') lastInput = performance.now();
    if (!frame || e.source !== frame.contentWindow) return;
    if (m.demos === 'input') stop();
  });
  // Wait, on /demos only and from 768 px only, for the visible framed app to go live (the page marks it once the app
  // has drawn), then 1.2 s more. A route change restarts the wait with its own budget; elsewhere nothing polls.
  function wait() {
    clearTimeout(timer);
    if (state !== 'idle') return;
    if (!onDemos() || !wide.matches) return;
    if (++tries > 120) return; // 30 s on this visit of /demos
    var f = Array.prototype.find.call(document.querySelectorAll('iframe[data-motion~=live]'), function (f) {
      var r = f.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility();
    });
    if (!f) { timer = setTimeout(wait, 250); return; }
    frame = f;
    state = 'armed';
    var v = ++visit;
    on();
    // The arrow on every arrival (owner: "in every session"); then the visit is done.
    var next = function (ms) { if (state === 'armed' && v === visit) timer = setTimeout(stop, ms); };
    settle(function () {
      if (state !== 'armed' || v !== visit) return;
      // Already at the phone (the app's input in the last 3 s, or the pointer resting on it): no arrow.
      if (performance.now() - lastInput < 3000 || near(lastPointer) || noArrow()) return next(1200);
      if (!visible() || !arrow(function () { next(350); })) next(1200);
    });
  }
  // The hero's entrance (live's motion: the title, the subtitle and the pill blur in, the device rises) runs on every
  // arrival at /demos; the arrow waits for its finite animations to end (at most 3 s), so the entrance stays live's.
  function settle(then) {
    var n = 0;
    (function look() {
      var page = document.querySelector('[data-motion~=d-page]');
      if (!page) { if (++n < 60) return requestAnimationFrame(look); return then(); }
      var a = page.getAnimations({ subtree: true }).filter(function (x) { var t = x.effect && x.effect.getComputedTiming(); return t && isFinite(t.endTime) && x.playState !== 'finished'; });
      var done = false, go = function () { if (!done) { done = true; setTimeout(then, 150); } };
      Promise.all(a.map(function (x) { return x.finished.catch(function () {}); })).then(go);
      setTimeout(go, 3000);
    })();
  }
  // The arrow (owner, 2026-11-24: "a pretty animated arrow toward the sim, as if to invite interacting with it"; no
  // words): one hand-drawn swoop from the pill's end (its last segment, Sponsor) toward the phone (from 1024 px, beside the copy) or down to it (768-1023
  // px, below the copy). Its line draws on (stroke-dashoffset, 950 ms, an ease-in-out that lands slowly at the phone),
  // the head's two strokes follow, it nudges toward the phone twice (transform only), then eases into it and fades;
  // ~4 s. Hovering the phone, any input, leaving /demos or a resize fades it at once (the reader has found the
  // phone). Reduced motion: the same arrow, still, faded in and out. Never blocks.
  var arr = null, arrAnims = [];
  function unarrow(ms) {
    if (!arr) return;
    var a = arr; arr = null;
    removeEventListener('pointermove', onNear, true); removeEventListener('pointerover', onNear, true); removeEventListener('resize', onResize);
    var anims = arrAnims; arrAnims = [];
    if (!ms) return a.remove();
    // Held where it is (a half-drawn line stays half-drawn) and faded from its current opacity.
    var o = getComputedStyle(a).opacity;
    anims.forEach(function (x) { x.pause(); });
    a.animate([{ opacity: o }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }).onfinish = function () { a.remove(); };
  }
  var phone = null, lastPointer = null;
  // The last place the pointer was seen on the page (the frame is another process: over the screen it reports nothing).
  addEventListener('pointermove', function (e) { lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  function phoneOf(f) {
    var fr = f.getBoundingClientRect(), sw = Math.min(420, (fr.height - 48) * 0.448718), sh = Math.min(912, (fr.height - 48) * 0.974359), bez = sw * 0.04;
    var sl = fr.left + (fr.width - sw) / 2, st = fr.top + (fr.height - sh) / 2;
    return { l: sl - bez, r: sl + sw + bez, t: st - bez, b: st + sh + bez, sl: sl, st: st, sw: sw, sh: sh };
  }
  function near(pt) {
    if (!pt || !frame) return false;
    var r = phoneOf(frame);
    return pt.x > r.l - 40 && pt.x < r.r + 40 && pt.y > r.t - 40 && pt.y < r.b + 40;
  }
  function onNear(e) {
    // The frame is another process: the page sees no move once the pointer is on the screen, so the phone counts
    // from 40 px around it (a moving pointer always reports there first).
    if (e.target === frame || (phone && e.clientX > phone.l - 40 && e.clientX < phone.r + 40 && e.clientY > phone.t - 40 && e.clientY < phone.b + 40)) stop();
  }
  function onResize() { unarrow(0); }
  function arrow(done) {
    var NS = 'http://www.w3.org/2000/svg', links = document.querySelectorAll('[data-motion~=d-pill] a'), pill = links[links.length - 1], sub = document.querySelector('[data-motion~=d-sub]');
    if (!pill || !frame) return false;
    var fr = frame.getBoundingClientRect(), pr = pill.getBoundingClientRect();
    if (!pr.width || !fr.width) return false;
    // The app's display inside its frame (web/head.css sim-frame's clip) and the phone around it.
    phone = phoneOf(frame);
    var sw = phone.sw, sh = phone.sh, sl = phone.sl, st = phone.st;
    var side = phone.l > pr.right + 60, S, E;
    if (side) {
      S = { x: pr.right + 26, y: pr.top + pr.height / 2 + 4 };
      E = { x: phone.l - 20, y: st + sh * 0.44 };
      // A short gap (1024-1100 px): the swoop starts under the pill's end, so it has room, and rises gently to the
      // phone at about the pill's height rather than hooking steeply up past the subtitle.
      if (E.x - S.x < 160) S = { x: pr.right - 18, y: pr.bottom + 12 };
      if (E.x - S.x < 200) E.y = Math.max(E.y, S.y - (E.x - S.x) * 0.3);
      // The swoop passes under the subtitle's end, never across it.
      if (sub) {
        var rg = document.createRange(); rg.selectNodeContents(sub);
        var lines = Array.prototype.slice.call(rg.getClientRects()), sr = Math.max.apply(null, lines.map(function (r) { return r.right; })), sb = Math.max.apply(null, lines.map(function (r) { return r.bottom; }));
        var x = sr + 16;
        if (x > S.x && x < E.x) E.y = Math.max(E.y, S.y - (S.y - sb - 24) * (E.x - S.x) / (x - S.x));
      }
    } else {
      S = { x: pr.right + 18, y: pr.top + pr.height / 2 + 10 };
      E = { x: Math.min(sl + sw * 0.86, S.x + 40), y: phone.t - 18 };
    }
    if (E.y - S.y < 30 && !side) return false;
    var dx = E.x - S.x, dy = E.y - S.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, sg = side ? 1 : -1, nx = -uy * sg, ny = ux * sg;
    if (L < 60) return false;
    var k = Math.min(1, L / 300);
    var P = function (u, v) { return (S.x + u * L * ux + v * nx).toFixed(1) + ' ' + (S.y + u * L * uy + v * ny).toFixed(1); };
    var minX = Math.min(S.x, E.x) - 70, minY = Math.min(S.y, E.y) - 70, W = Math.abs(dx) + 140, H = Math.abs(dy) + 140;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', minX + ' ' + minY + ' ' + W + ' ' + H);
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:40;overflow:visible;will-change:transform,opacity;translate:'
      + (minX + scrollX) + 'px ' + (minY + scrollY) + 'px';
    var id = 'demos-arrow-' + Date.now().toString(36);
    svg.innerHTML = '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + S.x + '" y1="' + S.y + '" x2="' + E.x + '" y2="' + E.y + '">'
      + '<stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".85"/></linearGradient></defs>'
      + '<g fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path stroke="url(#' + id + ')" d="M' + P(0, 0) + ' C' + P(0.3, 58 * k) + ' ' + P(0.68, 44 * k) + ' ' + P(1, -2 * k) + '"/></g>';
    document.body.appendChild(svg);
    var g = svg.lastChild, path = g.firstChild, len = path.getTotalLength(), end = path.getPointAtLength(len), back = path.getPointAtLength(len - 8);
    var tx = end.x - back.x, ty = end.y - back.y, tl = Math.hypot(tx, ty) || 1, hl = 11;
    tx /= tl; ty /= tl;
    var heads = [0.5, -0.5].map(function (a) {
      var h = document.createElementNS(NS, 'path'), c = Math.cos(a), s = Math.sin(a);
      h.setAttribute('d', 'M' + end.x.toFixed(1) + ' ' + end.y.toFixed(1) + ' l' + (-(tx * c - ty * s) * hl).toFixed(1) + ' ' + (-(tx * s + ty * c) * hl).toFixed(1));
      h.setAttribute('stroke', 'rgb(255 255 255 / .85)');
      g.appendChild(h);
      return h;
    });
    arr = svg;
    addEventListener('pointermove', onNear, { capture: true, passive: true }); addEventListener('pointerover', onNear, true); addEventListener('resize', onResize);
    var DRAW = 950, HOLD = 2400, t0 = DRAW + 250, last;
    var by = function (d) { return 'translate(' + (ux * d).toFixed(2) + 'px,' + (uy * d).toFixed(2) + 'px)'; };
    if (reduce) {
      arrAnims.push(svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out', fill: 'backwards' }));
      arrAnims.push(last = svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 3200, easing: 'ease-out', fill: 'forwards' }));
    } else {
      // The gap is longer than the stroke and the hidden offset 2 px past it, so no round cap shows before its stroke
      // draws (a `len len` dash leaves dots at the tip's ends from the first frame). Opacity 0 until then as well, for
      // engines that paint a cap outside the path.
      var hide = function (el, n) {
        el.style.strokeDasharray = n + ' ' + (n + 4);
        return [{ strokeDashoffset: n + 2, opacity: 0 }, { opacity: 1, offset: 0.02 }, { strokeDashoffset: 0, opacity: 1 }];
      };
      arrAnims.push(path.animate(hide(path, len), { duration: DRAW, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' }));
      heads.forEach(function (h, i) {
        arrAnims.push(h.animate(hide(h, hl), { duration: 200, delay: DRAW - 30 + i * 50, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' }));
      });
      arrAnims.push(svg.animate([{ transform: 'none' }, { transform: by(5) }, { transform: 'none' }], { duration: HOLD / 2, delay: t0, iterations: 2, easing: 'cubic-bezier(.45,0,.55,1)' }));
      arrAnims.push(last = svg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: by(8) }], { duration: 450, delay: t0 + HOLD, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' }));
    }
    last.onfinish = function () { if (arr === svg) { unarrow(0); done(); } };
    return true;
  }
  // A route change: leaving /demos stops what plays; arriving at it (from another page) starts a new visit. A change
  // that keeps the page on /demos (a replace, a second event for the same navigation) is not an arrival.
  var wasOn = onDemos();
  function route() {
    var on = onDemos(), arrived = on && !wasOn;
    wasOn = on;
    if (state === 'armed') { if (!on) stop(); return; }
    if (state === 'rest' && arrived) state = 'idle';
    if (state === 'idle') { tries = 0; frame = null; wait(); }
  }
  // Exact routes with the History API: a route change is a navigation (Navigation API) or a popstate.
  if (window.navigation) navigation.addEventListener('navigatesuccess', route);
  addEventListener('popstate', route);
  wait();
})();
