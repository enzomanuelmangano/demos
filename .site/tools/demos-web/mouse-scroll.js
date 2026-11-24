/* A mouse drags the framed app's scroll views as a finger does (reactiive.io's /demos, .site/docs/isolation.md §6). Not
   part of the Demos app: tools/compose.ts writes it inline into the /demos/app/ artifact's HTML after the bridge, so the
   app's own build and its captured sources carry none of it. Installed only when framed; at the top level (every phone,
   every direct visit) none of it exists.

   The app's scroll views on the web are the browser's own `overflow: auto` boxes (the Exact web host lowers `scroll`,
   and any box with overflow auto, to one, and the browser scrolls it): a finger and a wheel scroll them, a mouse never
   does (no desktop browser pans a scroller by a mouse drag), so on the desktop frame a drag on the search results, a
   demo's list or any other scroller moved nothing, and its release clicked whatever was under the pointer (a row opened,
   or the search closed). The iOS Simulator turns the mouse into a finger; this does the same for these boxes:
   - a mouse press (left button) on a box that scrolls, with nothing between it and the press that claims the drag
     (a computed touch-action withholding that axis: the launcher pager, a Contract pan, a GPU surface that takes
     touches; a host drag's handle; a text field), becomes a pan once it travels past UIScrollView's slop (10 pt in the screen's points); the press under
     it is cancelled (a pointercancel, as the app's own pans send) and its click dropped, so a drag never taps;
   - the content follows the pointer 1:1 (scrollTop / scrollLeft, the box's own scrolling, on the compositor), and past
     an edge by UIScrollView's rubber band (1 - 1 / (d * 0.55 / size + 1)) * size, drawn as a translate of the box's
     children by a paused animation, each child its own layer meanwhile (no inline style per frame: the host's sheets
     select on `[style*=...]`, so each write restyles the page);
   - the release keeps the finger's velocity (the last 80 ms) and decelerates as UIScrollView's normal rate, 0.998 per
     ms; a deceleration that reaches an edge, and a release past one, bounce back on a critically damped spring
     (stiffness 100, mass 1); a box with mandatory scroll snapping pages instead (a throw moves one stop its way, else the
     nearest), its snapping held off while the motion runs;
   - a press on a box still moving stops it, and is not a tap (UIScrollView catching its deceleration);
   - at its edge the way a drag goes, a box lets the app's own pan claim it first (a demo card's close pulled down at a
     list's top, the app's iOS hand-off), and takes it only if none does;
   - a drag that leaves the phone's screen lifts at its edge, at the speed it left with: outside the frame the page
     takes the moves and the release (a frame's pointer is not captured across it);
   - no text selection or image drag begins under a press in a scroller (its mousedown's default is prevented: a tap on
     a button there leaves the focus where it is, as on the iPhone).
   The wheel and the trackpad's two-finger scroll are the browser's, unchanged (a wheel on a box this moves stops its
   deceleration); a finger is the browser's too. */
