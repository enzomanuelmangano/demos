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
    const push = H.pushState, replace = H.replaceState, go = H.go, back = H.back;
    const page = { current: true, visible: true };
    let pressUntil = 0;
    const note = (state, url) => { if (state && typeof state.exact === 'number') states.set(state.exact, { state, url: url == null ? location.href : new URL(url, location.href).href }); };
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
      if (page.current && page.visible || typeof cur !== 'number' || !states.has(cur - 1) || !location.pathname.includes('/demo/')) return false;
      moveTo(cur - 1);
      return true;
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
      if (!el) return;
      pressUntil = performance.now() + 1500;
      const r = el.getBoundingClientRect(), at = { bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', at));
      el.dispatchEvent(new MouseEvent('click', at));
    });
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, (e) => { if (e.isTrusted) { pressUntil = 0; post({ demos: 'input' }); } }, { capture: true, passive: true });
  }
  // In a sandboxed frame (an opaque origin: reactiive.io's /demos, which draws the phone's rim, keys and shadow itself
  // under the frame, from a still) the desktop frame draws only its display: the stage, the rim, the glass and the
  // shadow are transparent, so the page's own drawing shows around the display with no seam at any scale.
  if (FRAMED && self.origin === 'null') {
    const sheet = document.createElement('style');
    sheet.textContent = ':has([data-testid="web-stage"]),[data-testid="web-stage"]{background:transparent !important}'
      + '[data-testid="web-stage"] > * > :not([data-testid="web-device"]){visibility:hidden !important}';
    document.head.appendChild(sheet);
  }

})();
