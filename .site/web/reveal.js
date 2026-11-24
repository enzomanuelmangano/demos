/* RevealOnScroll (the reference's components/motion/reveal-on-scroll.tsx), outside the app's runtime so it runs as
   the page is parsed, as the reference's hydrated effect does: each card grid's paused cards ([data-motion~=wait],
   motion-card-in held on its first frame) start when they come into view (rootMargin 0 0 -40px 0); those entering
   together cascade 60 ms apart in DOM order; the first batch (on screen at the start) continues the first three
   cards' cascade from 280 ms (100 + 3 x 60). A grid drawn later (an in-app navigation) is watched when it appears.
   tools/head.ts inlines this file into app.json's head (comments dropped). */
(function () {
  if (!('IntersectionObserver' in window)) return;
  var watched = typeof WeakSet == 'function' ? new WeakSet() : null;
  function watch(root, targets) {
    var first = true;
    var io = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; })
        .sort(function (a, b) { return targets.indexOf(a) - targets.indexOf(b); });
      var base = first ? 280 : 0;
      first = false;
      visible.forEach(function (node, i) {
        node.style.setProperty('--motion-delay', base + i * 60 + 'ms');
        node.style.animationPlayState = 'running';
        io.unobserve(node);
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }
  function scan() {
    if (!watched) return;
    var grids = document.querySelectorAll('[data-motion~=article-grid]');
    for (var g = 0; g < grids.length; g++) {
      var targets = [].slice.call(grids[g].querySelectorAll(':scope > [data-motion~=wait]')).filter(function (t) { return !watched.has(t); });
      if (!targets.length) continue;
      targets.forEach(function (t) { watched.add(t); });
      watch(grids[g], targets);
    }
  }
  function start() {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState == 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
/* The header's scrolled look (the reference's `window.scrollY > 10`): `html[data-scrolled]` past 10 px of the page's
   scroll, which web/head.css's `[data-motion~=bar]` rule colours (the bar's own 300 ms transition times it). Outside
   the runtime, so a page that activates on interaction (docs/decisions.md D16) has it too; one passive listener that
   writes only when the side changes. */
(function () {
  var root = document.documentElement, on = null;
  function check() {
    var s = (window.scrollY || root.scrollTop) > 10;
    if (s === on) return;
    on = s;
    if (s) root.setAttribute('data-scrolled', ''); else root.removeAttribute('data-scrolled');
  }
  addEventListener('scroll', check, { passive: true });
  check();
})();
/* Code colours (the reference's prism-react-renderer tokens): a code line's runs between comments are one text node
   whose `data-hl` lists its tokens' palette letters and lengths (`k5.a1.w3`, tools/gen-content.ts); each token is a
   StaticRange in the CSS highlight `tok-<letter>`, which web/content.css colours. A node per run instead of a span per
   token, so a content page's runtime has a fraction of the nodes to adopt (docs/decisions.md D16). Painted as the
   parser adds the lines (a MutationObserver from the head, so before their first paint), again when a text node is
   replaced (the runtime's adoption, an in-app navigation). Without the API (Chrome < 105, Safari < 17.2, Firefox <
   140), or with `?hl=spans` (the forced fallback, to check it), a run's coloured tokens become spans
   (`[data-hl]>[data-tok=<letter>]`, the same colours in web/content.css) and its plain tokens stay text: only those
   browsers pay the nodes. */
(function () {
  var api = !!(window.CSS && CSS.highlights && window.Highlight && window.StaticRange) && !/[?&]hl=spans(&|$)/.test(location.search);
  var sets = {}, letters = 'afknyswt', painted = new WeakMap();
  if (api) for (var i = 0; i < letters.length; i++) { sets[letters[i]] = new Highlight(); CSS.highlights.set('tok-' + letters[i], sets[letters[i]]); }
  function spans(el) {
    var node = el.firstChild;
    if (!node || node !== el.lastChild || node.nodeType != 3) return;
    var spec = (el.getAttribute('data-hl') || '').split('.'), text = node.data, at = 0, out = document.createDocumentFragment(), plain = '', any = false;
    for (var i = 0; i < spec.length; i++) {
      var c = spec[i].charAt(0), n = +spec[i].slice(1), part = text.slice(at, at + n);
      at += n;
      if (letters.indexOf(c) < 0 || !n) { plain += part; continue; }
      if (plain) { out.appendChild(document.createTextNode(plain)); plain = ''; }
      any = true;
      var s = document.createElement('span');
      s.setAttribute('data-tok', c);
      s.textContent = part;
      out.appendChild(s);
    }
    if (!any) return;
    plain += text.slice(at);
    if (plain) out.appendChild(document.createTextNode(plain));
    el.replaceChildren(out);
  }
  function paint(el) {
    if (!api) return spans(el);
    var node = el.firstChild, was = painted.get(el);
    if (!node || node.nodeType != 3 || (was && was.node === node)) return;
    if (was) was.ranges.forEach(function (r) { sets[r[0]].delete(r[1]); });
    var spec = (el.getAttribute('data-hl') || '').split('.'), at = 0, ranges = [];
    for (var i = 0; i < spec.length; i++) {
      var c = spec[i].charAt(0), n = +spec[i].slice(1);
      if (sets[c] && n) { var r = new StaticRange({ startContainer: node, startOffset: at, endContainer: node, endOffset: at + n }); sets[c].add(r); ranges.push([c, r]); }
      at += n;
    }
    painted.set(el, { node: node, ranges: ranges });
  }
  function visit(n) {
    if (n.nodeType != 1) return;
    if (n.hasAttribute('data-hl')) paint(n);
    else if (n.firstElementChild) { var all = n.querySelectorAll('[data-hl]'); for (var i = 0; i < all.length; i++) paint(all[i]); }
  }
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i], t = rec.target;
      if (t.nodeType == 1 && t.hasAttribute('data-hl')) paint(t);
      for (var j = 0; j < rec.addedNodes.length; j++) visit(rec.addedNodes[j]);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
/* An in-app navigation to another page starts at its top, as live's (Next scrolls a new page to the top). The page
   scrolls the document, which the route change does not reset: an article opened from /articles scrolled down kept
   that offset (clamped while its module loaded, then the page jumped). A history push to another path scrolls to 0;
   a replace, a hash and back/forward (the browser's restoration) are left alone. */
(function () {
  var push = history.pushState;
  history.pushState = function (state, title, url) {
    var before = location.pathname;
    var r = push.apply(this, arguments);
    if (location.pathname !== before && !location.hash) window.scrollTo(0, 0);
    return r;
  };
})();
/* A link that opens a new tab keeps the focus when clicked; back on this tab (closed with the keyboard) the browser can
   then draw the keyboard ring on it (seen on /demos's pill). A pointer click (detail > 0) drops that focus; a keyboard
   activation (detail 0) keeps it, so the ring stays for keyboard users. */
document.addEventListener('click', function (e) {
  if (!e.detail) return;
  var a = e.target.closest && e.target.closest('a[target="_blank"]');
  if (a) a.blur();
}, true);
/* A page with an interactive demo starts its runtime before the reader reaches the demo, never inside a scroll frame
   (docs/decisions.md D16). Such a page activates on interaction; a page with an `intersect` node (a canvas demo's own)
   would start it at the reader's first scroll, in that scroll's frame (2-3 frames over 16.7 ms at 4x CPU), so the
   demo's frame and the embeds carry none. Once the page is parsed, an idle callback starts it as Exact's capture
   script does (the checkpoint's entry module, its answers fetched beside it); if the reader scrolled in the last
   250 ms it waits for the scroll to settle and tries again, so the start (one task: the view tree and the adoption)
   lands between scrolls, before the reader reaches a demo. A press before then starts it at once (Exact's capture). */
(function () {
  var last = -1e9, x;
  addEventListener('scroll', function () { last = performance.now(); }, { passive: true, capture: true });
  function start() {
    var c = document.querySelector('script[type="application/vnd.exact.checkpoint"]');
    x = self.exact = self.exact || {};
    if (!c || x.ready || c.dataset.activate != 'interaction' || !document.querySelector('[data-motion~=demo]')) return;
    if (performance.now() - last < 250) return setTimeout(idle, 250);
    if (c.dataset.src) x.answers = fetch(c.dataset.src).then(function (r) { return r.ok ? r.text() : null; }, function () { return null; });
    x.ready = import(c.dataset.entry);
  }
  function idle() { (self.requestIdleCallback || setTimeout)(start, { timeout: 3000 }); }
  if (document.readyState != 'loading') idle(); else document.addEventListener('DOMContentLoaded', idle, { once: true });
})();
/* The articles' YouTube and X frames are the browser's lazy frames: the built pages carry `loading="lazy"`
   (tools/seo/postbuild.ts); a frame the runtime draws (an in-app navigation) gets it here and its source set again,
   so it too waits until the reader comes near it. */
(function () {
  var sel = 'iframe[title="YouTube video player"]:not([loading]),iframe[title="X post"]:not([loading])';
  function lazy(f) { f.setAttribute('loading', 'lazy'); var s = f.getAttribute('src'); if (s) f.setAttribute('src', s); }
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) for (var j = 0; j < records[i].addedNodes.length; j++) {
      var n = records[i].addedNodes[j];
      if (n.nodeType != 1) continue;
      if (n.matches(sel)) lazy(n); else if (n.firstElementChild) [].forEach.call(n.querySelectorAll(sel), lazy);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
/* The header is the reference's root layout, kept across its in-app navigations, so its one entrance (Sign In's
   pop-in) plays once a visit. Here a link of a page not yet awake is a document navigation (docs/decisions.md D16):
   a page reached from this site (a link, Back, Forward; not a reload) shows the header already in, as live's does
   (web/head.css, [data-nav]). */
(function () {
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type == 'reload') return;
    if (document.referrer && new URL(document.referrer).origin == location.origin) document.documentElement.setAttribute('data-nav', 'in');
  } catch (e) {}
})();
/* Sign In opens its dialog at the press, before the runtime has started (a page that activates on interaction,
   docs/decisions.md D16, starts it at this press and replays it: up to ~2 s cold at 4x CPU). The dialog is in the
   built page; it is shown here at once and the replayed press finds it open (showModal on an open modal dialog does
   nothing). The provider buttons are asked for once the runtime runs. */
(function () {
  addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-testid="sign-in"]');
    var d = b && document.getElementById('signin-modal');
    if (!d || d.open || typeof d.showModal != 'function') return;
    try { d.showModal(); } catch (err) {}
  }, true);
})();
/* A safety net for in-app navigation. A press on a link of this site not carried out 2.5 s later loads that address as
   a document: either the address changed and the page did not (the head title, which every route sets, is still the
   old page's), or neither changed: a press that landed while the runtime was starting, which its router swallowed or
   whose link was replaced between the press and the release, so no click reached it (measured on the 404: ~1 press in
   40 in the first 20 ms of the start). Armed by the click (keyboard too) and by a pointer released on the link it was
   pressed on. A stuck page is never left on screen. */
(function () {
  var down = null, armed = 0;
  function arm(href) {
    var url; try { url = new URL(href, location.href); } catch (err) { return; }
    if (url.origin != location.origin || url.pathname == location.pathname) return;
    var title = document.title, from = location.pathname, path = url.pathname, id = ++armed, t0 = Date.now();
    var mine = current = { path: path, started: false };
    // Watched every 200 ms. The address is the target but the page is not drawn 2.5 s later: reload it. A navigation
    // toward it has started (the Navigation API's navigate event: the router's pushState, or a document load under
    // way, which a second load would only duplicate in the history), or the page has moved on: done, even if the
    // reader comes back (Back) before the 2.5 s are up. Neither moved: the press was lost, load the address.
    var timer = setInterval(function () {
      var late = Date.now() - t0 >= 2500;
      if (id != armed || document.title != title) return clearInterval(timer);
      if (location.pathname == path) { if (late) { clearInterval(timer); location.reload(); } return; }
      if (mine.started || location.pathname != from) return clearInterval(timer);
      if (late) { clearInterval(timer); location.assign(url.href); }
    }, 200);
  }
  // A navigation toward the armed link has started (the Navigation API's navigate event: the router's pushState, a
  // document load): marked at once, so a Back right after it cannot hide it from the next check.
  var current = null;
  if (self.navigation && navigation.addEventListener) navigation.addEventListener('navigate', function (e) {
    try { if (current && new URL(e.destination.url).pathname == current.path) current.started = true; } catch (err) {}
  });
  // A page left (a document navigation, the back/forward cache) drops what it armed: restored by Back, it must not
  // carry out a press made before it was left.
  addEventListener('pagehide', function () { armed++; });
  function plain(e, a) { return a && !e.button && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !(a.target && a.target != '_self') && !a.hasAttribute('download'); }
  addEventListener('pointerdown', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    down = plain(e, a) ? { href: a.href, r: a.getBoundingClientRect() } : null;
  }, true);
  addEventListener('pointerup', function (e) {
    var d = down; down = null;
    if (d && e.clientX >= d.r.left && e.clientX <= d.r.right && e.clientY >= d.r.top && e.clientY <= d.r.bottom) arm(d.href);
  }, true);
  addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (plain(e, a) && !e.detail) arm(a.href);
  }, true);
})();
/* Up to 640 px the account dialogs are vaul's Drawer (web/head.css): dragged down they follow the finger (the overlay
   fading with the share dragged), and released past 25 % of their height or faster than 0.4 px/ms they close (vaul's
   closeThreshold and velocity threshold); otherwise they slide back (500 ms, vaul's cubic-bezier(.32,.72,0,1)). An
   upward drag does not move them. A drag that starts on a field or in a scrolled area is the field's. A sheet taller
   than the window scrolls: web/head.css lets the browser pan it upward-finger (pan-down) at its top, where a downward
   drag is the dismiss, and both ways once it is scrolled (data-sheet-scrolled, set here from its scrollTop). */