(function () {
  if (window.parent === window) return;
  const SLOP = 10, RATE = 0.998, LN = Math.log(RATE), BAND = 0.55, OMEGA = 10, PAGE_OMEGA = 2 * Math.PI / 0.4;
  const FLICK = 0.5, VELOCITY_MS = 80, REST_MS = 50;
  const rect = Element.prototype.getBoundingClientRect;
  const FIELD = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],label';
  const axes = (el, cs) => {
    const x = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const y = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    return { x, y };
  };
  // The scrollers a press at `path` (its composed path) may drag, innermost first, each with the axes no claim
  // between it and the press withholds. Null when a text field takes the press.
  const scrollersAt = (path) => {
    const out = [];
    let allowX = true, allowY = true;
    for (const n of path) {
      if (!(n instanceof Element)) continue;
      if (n.matches(FIELD)) return null;
      // A host drag's handle is the drag's (its own touch-action may say nothing); a canvas only by its touch-action
      // (a drawn article is content: Scroll Progress).
      if (n.hasAttribute('data-transformdragfor')) allowX = allowY = false;
      const cs = getComputedStyle(n);
      const a = axes(n, cs);
      if ((a.x && allowX) || (a.y && allowY)) out.push({ el: n, x: a.x && allowX, y: a.y && allowY });
      const ta = cs.touchAction;
      if (ta && ta !== 'auto' && ta !== 'manipulation') {
        if (!/pan-x|pan-left|pan-right/.test(ta)) allowX = false;
        if (!/pan-y|pan-up|pan-down/.test(ta)) allowY = false;
      }
      if (!allowX && !allowY) break;
    }
    return out;
  };

  // ---- one scroller's motion: its offset on each axis, the overscroll as its children's translate ----
  const motions = new Map();
  const motionOf = (el) => {
    let m = motions.get(el);
    if (m) return m;
    m = { el, raf: 0, band: null, over: [0, 0], snap: null, held: false, axes: [false, false], wrote: [offset(el, 0), offset(el, 1)] };
    motions.set(el, m);
    return m;
  };
  const max = (el, i) => (i ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth);
  const offset = (el, i) => (i ? el.scrollTop : el.scrollLeft);
  const setOffset = (el, i, at) => {
    at = Math.min(Math.max(at, 0), Math.max(0, max(el, i)));
    if (Math.abs(offset(el, i) - at) >= 0.01) { if (i) el.scrollTop = at; else el.scrollLeft = at; }
    const m = motions.get(el);
    if (m) m.wrote[i] = offset(el, i);
  };
  const band = (d, size) => (1 - 1 / (Math.abs(d) * BAND / size + 1)) * size * Math.sign(d);
  const unband = (b, size) => size / BAND * (1 / (1 - Math.min(Math.abs(b), size * 0.99) / size) - 1) * Math.sign(b);
  // The overscroll drawn: the children shifted by -over (content past the top shows below it), added to whatever
  // translate they have, by a paused linear animation spanning +-R px, R the box's larger side.
  const drawOver = (m, ox, oy) => {
    m.over = [ox, oy];
    const none = Math.abs(ox) < 0.01 && Math.abs(oy) < 0.01;
    if (none && !m.band) return;
    if (!m.band) {
      const R = Math.max(m.el.clientWidth, m.el.clientHeight, 1) * 2;
      m.band = { R, anims: [], promoted: [] };
      for (const c of m.el.children) {
        // Each child its own layer while it is shifted (one style write per gesture, not per frame): the shift is then a
        // compositor transform, no repaint of the box's content.
        const was = c.style.getPropertyValue('will-change'), set = was ? `${was}, translate` : 'translate';
        if (!/\btranslate\b|\btransform\b/.test(was)) { c.style.setProperty('will-change', set); m.band.promoted.push([c, was, set]); }
        try {
          m.band.anims.push([
            c.animate([{ translate: `${R}px 0` }, { translate: `${-R}px 0` }], { duration: 2 * R, fill: 'both', easing: 'linear', composite: 'add' }),
            c.animate([{ translate: `0 ${R}px` }, { translate: `0 ${-R}px` }], { duration: 2 * R, fill: 'both', easing: 'linear', composite: 'add' }),
          ]);
        } catch {}
      }
      for (const [a, b] of m.band.anims) { a.pause(); b.pause(); }
    }
    const R = m.band.R;
    for (const [a, b] of m.band.anims) { a.currentTime = R + Math.max(-R, Math.min(R, ox)); b.currentTime = R + Math.max(-R, Math.min(R, oy)); }
    if (none) {
      for (const [a, b] of m.band.anims) { a.cancel(); b.cancel(); }
      for (const [c, was, set] of m.band.promoted) if (c.style.getPropertyValue('will-change') === set) { if (was) c.style.setProperty('will-change', was); else c.style.removeProperty('will-change'); }
      m.band = null;
    }
  };
  // Where the content is, past the edges included (an overscroll counts as its unbanded travel).
  const rawAt = (m, i) => {
    const el = m.el, size = i ? el.clientHeight : el.clientWidth, o = m.over[i];
    return o < 0 ? unband(o, size) : o > 0 ? max(el, i) + unband(o, size) : offset(el, i);
  };
  // Shows the content at raw offsets (rx, ry): the scroll position clamped, the rest banded.
  const show = (m, rx, ry) => {
    const el = m.el, r = [rx, ry], o = [0, 0];
    for (const i of [0, 1]) {
      if (r[i] == null) { o[i] = m.over[i]; continue; }
      const hi = Math.max(0, max(el, i)), size = i ? el.clientHeight : el.clientWidth;
      setOffset(el, i, r[i]);
      o[i] = r[i] < 0 ? band(r[i], size) : r[i] > hi ? band(r[i] - hi, size) : 0;
    }
    drawOver(m, o[0], o[1]);
  };
  // Mandatory snapping is held off while the content moves (a write to a snapping box snaps at once).
  const snapType = (el) => getComputedStyle(el).scrollSnapType;
  const holdSnap = (m) => {
    if (m.held) return;
    m.held = true;
    const t = snapType(m.el);
    m.snap = /mandatory/.test(t) ? { type: t, inline: m.el.style.scrollSnapType } : null;
    if (m.snap) m.el.style.scrollSnapType = 'none';
  };
  const releaseSnap = (m) => {
    if (!m.held) return;
    m.held = false;
    if (m.snap) { m.el.style.scrollSnapType = m.snap.inline; m.snap = null; }
  };
  // The snap stops of a mandatory snapping box on axis i, from its children and grandchildren.
  const stops = (m, i) => {
    const el = m.el, er = rect.call(el), k = i ? er.height / (el.offsetHeight || 1) : er.width / (el.offsetWidth || 1);
    const out = new Set([0, Math.max(0, max(el, i))]);
    const visit = (n, depth) => {
      for (const c of n.children) {
        const al = getComputedStyle(c).scrollSnapAlign.split(' ');
        const a = (al.length > 1 ? (i ? al[0] : al[1]) : al[0]) || 'none';
        if (a !== 'none') {
          const r = rect.call(c), start = ((i ? r.top - er.top : r.left - er.left) / (k || 1)) + offset(el, i), len = (i ? r.height : r.width) / (k || 1), vp = i ? el.clientHeight : el.clientWidth;
          const s = a === 'center' ? start + len / 2 - vp / 2 : a === 'end' ? start + len - vp : start;
          out.add(Math.min(Math.max(0, Math.round(s)), Math.max(0, max(el, i))));
        }
        if (depth < 1) visit(c, depth + 1);
      }
    };
    visit(el, 0);
    return [...out].sort((a, b) => a - b);
  };
  const stop = (m) => { if (m.raf) { cancelAnimationFrame(m.raf); m.raf = 0; } };
  const finish = (m) => {
    stop(m);
    drawOver(m, 0, 0);
    releaseSnap(m);
    motions.delete(m.el);
    quiet.delete(m.el);
    try { m.el.dispatchEvent(new Event('scrollend')); } catch {}
  };
  // The release: per axis a deceleration (bouncing at an edge), a bounce back from past an edge, or a page.
  // Velocities are px of content per ms, positive toward the end.
  const fling = (m, v) => {
    stop(m);
    const el = m.el, t0 = performance.now(), runs = [null, null];
    for (const i of [0, 1]) {
      if (!m.axes[i]) continue;
      const hi = Math.max(0, max(el, i)), p0 = rawAt(m, i), v0 = v[i], size = i ? el.clientHeight : el.clientWidth;
      const snapping = m.snap && (/both/.test(m.snap.type) || (i ? /\by\b|block/.test(m.snap.type) : /\bx\b|inline/.test(m.snap.type)));
      if (snapping) {
        const s = stops(m, i);
        const fwd = s.find((q) => q > p0 + 0.5), back = [...s].reverse().find((q) => q < p0 - 0.5);
        const near = s.reduce((a, b) => (Math.abs(b - p0) < Math.abs(a - p0) ? b : a), s[0]);
        const to = v0 > FLICK && fwd != null ? fwd : v0 < -FLICK && back != null ? back : near;
        runs[i] = { kind: 'page', from: 0, to, x0: p0 - to, v0, om: PAGE_OMEGA, size, hi };
      } else if (p0 < 0 || p0 > hi) {
        // Released past an edge: the drawn overscroll springs back, its velocity the band's slope times the finger's.
        const edge = p0 < 0 ? 0 : hi, d = Math.abs(p0 - edge), slope = 1 / (d * BAND / size + 1) ** 2;
        runs[i] = { kind: 'bounce', from: 0, edge, x0: band(p0 - edge, size), v0: v0 * slope, om: OMEGA };
      } else runs[i] = { kind: 'decay', from: 0, p0, v0, hi };
    }
    // A critically damped spring from x0 at v0 (px, px/ms) after t ms: its offset and velocity (px/ms).
    const spring = (a, t) => {
      const s = t / 1000, B = a.v0 * 1000 + a.om * a.x0, e = Math.exp(-a.om * s);
      return [(a.x0 + B * s) * e, (a.v0 * 1000 - a.om * B * s) * e / 1000];
    };
    const tick = (now) => {
      // Someone else moved the box meanwhile (the app's own scroll to a row, a wheel): the motion gives way.
      if ([0, 1].some((i) => runs[i] && Math.abs(offset(el, i) - m.wrote[i]) > 1)) { m.raf = 0; finish(m); return; }
      let moving = false;
      const o = [...m.over];
      for (const i of [0, 1]) {
        let a = runs[i];
        if (!a) continue;
        const t = Math.max(0, now - t0 - a.from);
        if (a.kind === 'decay') {
          const p = a.p0 + a.v0 * (RATE ** t - 1) / LN;
          if (p >= 0 && p <= a.hi) {
            const rest = Math.abs(a.v0 * RATE ** t / LN);
            setOffset(el, i, rest > 0.25 ? p : a.p0 - a.v0 / LN);
            o[i] = 0;
            if (rest > 0.25) moving = true; else runs[i] = null;
            continue;
          }
          // The deceleration reached an edge: the rest is a bounce from it, at the speed it arrived with.
          const edge = p < 0 ? 0 : a.hi, q = 1 + (edge - a.p0) * LN / a.v0, tc = q > 0 ? Math.log(q) / LN : t;
          a = runs[i] = { kind: 'bounce', from: a.from + Math.min(tc, t), edge, x0: 0, v0: a.v0 * RATE ** Math.min(tc, t), om: OMEGA };
        }
        const [x, vx] = spring(a, Math.max(0, now - t0 - a.from));
        const done = a.kind === 'bounce' ? Math.abs(x) < 0.1 && Math.abs(vx) < 0.005 : Math.abs(x) < 0.05 && Math.abs(vx) < 0.002;
        if (a.kind === 'bounce') { setOffset(el, i, a.edge); o[i] = done ? 0 : x; }
        else {
          const r = done ? a.to : a.to + x;
          setOffset(el, i, r);
          o[i] = r < 0 ? band(r, a.size) : r > a.hi ? band(r - a.hi, a.size) : 0;
        }
        if (done) runs[i] = null; else moving = true;
      }
      drawOver(m, o[0], o[1]);
      if (moving) m.raf = requestAnimationFrame(tick); else { m.raf = 0; finish(m); }
    };
    m.raf = requestAnimationFrame(tick);
  };

  // ---- the press ----
  let press = null;
  // While this moves a box, the scrollend each write would send waits for the motion's end (one, from `finish`).
  const quiet = new Set();
  addEventListener('scrollend', (e) => { if (e.isTrusted && quiet.has(e.target)) e.stopImmediatePropagation(); }, true);
  const swallowClick = () => {
    const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, true), 400);
  };
  const cancelPress = (p, e) => {
    if (p.cancelled) return;
    p.cancelled = true;
    try { p.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: p.id, pointerType: 'mouse', isPrimary: true, bubbles: true, composed: true, clientX: e.clientX, clientY: e.clientY })); } catch {}
  };
  const screenOf = (t) => t.closest('[data-testid="web-screen"]') ?? t.getRootNode()?.host?.closest?.('[data-testid="web-screen"]') ?? null;
  addEventListener('pointerdown', (e) => {
    if (!e.isTrusted || e.pointerType !== 'mouse' || e.button !== 0 || !e.isPrimary) return;
    press = null;
    const path = e.composedPath(), target = path[0];
    const screen = target instanceof Element ? screenOf(target) : null;
    if (!screen) return;
    const found = scrollersAt(path) || [];
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, target, screen, found, active: null, taken: false, caught: null,
      samples: [], pts: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }], cancelled: false, leave: 0 };
    press = p;
    // A box still moving under the press stops where it is; the press is the scroll view's, not a tap.
    for (const s of found) {
      const m = motions.get(s.el);
      if (m?.raf) { stop(m); p.caught = m; cancelPress(p, e); swallowClick(); break; }
    }
  }, true);
  // No selection and no image drag from a press in a scroller (a finger makes neither).
  addEventListener('mousedown', (e) => { if (e.isTrusted && e.button === 0 && press?.found.length) e.preventDefault(); }, true);
  // The app took the press for one of its own pans (the launcher's pages, the pull to search, a demo card's close, a
  // demo's pan): they cancel the press under them, as this does. The pan is theirs from here.
  addEventListener('pointercancel', (e) => {
    const p = press;
    if (!e.isTrusted && p && !p.active && !p.cancelled && e.pointerId === p.id) p.taken = true;
  }, true);
  // A release the page outside the frame heard (`watchLeave`), told to the app's own trackers as a lift where the
  // pointer left (their pans, and the ones this press only armed); they hear only trusted releases and this mark
  // (tools/demos-web/patches.ts).
  const lift = (p) => {
    const q = p.pts.at(-1);
    const ev = new PointerEvent('pointerup', { pointerId: p.id, pointerType: 'mouse', isPrimary: true, bubbles: true, composed: true, clientX: q.x, clientY: q.y, button: 0, buttons: 0 });
    Object.defineProperty(ev, 'exactLifted', { value: true });
    try { dispatchEvent(ev); } catch {}
  };
  const fake = (p, type) => ({ isTrusted: true, pointerId: p.id, type, timeStamp: p.pts.at(-1).t });
  // The pointer about to leave the phone's screen: the page outside the frame takes the moves and the release (a
  // frame's pointer is not captured across it), so a pointer that does not come back within 40 ms has lifted at the
  // edge, at the speed it left with (as a finger leaving the glass).
  const watchLeave = (p, e) => {
    clearTimeout(p.leave);
    // The pointer's speed over the last 16-50 ms (one event pair can be a coalesced burst), and where it is 24 ms on.
    const q = p.pts.find((r) => e.timeStamp - r.t <= 50 && e.timeStamp - r.t >= 16), sr = rect.call(p.screen);
    if (!q) return;
    const dt = e.timeStamp - q.t, ahead = 24, nx = e.clientX + (e.clientX - q.x) / dt * ahead, ny = e.clientY + (e.clientY - q.y) / dt * ahead;
    if (nx >= sr.left && nx <= sr.right && ny >= sr.top && ny <= sr.bottom) return;
    p.leave = setTimeout(() => {
      if (press !== p) return;
      if (p.active || p.caught) up(fake(p, 'pointerup')); else press = null;
      lift(p);
    }, 40);
  };
  addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || !e.isTrusted || e.pointerId !== p.id) return;
    // Back with no button held: it was released outside the frame, unseen (see `watchLeave`).
    if (!(e.buttons & 1)) {
      if (p.active || p.caught) up(fake(p, 'pointercancel')); else { press = null; clearTimeout(p.leave); }
      lift(p);
      return;
    }
    p.pts.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (p.pts.length > 2 && e.timeStamp - p.pts[0].t > 60) p.pts.shift();
    watchLeave(p, e);
    if (p.taken) return;
    if (!p.active) {
      if (!p.found.length) return;
      const k0 = rect.call(p.screen).width / (p.screen.offsetWidth || 1) || 1;
      const dx = (e.clientX - p.x) / k0, dy = (e.clientY - p.y) / k0;
      if (Math.hypot(dx, dy) < SLOP && !p.caught) return;
      const vertical = Math.abs(dy) >= Math.abs(dx);
      const s = (p.caught && p.found.find((f) => f.el === p.caught.el)) || p.found.find((f) => (vertical ? f.y : f.x)) || p.found[0];
      const i = s.y && (vertical || !s.x) ? 1 : 0, d = i ? dy : dx;
      // At its edge the way the drag goes, the box lets an outer pan claim the drag first (the demo card's close at a
      // list's top: iOS's hand-off): this move goes on to the app's listeners, and the box takes it after them (the
      // window's bubbling listener below) unless one claimed it (its pointercancel) or stopped it.
      if (!p.caught && (d > 0 ? offset(s.el, i) <= 0 : offset(s.el, i) >= max(s.el, i) - 0.5)) { p.edge = s; return; }
      activate(p, s, e);
    }
    e.stopImmediatePropagation(); e.preventDefault();
    follow(p, e);
  }, true);
  addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || !e.isTrusted || e.pointerId !== p.id || !p.edge || p.active || p.taken) return;
    activate(p, p.edge, e);
    e.preventDefault();
    follow(p, e);
  });
  const activate = (p, s, e) => {
    const el = s.el, r = rect.call(el), k = [r.width / (el.offsetWidth || 1) || 1, r.height / (el.offsetHeight || 1) || 1];
    const m = motionOf(el);
    stop(m);
    m.axes = [s.x, s.y];
    holdSnap(m);
    quiet.add(el);
    // Tracking starts at the press, as UIKit's pan takes the slop's travel at once.
    p.active = { m, k, from: [rawAt(m, 0), rawAt(m, 1)] };
    cancelPress(p, e);
    try { getSelection()?.removeAllRanges(); } catch {}
  };
  const follow = (p, e) => {
    const a = p.active, m = a.m;
    const rx = m.axes[0] ? a.from[0] - (e.clientX - p.x) / a.k[0] : null;
    const ry = m.axes[1] ? a.from[1] - (e.clientY - p.y) / a.k[1] : null;
    show(m, rx, ry);
    p.samples.push({ t: e.timeStamp, x: rx ?? 0, y: ry ?? 0 });
    while (p.samples.length > 2 && e.timeStamp - p.samples[0].t > 150) p.samples.shift();
  };
  const up = (e) => {
    const p = press;
    if (!p || !e.isTrusted || e.pointerId !== p.id) return;
    press = null;
    clearTimeout(p.leave);
    if (!p.active && !p.caught) return;
    // The release goes on to every listener (the app's trackers end on it: they saw this press go down, and its
    // cancel); only its click is dropped.
    if (!p.cancelled) cancelPress(p, e);
    swallowClick();
    // A caught box released without a drag settles from where it stopped (a bounce or a page finishes).
    const m = p.active?.m ?? p.caught;
    // The release velocity in px/ms of content: the samples of the last 80 ms, none if the pointer rested.
    let v = [0, 0];
    const s = p.samples.filter((q) => e.timeStamp - q.t <= VELOCITY_MS);
    if (e.type === 'pointerup' && s.length >= 2 && e.timeStamp - s.at(-1).t <= REST_MS) {
      const a = s[0], b = s.at(-1), dt = b.t - a.t;
      if (dt > 0) v = [(b.x - a.x) / dt, (b.y - a.y) / dt];
    }
    fling(m, v);
  };
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', (e) => { if (e.isTrusted) up(e); }, true);
  // A wheel on a box this moves: the hand is on it again, the deceleration stops (a bounce runs out).
  addEventListener('wheel', (e) => {
    if (!motions.size || !e.isTrusted) return;
    for (const n of e.composedPath()) { const m = n instanceof Element && motions.get(n); if (m?.raf && !m.over[0] && !m.over[1]) { finish(m); break; } }
  }, { capture: true, passive: true });
})();
