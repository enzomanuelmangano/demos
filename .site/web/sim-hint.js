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
  function at(path) { current = onDemos(path); all(); }
  if (window.navigation) navigation.addEventListener('navigate', function (e) { try { at(new URL(e.destination.url).pathname); } catch (x) {} });
  addEventListener('popstate', function () { at(location.pathname); });
  addEventListener('pageshow', function () { at(location.pathname); });
  document.addEventListener('visibilitychange', all);
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) {
      var n = ms[i].addedNodes[j];
      if (n.nodeType === 1 && (n.tagName === 'IFRAME' || n.querySelector('iframe'))) return all();
    }
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
  var KEY = 'reactiive.demos.hint';
  var seen = function () { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
  var mark = function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} };
  if (seen() || matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData)) return;
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
    if (state !== 'idle' || seen()) return;
    if (!onDemos() || !wide.matches) return;
    if (++tries > 120) return; // 30 s on this visit of /demos
    var f = Array.prototype.find.call(document.querySelectorAll('iframe[data-motion~=live]'), function (f) {
      var r = f.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility();
    });
    if (!f) { timer = setTimeout(wait, 250); return; }
    frame = f;
    state = 'armed';
    on();
    timer = setTimeout(play, 1200);
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
