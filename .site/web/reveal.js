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
