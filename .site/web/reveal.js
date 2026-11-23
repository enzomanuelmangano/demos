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
    var title = document.title, from = location.pathname, path = url.pathname, id = ++armed;
    setTimeout(function () {
      if (id != armed || document.title != title) return;
      if (location.pathname == path) location.reload();
      else if (location.pathname == from) location.assign(url.href);
    }, 2500);
  }
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