(function () {
  var ids = { 'signin-modal': 1, 'feedback': 1, 'cancel-subscription': 1 };
  var mq = matchMedia('(max-width: 640px)'), d = null, y0 = 0, t0 = 0, dy = 0, id = null;
  addEventListener('scroll', function (e) {
    var el = e.target;
    if (el && el.nodeType == 1 && ids[el.id]) el.toggleAttribute('data-sheet-scrolled', el.scrollTop > 0);
  }, true);
  function reset(el) { el.style.translate = ''; el.style.transition = ''; el.style.removeProperty('--sheet-fade'); }
  addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('dialog[open]');
    if (!el || !ids[el.id] || !mq.matches || e.button) return;
    if (e.target.closest('input,textarea,select,[contenteditable]') || el.scrollTop > 0) return;
    d = el; y0 = e.clientY; t0 = performance.now(); dy = 0; id = e.pointerId;
  }, true);
  addEventListener('pointermove', function (e) {
    if (!d || e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - y0);
    if (dy < 3) return;
    d.style.transition = 'none';
    d.style.translate = '0 ' + dy + 'px';
    d.style.setProperty('--sheet-fade', String(Math.max(0, 1 - dy / d.offsetHeight)));
  }, true);
  function end(e) {
    if (!d || e.pointerId !== id) return;
    var el = d, h = el.offsetHeight, v = dy / Math.max(1, performance.now() - t0);
    d = null;
    if (dy < 3) return reset(el);
    if (dy > h * 0.25 || v > 0.4) {
      // From where the finger left it to below the screen: the closing transition starts at the current offset.
      el.style.transition = '';
      el.style.translate = '';
      el.style.removeProperty('--sheet-fade');
      el.close();
      var swallow = function (c) { c.stopPropagation(); c.preventDefault(); };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(function () { removeEventListener('click', swallow, true); }, 400);
    } else {
      el.style.transition = 'translate 500ms cubic-bezier(.32,.72,0,1)';
      el.style.translate = '0 0';
      el.style.removeProperty('--sheet-fade');
      setTimeout(function () { reset(el); }, 520);
    }
  }
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
})();
/* The 404 page adopts its document. Exact renders afresh a document made for another path (the checkpoint's location,
   /404.html, is not the address), so a press made before its runtime started was replayed on nodes no longer there
   (the menu or a link of the 404, cold: a dead tap). The not-found page draws the same at every path and reads nothing
   of it, so its checkpoint is moved to the address before the runtime reads it (a mismatch still falls back to a fresh
   render, Exact's own check). */
