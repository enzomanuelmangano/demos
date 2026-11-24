/* /demos's frame host (D19, docs/isolation.md §6): tells every framed Demos app where the page is, so the app's
   history (joint with the page's) moves in place only while the page is really elsewhere. `{ demos: 'page', current,
   visible }`: current = the page is on /demos, visible = the frame is on screen; sent when a frame loads, at every
   route change (the Navigation API's navigate, at once, before the route's own work; popstate) and every change of
   the frame's visibility (IntersectionObserver) or the tab's. */
(function () {
  var onDemos = function (path) { return /^\/demos\/?$/.test(path); };
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
/* /demos's one-time touch demo (D19): once per session, 1.2 s after the framed Demos app has drawn, an iOS-style touch
   indicator taps an app on the phone (it opens), taps inside it (Composable Text's pill morphs), and closes it, so the
   phone reads as a live device, not a picture. The app is driven only through its framed-app messages
   (modules/web/index.js: `rect` and `press` by testId, docs/isolation.md); nothing here reaches into it. Only where the
   page frames the app (from 768 px, on /demos); skipped with reduced motion or Save-Data. Stopped at once by any input
   on the page or in the app (the app reports real input), a hidden tab, or leaving /demos (Back included); a demo it
   opened is closed again, so the kept frame never carries it around the site. Never blocks: the indicator takes no
   pointer. */
(function () {
  var KEY = 'reactiive.demos.hint', AKEY = 'reactiive.demos.arrow';
  var seen = function () { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
  var mark = function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} };
  var aseen = function () { try { return sessionStorage.getItem(AKEY) === '1'; } catch (e) { return true; } };
  var amark = function () { try { sessionStorage.setItem(AKEY, '1'); } catch (e) {} };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The arrow plays with reduced motion too (still, only faded) and with Save-Data (it costs no bytes); the touch demo not.
  var touchOk = function () { return !seen() && !reduce && !(navigator.connection && navigator.connection.saveData); };
  if (!touchOk() && aseen()) return;
  var wide = matchMedia('(min-width: 768px)');
  var onDemos = function () { return /^\/demos\/?$/.test(location.pathname); };
  var state = 'idle', dot = null, frame = null, opened = false, waits = {}, timer = 0, tries = 0;
  var visible = function () { return !!frame && frame.isConnected && frame.checkVisibility() && onDemos(); };
  function stop() {
    if (state !== 'playing' && state !== 'armed') return;
    var was = state;
    state = 'done';
    mark();
    clearTimeout(timer);
    off();
    unarrow(200);
    // A demo the hint opened is closed again before the indicator leaves.
    if (was === 'playing' && opened && frame && frame.contentWindow) frame.contentWindow.postMessage({ demos: 'press', target: 'close' }, '*');
    opened = false;
    if (dot) { var d = dot; dot = null; d.animate([{ opacity: getComputedStyle(d).opacity }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = function () { d.remove(); }; }
  }
  function onInput() { stop(); }
  function onHide() { if (document.hidden) stop(); }
  function onLeave() { stop(); }
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
    if (!frame || e.source !== frame.contentWindow || !m || typeof m.demos !== 'string') return;
    if (m.demos === 'input') stop();
    if (m.demos === 'rect' && waits[m.target]) { var w = waits[m.target]; delete waits[m.target]; w(m.rect); }
  });
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function rect(target) {
    return new Promise(function (resolve) {
      waits[target] = resolve;
      frame.contentWindow.postMessage({ demos: 'rect', target: target }, '*');
      setTimeout(function () { if (waits[target]) { delete waits[target]; resolve(null); } }, 500);
    });
  }
  // The indicator: iOS's touch circle (a soft grey disc with a light rim), placed in page coordinates over the frame.
  function place(r) {
    var f = frame.getBoundingClientRect();
    return { x: f.left + scrollX + r.x + r.width / 2, y: f.top + scrollY + r.y + r.height / 2 };
  }
  function show(at) {
    dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;pointer-events:none;z-index:50;'
      + 'background:radial-gradient(circle,rgb(255 255 255 / .42) 0,rgb(255 255 255 / .28) 62%,rgb(255 255 255 / .18) 100%);'
      + 'box-shadow:0 0 0 1px rgb(255 255 255 / .45),0 4px 14px rgb(0 0 0 / .28);opacity:0';
    dot.style.translate = at.x + 'px ' + (at.y + 28) + 'px';
    document.body.appendChild(dot);
    return dot.animate([{ opacity: 0, translate: at.x + 'px ' + (at.y + 28) + 'px', scale: 1.15 }, { opacity: 1, translate: at.x + 'px ' + at.y + 'px', scale: 1 }],
      { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished;
  }
  function move(at) {
    var from = dot.style.translate;
    dot.style.translate = at.x + 'px ' + at.y + 'px';
    return dot.animate([{ translate: from, opacity: 1 }, { translate: at.x + 'px ' + at.y + 'px', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }).finished;
  }
  function tap() {
    return dot.animate([{ scale: 1, opacity: 1 }, { scale: .78, opacity: 1, offset: .45 }, { scale: 1, opacity: 1 }], { duration: 320, easing: 'ease-out' }).finished;
  }
  var live = function () { return state === 'playing' && visible(); };
  async function step(target, after) {
    if (!live()) return false;
    var r = await rect(target);
    if (!live() || !r) return false;
    var at = place(r);
    if (!dot) await show(at); else await move(at);
    if (!live() || !dot) return false;
    var t = tap();
    await sleep(120);
    if (!live()) return false;
    frame.contentWindow.postMessage({ demos: 'press', target: target }, '*');
    if (target.indexOf('icon-') === 0) opened = true;
    if (target === 'close') opened = false;
    await t;
    await sleep(after);
    return live();
  }
  async function play() {
    if (state !== 'armed' || seen() || !visible()) return stop();
    state = 'playing';
    mark();
    (await step('icon-composable-text', 900)) && (await step('toggle', 1100)) && (await step('close', 500));
    stop();
  }
  // Wait, on /demos only and from 768 px only, for the visible framed app to go live (the page marks it once the app
  // has drawn), then 1.2 s more. A route change restarts the wait with its own budget; elsewhere nothing polls.
  function wait() {
    clearTimeout(timer);
    if (state !== 'idle' || (!touchOk() && aseen())) return;
    if (!onDemos() || !wide.matches) return;
    if (++tries > 120) return; // 30 s on this visit of /demos
    var f = Array.prototype.find.call(document.querySelectorAll('iframe[data-motion~=live]'), function (f) {
      var r = f.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility();
    });
    if (!f) { timer = setTimeout(wait, 250); return; }
    frame = f;
    state = 'armed';
    on();
    if (aseen()) { timer = setTimeout(touchOk() ? play : stop, 1200); return; }
    amark();
    settle(function () {
      if (state !== 'armed') return;
      if (!visible() || !arrow(function () { if (state === 'armed') timer = setTimeout(touchOk() ? play : stop, 350); })) timer = setTimeout(touchOk() ? play : stop, 1200);
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
  // ~4 s, then the touch demo. Hovering the phone, any input, leaving /demos or a resize fades it at once (and skips the
  // touch demo: the reader has found the phone). Reduced motion: the same arrow, still, faded in and out. Never blocks.
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
  var phone = null;
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
    var sw = Math.min(420, (fr.height - 48) * 0.448718), sh = Math.min(912, (fr.height - 48) * 0.974359), bez = sw * 0.04;
    var sl = fr.left + (fr.width - sw) / 2, st = fr.top + (fr.height - sh) / 2;
    phone = { l: sl - bez, r: sl + sw + bez, t: st - bez, b: st + sh + bez };
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
      path.style.strokeDasharray = len + ' ' + len;
      arrAnims.push(path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: DRAW, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' }));
      heads.forEach(function (h, i) {
        h.style.strokeDasharray = hl + ' ' + hl;
        arrAnims.push(h.animate([{ strokeDashoffset: hl }, { strokeDashoffset: 0 }], { duration: 200, delay: DRAW - 90 + i * 50, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' }));
      });
      arrAnims.push(svg.animate([{ transform: 'none' }, { transform: by(5) }, { transform: 'none' }], { duration: HOLD / 2, delay: t0, iterations: 2, easing: 'cubic-bezier(.45,0,.55,1)' }));
      arrAnims.push(last = svg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: by(8) }], { duration: 450, delay: t0 + HOLD, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' }));
    }
    last.onfinish = function () { if (arr === svg) { unarrow(0); done(); } };
    return true;
  }
  function route() {
    if (state === 'armed' || state === 'playing') { if (!onDemos()) stop(); return; }
    if (state === 'idle') { tries = 0; frame = null; wait(); }
  }
  // Exact routes with the History API: a route change is a navigation (Navigation API) or a popstate.
  if (window.navigation) navigation.addEventListener('navigatesuccess', route); else addEventListener('popstate', route);
  addEventListener('popstate', route);
  wait();
})();
