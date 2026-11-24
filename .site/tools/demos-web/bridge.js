/* The framed-app bridge for reactiive.io's /demos (D19, docs/isolation.md §6). Not part of the Demos app: tools/compose.ts
   writes it inline into the /demos/app/ artifact's HTML (index.html, shell.html), so the app's own build and its
   captured sources carry none of it. A classic script in the head: it runs before the app's modules, so the history
   methods it wraps are the ones the app's router calls. */
(function () {
  // Framed by another page (reactiive.io's /demos shows this app in a sandboxed frame and plays a one-time touch
  // demo over it, .site/docs/decisions.md D19, .site/docs/isolation.md §6), the parent may ask, by message only:
  // `{ demos: 'rect', target }` (the box of the element whose testId is `target`, answered as
  // `{ demos: 'rect', target, rect }` in this window's CSS pixels, or rect null) and `{ demos: 'press', target }` (press
  // it as a tap would). Only from the parent window, and only from the origin that serves this app (the site and the
  // app are one deployment: reactiive.io's parent on reactiive.io, a preview's on that preview, a local server's on
  // it); answers go to that origin only. Once the parent has spoken, real input here is told to it
  // (`{ demos: 'input' }`) so it stops its demo. The page also says where it is (`{ demos: 'page', current, visible }`:
  // on /demos or not, the frame on screen or not), which the frame's history follows (below). Nothing else is read or
  // answered. At the top level none of this exists.
  const FRAMED = window.parent !== window;
  if (FRAMED) {
    const HOME = new URL(location.href).origin;
    let parentOrigin = null;
    const post = (m) => { if (parentOrigin) try { window.parent.postMessage(m, parentOrigin); } catch {} };
    // ---- The frame's history, which is the page's (joint) ----
    // The router (navigation.js) moves through its own entries with pushState, replaceState and history.go; each
    // state carries its index (`exact`). Mirrored here, so a move can be made without traversing the joint history:
    // - a route a parent's press opens REPLACES the entry (the reader's Back never steps through the parent's demo, and
    //   a full demo leaves no forward entry), and its close is a replace back to the entry it replaced, never a go(-1);
    // - while the page says it is elsewhere (`{ demos: 'page', current: false }`: a site link took it off /demos, and
    //   this frame is kept hidden), a go(-n) of the router would traverse the PAGE's history (Back out of /articles,
    //   say): it is made a replace to the target entry, with the popstate the router waits for. Back on /demos
    //   (`current: true`) the router's moves are the browser's again. Without a word from the page, nothing changes.
    const states = new Map(), replacedAt = new Set(), H = history;
    // Safari (WebKit) refuses a pushState or replaceState that changes the path in an opaque-origin document (this
    // sandboxed frame): only the same URL or a fragment, else a SecurityError, which left the router half way (a demo's
    // card open and black, no close). Refused, the entry is still made, without its URL: the router keeps each entry's
    // URL itself (its states' `exact` index), so its routes, Back and Forward are unchanged; the frame's address stays
    // where it was, and the route's URL is the one recorded here (`here`). Chrome takes the URL as before.
    const keepUrl = (fn) => function (state, title, url) {
      try { return fn.call(H, state, title, url); } catch (e) {
        if (!e || e.name !== 'SecurityError' || url == null) throw e;
        return fn.call(H, state, title);
      }
    };
    const push = keepUrl(H.pushState), replace = keepUrl(H.replaceState), go = H.go, back = H.back;
    const page = { current: true, visible: true };
    let pressUntil = 0;
    // An entry's URL: the one given, else (a popstate) the one already recorded for it, else the address.
    const note = (state, url) => { if (state && typeof state.exact === 'number') states.set(state.exact, { state, url: url != null ? new URL(url, location.href).href : states.get(state.exact)?.url ?? location.href }); };
    // The route's path: the recorded URL of the entry shown (the address, unless Safari refused it).
    const here = () => { const s = states.get(H.state?.exact); return s ? new URL(s.url).pathname : location.pathname; };
    note(H.state, null);
    H.pushState = function (state, title, url) {
      if (performance.now() < pressUntil && state && typeof state.exact === 'number') {
        replacedAt.add(state.exact);
        const r = replace.call(H, state, title, url);
        note(state, url);
        return r;
      }
      const r = push.call(H, state, title, url);
      note(state, url);
      return r;
    };
    H.replaceState = function (state, title, url) { const r = replace.call(H, state, title, url); note(state, url); return r; };
    addEventListener('popstate', () => note(H.state, null), true);
    // A move to entry `to` in place: the URL and state replaced, then the popstate a traversal would have sent.
    const moveTo = (to) => {
      const t = states.get(to), cur = H.state?.exact;
      if (typeof cur === 'number') replacedAt.delete(cur);
      replace.call(H, t.state, '', t.url);
      dispatchEvent(new PopStateEvent('popstate', { state: H.state }));
    };
    const inPlace = (d) => {
      const cur = H.state?.exact, to = typeof cur === 'number' ? cur + d : NaN;
      return d < 0 && states.has(to) && (replacedAt.has(cur) || !page.current) ? to : null;
    };
    H.go = function (d = 0) { const to = typeof d === 'number' ? inPlace(d) : null; if (to !== null) return void setTimeout(() => moveTo(to)); return go.call(H, d); };
    H.back = function () { const to = inPlace(-1); if (to !== null) return void setTimeout(() => moveTo(to)); return back.call(H); };
    // A close the parent asks for while the page is elsewhere or this frame is off screen: the route goes home at
    // once, no flight (a flight would wait for frames that never come). On screen, the close button's own flight.
    const closeNow = () => {
      const cur = H.state?.exact;
      if (page.current && page.visible || typeof cur !== 'number' || !states.has(cur - 1) || !here().includes('/demo/')) return false;
      moveTo(cur - 1);
      return true;
    };
    // A press as a tap would: the route it opens replaces the entry (above).
    const pressEl = (el) => {
      pressUntil = performance.now() + 1500;
      const r = el.getBoundingClientRect(), at = { bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', at));
      el.dispatchEvent(new MouseEvent('click', at));
    };
    addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window.parent || e.origin !== HOME || !m) return;
      if (m.demos === 'page') { page.current = m.current !== false; page.visible = m.visible !== false; return; }
      if ((m.demos !== 'rect' && m.demos !== 'press') || typeof m.target !== 'string' || !/^[a-z0-9-]{1,80}$/.test(m.target)) return;
      parentOrigin = e.origin;
      const el = document.querySelector(`[data-testid="${m.target}"]`);
      if (m.demos === 'rect') {
        const r = el?.getBoundingClientRect();
        return post({ demos: 'rect', target: m.target, rect: r && r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null });
      }
      if (m.target === 'close' && closeNow()) return;
      if (el) pressEl(el);
    });
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, (e) => { if (e.isTrusted) { pressUntil = 0; post({ demos: 'input' }); } }, { capture: true, passive: true });

    // ---- A deep link (.site/docs/decisions.md D21): `{ demos: 'goto', slug, still }` ----
    // reactiive.io/demos/<slug> is /demos whose phone goes to that demo as a reader would: the launcher pages to the
    // icon's page with the pager's own swipe (trackpad-style wheel deltas into the app's pager, which follows them 1:1,
    // reads the throw and settles on its paging spring), one page per swipe, then the icon is pressed (the app's open
    // flight; the route replaces the entry, as any parent's press). The page is found from the launcher's real layout
    // (the icon's box against the pager's), never from a table. `still` (reduced motion, the page's or this window's):
    // the pages jump (the pager's arrow keys, which jump under reduced motion) and the app opens without its flight (its
    // own reduced-motion rule). A demo already open is closed first; the same demo open is left. No icon: the launcher
    // stays as it is. Any real input here, a new goto, or `{ demos: 'goto', slug: '' }` stops the rest; the latter also
    // closes the demo the last goto opened, if it is still the one open (the page went to /demos), unless it says
    // `close: false` (the page went elsewhere: the demo stays for a return to its post). Progress is posted
    // back as `{ demos: 'goto', slug, state }`: paged, opened, missing, stopped.
    let gotoRun = 0, gotoOpened = '';
    const openSlug = () => (/\/demo\/([^/]+)\/?$/.exec(here()) || [])[1] || '';
    const later = (ms) => new Promise((r) => setTimeout(r, ms));
    const nextFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 100); });
    const until = async (f, ms, live) => { const t = performance.now(); while (performance.now() - t < ms) { if (!live()) return false; if (f()) return true; await later(40); } return f(); };
    const track = () => document.querySelector('[data-testid="pager-track"]');
    const closeOpen = () => { if (closeNow()) return; const c = document.querySelector('[data-testid="close"]'); if (c) pressEl(c); };
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, (e) => { if (e.isTrusted) gotoRun++; }, { capture: true, passive: true });
    const goto = async (slug, still) => {
      const run = ++gotoRun, live = () => run === gotoRun;
      const report = (state) => post({ demos: 'goto', slug, state });
      still = still || matchMedia('(prefers-reduced-motion: reduce)').matches;
      // The launcher is the app's once its pager is driven (the drive marks the track).
      if (!(await until(() => track()?.style.willChange === 'transform', 20000, live))) return live() && report('stopped');
      if (openSlug()) {
        if (openSlug() === slug) { gotoOpened = slug; return report('opened'); }
        closeOpen();
        if (!(await until(() => !openSlug() && !document.querySelector('[data-testid="web-card"]'), 4000, live))) return live() && report('stopped');
        await later(120);
      }
      const icon = [...document.querySelectorAll(`[data-testid="icon-${slug}"]`)].find((e) => e.closest('[data-testid="pager-track"]') && e.getBoundingClientRect().width > 0);
      if (!live()) return;
      if (!icon) return report('missing');
      const pager = icon.closest('[data-testid="pager"]');
      // Pages between the one shown and the icon's: from the boxes, so the app's order and page size decide.
      const away = () => { const p = pager.getBoundingClientRect(), r = icon.getBoundingClientRect(); return Math.floor((r.left + r.width / 2 - p.left) / p.width); };
      for (let n = away(), guard = 0; n !== 0 && guard < 40; n = away(), guard++) {
        if (!live()) return;
        const dir = Math.sign(n);
        if (still) { for (let i = 0; i < Math.abs(n); i++) dispatchEvent(new KeyboardEvent('keydown', { key: dir > 0 ? 'ArrowRight' : 'ArrowLeft', bubbles: true, cancelable: true })); await nextFrame(); continue; }
        // One swipe: wheel deltas (in this window's px: the pager reads them in the frame's pt, divided by its scale)
        // that grow for five frames, then fall away by 0.85 a frame, the decay the pager reads as the fingers lifting
        // (its momentum test), so it releases at once at the throw's speed (~1,100 pt/s, a flick: one page) with no
        // hold; 30 % of a page in all. The next swipe waits for the settle to be mostly done, as a thumb does.
        const screen = pager.closest('[data-testid="web-screen"]'), k = screen ? screen.getBoundingClientRect().width / (screen.offsetWidth || 1) : 1;
        const weights = [1, 2, 3, 4, 5, 5 * 0.85, 5 * 0.85 ** 2, 5 * 0.85 ** 3, 5 * 0.85 ** 4], sum = weights.reduce((a, b) => a + b, 0);
        const r = pager.getBoundingClientRect(), unit = pager.clientWidth * 0.3 / sum;
        for (const wgt of weights) {
          if (!live()) return;
          pager.dispatchEvent(new WheelEvent('wheel', { deltaX: dir * wgt * unit * k, deltaY: 0, deltaMode: 0, bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
          await nextFrame();
        }
        await later(Math.abs(n) > 1 ? 380 : 120);
      }
      // Settled: the icon's box still for two looks (the paging spring ends within 0.05 pt).
      let x = NaN;
      if (!(await until(() => { const nx = icon.getBoundingClientRect().left, ok = Math.abs(nx - x) < 0.02; x = nx; return ok && away() === 0; }, 3000, live))) return live() && report('stopped');
      report('paged');
      // A beat on the page before the tap, as a reader's eye finds the icon.
      await later(still ? 60 : 260);
      if (!live() || !icon.isConnected) return live() && report('stopped');
      gotoOpened = slug;
      pressEl(icon);
      report((await until(() => openSlug() === slug, 3000, live)) ? 'opened' : 'stopped');
    };
    addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window.parent || e.origin !== HOME || !m || m.demos !== 'goto' || typeof m.slug !== 'string' || !/^[a-z0-9-]{0,80}$/.test(m.slug)) return;
      parentOrigin = e.origin;
      if (m.slug) return void goto(m.slug, m.still === true);
      gotoRun++;
      if (m.close === false) return;
      if (gotoOpened && openSlug() === gotoOpened) closeOpen();
      gotoOpened = '';
    });
  }
  // In a sandboxed frame (an opaque origin: reactiive.io's /demos, which draws the phone's rim, keys and shadow itself
  // under the frame, from a still) the desktop frame draws only its display: the stage, the rim, the glass and the
  // shadow are transparent, so the page's own drawing shows around the display with no seam at any scale.
  if (FRAMED && self.origin === 'null') {
    // The page always shows an iPhone Air here, so the app must always draw one (its `framed`, app.contract), whatever
    // the reader's pointer. The app frames itself only for a fine pointer (`exactViewport().pointer`, read from
    // `(pointer: coarse)` and `(pointer: none)`): on a touch tablet (an iPad, 768-1032 px) it filled the frame with its
    // full-screen tablet launcher instead, which the page's phone outline cut (the close button fell in the clipped
    // strip). Those two queries answer "no" in this frame only; every other query, and the app's own CSS, are the
    // browser's. The host's input mode (touch or mouse) is set from the real query first, so a finger stays a finger.
    const realMatch = window.matchMedia.bind(window);
    const html = document.documentElement;
    if (!html.dataset.exactInput) html.dataset.exactInput = realMatch('(pointer: coarse)').matches ? 'touch' : 'mouse';
    const no = (media) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
    window.matchMedia = (q) => (/^\(\s*pointer\s*:\s*(?:coarse|none)\s*\)$/.test(String(q).trim()) ? no(String(q)) : realMatch(q));
    const sheet = document.createElement('style');
    sheet.textContent = ':has([data-testid="web-stage"]),[data-testid="web-stage"]{background:transparent !important}'
      + '[data-testid="web-stage"] > * > :not([data-testid="web-device"]){visibility:hidden !important}';
    document.head.appendChild(sheet);
  }

})();