(function () {
  function fix() {
    var c = document.querySelector('script[type="application/vnd.exact.checkpoint"]');
    if (!c) return;
    try {
      var cp = JSON.parse(c.textContent);
      if (cp.location == '/404.html' && location.pathname != '/404.html') { cp.location = location.pathname; c.textContent = JSON.stringify(cp); }
    } catch (e) {}
  }
  if (document.readyState != 'loading') fix(); else document.addEventListener('DOMContentLoaded', fix, { once: true });
})();
/* The mobile menu opens at the first tap, before the runtime has started (a page that activates on interaction starts
   it at that tap and replays it: 0.3-1.2 s at cable). html[data-menu-early] draws the open menu (web/head.css) and
   the panel loses `inert` so its links can be pressed; a tap on the button or the backdrop meanwhile closes it again
   (the runtime replays those taps too, in order). Once the runtime runs, it draws the menu itself and the flag goes. */
(function () {
  var html = document.documentElement;
  function up() { return !!(self.exact && self.exact.views); }
  function set(open) {
    var m = document.getElementById('mobile-menu');
    if (!m) return;
    if (open) { html.setAttribute('data-menu-early', ''); m.removeAttribute('inert'); }
    else { html.removeAttribute('data-menu-early'); m.setAttribute('inert', ''); }
    if (open) (function wait() { if (!html.hasAttribute('data-menu-early')) return; if (up()) return requestAnimationFrame(function () { html.removeAttribute('data-menu-early'); }); setTimeout(wait, 30); })();
  }
  addEventListener('click', function (e) {
    if (up() || !e.target || !e.target.closest) return;
    if (e.target.closest('[aria-controls="mobile-menu"]')) set(!html.hasAttribute('data-menu-early'));
    else if (html.hasAttribute('data-menu-early') && e.target.closest('#mobile-menu>:first-child')) set(false);
  }, true);
})();
/* The first frame of the menu or the sign-in dialog before the runtime's start. A press on either starts the runtime
   (Exact's capture script imports it at the click, in the same task), and loading and compiling it held back the
   frame that shows the menu (~15 ms more than live at 4x CPU). On the press's pointerdown the start is taken over
   here: `exact.ready` is set to a start that runs 350 ms after the click, once the menu's 300 ms opening has played
   (the capture script then only queues the press, which the runtime replays as before), or 900 ms after the
   pointerdown if no click follows. */
(function () {
  addEventListener('pointerdown', function (e) {
    var x = self.exact = self.exact || {};
    var c = document.querySelector('script[type="application/vnd.exact.checkpoint"]');
    if (x.ready || x.views || !c || !e.target || !e.target.closest || !e.target.closest('[aria-controls="mobile-menu"],[data-testid="sign-in"]')) return;
    var go, started = false;
    x.ready = new Promise(function (r) { go = r; });
    function start() {
      if (started) return;
      started = true;
      if (c.dataset.src) x.answers = fetch(c.dataset.src).then(function (r) { return r.ok ? r.text() : null; }, function () { return null; });
      go(import(c.dataset.entry));
    }
    addEventListener('click', function () { setTimeout(start, 350); }, { once: true });
    setTimeout(start, 900);
  }, true);
})();
