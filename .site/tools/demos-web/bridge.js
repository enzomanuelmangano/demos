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
    let parentOrigin = null, siteOrigin = null;
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
      if (m.demos === 'page') { siteOrigin = e.origin; page.current = m.current !== false; page.visible = m.visible !== false; return; }
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
        // Left as it is: one the reader opened ("Read article" from inside it) is not the goto's to close.
        if (openSlug() === slug) return report('opened');
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

    // ---- "Read article" (.site/docs/decisions.md D25) ----
    // The app's menus offer it for a demo with an article (`window.__reactiiveArticles`, written by tools/compose.ts),
    // once the page that frames this app has spoken. Picking it asks that page (`{ demos: 'read', slug }`, to its origin
    // only), which goes to the demo's post as a link would (web/sim-goto.js). The icons' long-press menu is the app's
    // own (a compose-time patch adds the item, tools/demos-web/patches.ts, through `__siteArticle`). A search result and
    // an open demo have no menu in the app, so theirs is drawn here with the icons' menu's look: a search result's on a
    // right click or a long press, an open demo's on a right click alone (a long press there is the demo's gesture).
    const ARTICLES = new Set(window.__reactiiveArticles || []);
    const readable = (slug) => !!siteOrigin && ARTICLES.has(slug);
    const read = (slug) => { if (readable(slug)) window.parent.postMessage({ demos: 'read', slug }, siteOrigin); };
    window.__siteArticle = { has: readable, read };
    // The Inspiration sheet (the app's WebSheet, home/web-chrome.contract) of an open demo with an article gets
    // "Read article" under its own action, in the sheet's look (a dark pill where the action is white). Pressing it
    // dismisses the sheet as its scrim would and goes to the post. Appended to the sheet's live panel (after the app's
    // own regions, so no region of the app ever holds it); the panel is the app's and leaves with the sheet, taking the
    // button with it. A sheet that is leaving (`data-exiting`, its exit animation) is never looked at: a sheet re-opened
    // during the exit gets its button at once, and the press dismisses the live sheet.
    const SHEET_READ = 'web-sheet-read';
    const liveKids = (el) => [...el.children].filter((c) => !c.hasAttribute('data-exiting'));
    const sheetRead = () => {
      const slug = openSlug();
      if (!slug || !readable(slug)) return;
      const sheet = document.querySelector('[data-testid="web-sheet"]');
      if (!sheet) return;
      const kids = liveKids(sheet), scrim = kids.find((c) => c.matches('button[aria-label="Dismiss"]')), panel = kids.find((c) => c.tagName !== 'BUTTON');
      if (!scrim || !panel || panel.querySelector(`[data-testid="${SHEET_READ}"]`)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.testid = SHEET_READ;
      b.style.cssText = 'all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;height:52px;flex-shrink:0;border-radius:26px;background:rgba(255,255,255,.14);color:#fff;font:600 17px/1 -apple-system,system-ui,sans-serif;cursor:pointer;transition:transform .12s ease,background-color .12s ease;-webkit-tap-highlight-color:transparent';
      b.innerHTML = '<span>Read article</span><svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5.2C8.4 4 6.2 3.6 3.2 3.8V15.4C6.2 15.2 8.4 15.6 10 16.8C11.6 15.6 13.8 15.2 16.8 15.4V3.8C13.8 3.6 11.6 4 10 5.2ZM10 5.2V16.6"/></svg>';
      const down = () => { b.style.transform = 'scale(.97)'; b.style.backgroundColor = 'rgba(255,255,255,.2)'; };
      const up = () => { b.style.transform = ''; b.style.backgroundColor = 'rgba(255,255,255,.14)'; };
      b.addEventListener('pointerdown', down);
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, up);
      // The keyboard's focus ring (all:unset took the browser's).
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) b.style.outline = '2px solid rgba(255,255,255,.8)'; });
      b.addEventListener('blur', () => { b.style.outline = ''; });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        // The scrim's own press, as a tap (not pressEl: that one marks the parent's presses for the history).
        if (scrim.isConnected && !scrim.hasAttribute('data-exiting')) {
          const r = scrim.getBoundingClientRect(), at = { bubbles: true, cancelable: true, composed: true, clientX: r.x + 4, clientY: r.y + 4, pointerId: 8, pointerType: 'touch', isPrimary: true, button: 0 };
          scrim.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
          scrim.dispatchEvent(new PointerEvent('pointerup', at));
          scrim.dispatchEvent(new MouseEvent('click', at));
        }
        read(slug);
      });
      panel.append(b);
    };
    new MutationObserver(() => { if (siteOrigin) sheetRead(); }).observe(document.documentElement, { childList: true, subtree: true });
    let menu = null, hold = null, pointer = 'mouse';
    const closeMenu = () => {
      const m = menu; menu = null;
      if (!m) return;
      const done = () => { m.host.remove(); if (m.img) m.img.style.visibility = ''; };
      m.panel.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      m.back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done);
    };
    // The menu over the phone's display (420 x 912 pt, scaled as the display is): by `img` (lifted, as a pressed icon),
    // else at the point clicked.
    const openMenu = (slug, name, img, x, y) => {
      const screen = document.querySelector('[data-testid="web-device"]');
      if (menu || !screen) return;
      const W = 420, H = 912, sr = screen.getBoundingClientRect(), k = sr.width / W || 1;
      const host = document.createElement('div');
      host.dataset.testid = 'read-menu';
      host.style.cssText = `position:fixed;z-index:2147483000;overflow:hidden;transform-origin:0 0;left:${sr.left}px;top:${sr.top}px;width:${W}px;height:${H}px;transform:scale(${k});border-radius:62px`;
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}
.bd{position:absolute;inset:0;background:rgba(0,0,0,.22);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%)}
.lift{position:absolute;box-shadow:0 14px 34px rgba(0,0,0,.42),0 3px 8px rgba(0,0,0,.25);transform:scale(1.06)}
.m{position:absolute;width:250px;border-radius:14px;overflow:hidden;background:rgba(48,48,52,.72);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 18px 50px rgba(0,0,0,.35);color:#fff}
.t{padding:10px 16px 8px;font-size:13px;color:rgba(235,235,245,.6);text-align:center;border-bottom:.5px solid rgba(255,255,255,.14)}
.r{all:unset;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;padding:11px 16px;font-size:17px;cursor:pointer}
.r:active,.r:hover{background:rgba(255,255,255,.1)}</style><div class="bd"></div><div class="m" role="menu"><div class="t"></div><button class="r" role="menuitem" data-k="article"><span>Read article</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5.2C8.4 4 6.2 3.6 3.2 3.8V15.4C6.2 15.2 8.4 15.6 10 16.8C11.6 15.6 13.8 15.2 16.8 15.4V3.8C13.8 3.6 11.6 4 10 5.2ZM10 5.2V16.6"/></svg></button></div>`;
      const back = root.querySelector('.bd'), panel = root.querySelector('.m'), mh = 89, gap = 14;
      root.querySelector('.t').textContent = name;
      let f = { x: (x - sr.left) / k, y: (y - sr.top) / k, w: 0, h: 0 };
      if (img) {
        const r = img.getBoundingClientRect();
        f = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
        const lift = img.cloneNode();
        lift.className = 'lift';
        Object.assign(lift.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
        root.insertBefore(lift, panel);
        lift.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: 320, easing: 'cubic-bezier(.32,.72,0,1)' });
        img.style.visibility = 'hidden';
      }
      const below = f.y + f.h + gap + mh < H - 40;
      const left = Math.min(Math.max(16, f.x), W - 266);
      const top = below ? f.y + f.h + (img ? gap : 4) : f.y - mh - (img ? gap : 4);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.transformOrigin = `${f.x + f.w / 2 - left}px ${below ? 0 : mh}px`;
      document.body.append(host);
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      panel.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
      menu = { host, back, panel, img, at: performance.now() };
      back.addEventListener('click', closeMenu);
      root.querySelector('.r').addEventListener('click', () => { closeMenu(); read(slug); });
    };
    // A search result under the event (the app's search draws its rows in its own shadow root).
    const rowOf = (path) => (path.some((n) => n.dataset?.testid === 'search') ? path.find((n) => n.classList?.contains('row') && n.dataset.slug) : null);
    const rowMenu = (row) => openMenu(row.dataset.slug, row.querySelector('span')?.textContent ?? row.dataset.slug, row.querySelector('img'), 0, 0);
    const dropHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
    addEventListener('pointerdown', (e) => {
      if (!e.isTrusted) return;
      pointer = e.pointerType;
      dropHold();
      if (menu || e.pointerType === 'mouse') return;
      const row = rowOf(e.composedPath());
      if (!row || !readable(row.dataset.slug)) return;
      const h = hold = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => { h.fired = true; rowMenu(row); }, 500) };
    }, true);
    addEventListener('pointermove', (e) => { if (hold && !hold.fired && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) dropHold(); }, true);
    // The release of a press that opened the menu is not a tap on the row.
    for (const type of ['pointerup', 'pointercancel']) addEventListener(type, (e) => {
      if (!hold || e.pointerId !== hold.id) return;
      if (hold.fired) {
        const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, true), 400);
      }
      dropHold();
    }, true);
    addEventListener('contextmenu', (e) => {
      const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // A touch browser's own long-press event lands on the menu just opened; a later right click closes it.
      if (menu) { take(); if (performance.now() - menu.at > 800) closeMenu(); return; }
      const path = e.composedPath(), row = rowOf(path);
      if (row) {
        if (!readable(row.dataset.slug)) return;
        take();
        if (hold) { clearTimeout(hold.timer); hold.fired = true; }
        return rowMenu(row);
      }
      const slug = openSlug();
      if (!slug || !readable(slug) || (e.pointerType || pointer) !== 'mouse') return;
      if (!path.some((n) => n.dataset?.testid === 'web-device') || path.some((n) => n.matches?.('input,textarea,select,[contenteditable]'))) return;
      take();
      openMenu(slug, document.querySelector(`[data-testid="icon-${slug}"]`)?.getAttribute('aria-label') ?? slug, null, e.clientX, e.clientY);
    }, true);
    addEventListener('keydown', (e) => { if (menu && e.key === 'Escape') { e.stopImmediatePropagation(); closeMenu(); } }, true);
    addEventListener('popstate', closeMenu);
    addEventListener('resize', closeMenu);
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
