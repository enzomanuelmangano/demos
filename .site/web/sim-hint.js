/* /demos's one-time touch demo (D19): once per session, 1.2 s after the framed Demos app has drawn, an iOS-style touch
   indicator taps an app on the phone (it opens), taps inside it (Composable Text's pill morphs), and closes it, so the
   phone reads as a live device, not a picture. The app is driven only through its framed-app messages
   (modules/web/index.js: `rect` and `press` by testId); nothing here reaches into it. Skipped with reduced motion or
   Save-Data; stopped at once by any input on the page or in the app (the app reports its first real input), or when
   the tab is hidden. Never blocks: the indicator takes no pointer, and the frame keeps every touch. */
(function () {
  var KEY = 'reactiive.demos.hint';
  var seen = function () { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
  if (seen() || matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData)) return;
  var stopped = false, dot = null, frame = null, waits = {};
  function stop() {
    if (stopped) return;
    stopped = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    if (dot) { var d = dot; d.animate([{ opacity: getComputedStyle(d).opacity }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = function () { d.remove(); }; }
    removeEventListener('pointerdown', stop, true); removeEventListener('wheel', stop, true); removeEventListener('keydown', stop, true);
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
  async function step(target, after) {
    if (stopped) return false;
    var r = await rect(target);
    if (stopped || !r) return false;
    var at = place(r);
    if (!dot) await show(at); else await move(at);
    if (stopped) return false;
    var t = tap();
    await sleep(120);
    if (stopped) return false;
    frame.contentWindow.postMessage({ demos: 'press', target: target }, '*');
    await t;
    await sleep(after);
    return !stopped;
  }
  async function play() {
    if (stopped || seen()) return;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    (await step('icon-composable-text', 900)) && (await step('toggle', 1100)) && (await step('close', 500));
    stop();
  }
  // Wait for the visible framed app to go live (the page marks it once the app has drawn), then 1.2 s more.
  var tries = 0;
  (function wait() {
    if (stopped || ++tries > 600) return;
    if (!/^\/demos\/?$/.test(location.pathname)) return void setTimeout(wait, 500);
    var live = Array.prototype.find.call(document.querySelectorAll('iframe[data-motion~=live]'), function (f) {
      var r = f.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0 && f.checkVisibility();
    });
    if (!live) return void setTimeout(wait, 250);
    frame = live;
    // From here, on /demos with the app live, any input means the reader has found it: no demo.
    addEventListener('pointerdown', stop, true); addEventListener('wheel', stop, { capture: true, passive: true }); addEventListener('keydown', stop, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    setTimeout(play, 1200);
  })();
})();
