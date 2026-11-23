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
   140) the code is drawn in its block's colour. */
(function () {
  if (!(window.CSS && CSS.highlights && window.Highlight && window.StaticRange)) return;
  var sets = {}, letters = 'afknysw t'.replace(' ', ''), painted = new WeakMap();
  for (var i = 0; i < letters.length; i++) { sets[letters[i]] = new Highlight(); CSS.highlights.set('tok-' + letters[i], sets[letters[i]]); }
  function paint(el) {
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
