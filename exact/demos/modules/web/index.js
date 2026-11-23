// The app's native views on the web (modules/apple/*.swift are the iPhone's). The host defines each roster tag
// and hands `create` the element; each view draws into its shadow root. Props arrive as strings, as on iOS,
// and the events are the same: press 0, change 1, message 8. The launcher's own views (icon-grid, page-dots,
// still-art, search-reveal, demo-card, inspiration-sheet) are drawn in Contract on the web (home/web-phone.contract).
export const abi = 1;
const tags = [
  'rolling-count', 'demo-card', 'glass-button', 'mate-haptic', 'swift-slider', 'painting-menu', 'variable-blur',
  'glass-pane', 'inspiration-sheet', 'audio-track', 'system-alert', 'toggle-sheet', 'music-tabbar', 'native-tabbar',
  'page-dots', 'search-reveal', 'still-art', 'icon-grid', 'motion-feed', 'home-shake',
];
export const roster = Object.fromEntries(tags.map((t) => [t, { snapshot: false }]));

// The build imports this module in Bun to read `roster` (no DOM there): what touches the page runs only in one.
const DOM = typeof document !== 'undefined';
const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };
// The CSS family of a bundled font (assets/fonts/<name>.ttf|otf): the host declares each face as
// `ExactPlanStack<i>` with the file as its src, so a PostScript name finds it by the file's name.
const faces = new Map();
const bundledFace = (name) => {
  if (faces.has(name)) return faces.get(name);
  let found = null;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule && r.style.getPropertyValue('src').includes(`fonts/${name}.`)) {
        found = r.style.getPropertyValue('font-family').replace(/["']/g, '');
        break;
      }
    }
    if (found) break;
  }
  if (found) faces.set(name, found);
  return found;
};
const base = ':host{display:block;position:relative;box-sizing:border-box}*{box-sizing:border-box}';
const shadow = (el, css) => {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = base + css;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0';
  root.replaceChildren(style, box);
  return box;
};
const SYMBOLS = {
  xmark: '<path d="M5 5L15 15M15 5L5 15" stroke-linecap="round"/>',
  checkmark: '<path d="M4 10.5L8.2 14.5L16 5.5" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M10 4V16M4 10H16" stroke-linecap="round"/>',
  info: '<circle cx="10" cy="5.2" r="1.2" fill="currentColor" stroke="none"/><path d="M10 8.6V15" stroke-linecap="round"/>',
  'chevron.backward': '<path d="M12 4L6 10L12 16" stroke-linecap="round" stroke-linejoin="round"/>',
  ellipsis: '<circle cx="4" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
  'house.fill': '<path d="M3 10L10 3.5L17 10V16.5H12.2V12H7.8V16.5H3Z" fill="currentColor" stroke="none"/>',
  'square.grid.2x2.fill': '<rect x="3" y="3" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="11" y="3" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="3" y="11" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="11" y="11" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/>',
  'dot.radiowaves.left.and.right': '<circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none"/><path d="M6.6 6.6A4.8 4.8 0 0 0 6.6 13.4M13.4 6.6A4.8 4.8 0 0 1 13.4 13.4M4.2 4.2A8.2 8.2 0 0 0 4.2 15.8M15.8 4.2A8.2 8.2 0 0 1 15.8 15.8" stroke-linecap="round"/>',
  'music.note.square.stack.fill': '<rect x="3" y="3" width="14" height="14" rx="3.4" fill="currentColor" stroke="none"/><path d="M8 13.4V7.6L13 6.6V12" stroke="#000" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>',
};
const icon = (name, size = 20, width = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${width}">${SYMBOLS[name] ?? '<circle cx="10" cy="10" r="6"/>'}</svg>`;

// An overlay in the page above the demo, where a sheet or a menu opens: the screen's own rectangle (the frame's
// display, scaled as it is) on a desktop, the whole page elsewhere. It lives outside the runtime's tree.
function overlay(el) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483000;overflow:hidden;transform-origin:0 0;pointer-events:none';
  const place = () => {
    const device = document.querySelector('[data-testid="web-device"]');
    if (device) {
      const r = device.getBoundingClientRect(), s = r.width / 420;
      host.style.cssText += `;left:${r.left}px;top:${r.top}px;width:420px;height:912px;transform:scale(${s});border-radius:62px`;
    } else host.style.cssText += ';left:0;top:0;width:100vw;height:100vh;transform:none;border-radius:0';
  };
  place();
  document.body.append(host);
  addEventListener('resize', place);
  return { host, close() { removeEventListener('resize', place); host.remove(); } };
}
const GLASS = 'background:rgba(40,40,44,.55);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);box-shadow:0 4px 14px rgba(0,0,0,.22),inset 0 0 0 .5px rgba(255,255,255,.22)';


// ---- GPU canvases composite with alpha, as on the iPhone -----------------------------------------------------------
// wgpu's WebGPU backend lists only `opaque` among a canvas's alpha modes (wgpu 29, backend/webgpu.rs), so every Exact
// canvas on the web was configured opaque: a surface that clears to transparent over the page (sudoku's confetti, any
// overlay canvas) painted black over everything under it. On the iPhone a non-opaque surface's CAMetalLayer is
// composited with its alpha (premultiplied). Every canvas here is configured `premultiplied`: a surface that is opaque
// writes alpha 1 everywhere (Surface::opaque's contract), so it looks the same.
if (typeof GPUCanvasContext === 'function' && !GPUCanvasContext.prototype.configure.demosAlpha) {
  const configure = GPUCanvasContext.prototype.configure;
  const blended = function (config) { return configure.call(this, config && config.alphaMode !== 'premultiplied' ? { ...config, alphaMode: 'premultiplied' } : config); };
  blended.demosAlpha = true;
  GPUCanvasContext.prototype.configure = blended;
}

// ---- Haptics: the phone's motor where the browser has one (Android's `navigator.vibrate`; iOS Safari has none) ----
// The iOS feedback generators as pulse lengths (gpu/src/haptic.rs's kinds): selection 5 ms, light 8, medium 12, heavy
// 18, the notifications two or three pulses. A buzz within 150 ms of the last is dropped unless stronger, as a drag's
// ticks would otherwise each cut the one before short. Contract's `haptic()` reaches the runtime's own vibrate(5 | 12)
// (host/web-js/commands.js), paced here too; a surface's `haptic:<kind>` messages (kept as kinds in the web's GPU
// module) are played here and never reach the app, as the iPhone's host consumes them.
const HAPTIC = {
  selection: 5, tick: 5, 'impact-light': 8, grab: 8, 'impact-soft': 8, release: 8, 'impact-medium': 12, impact: 12,
  'impact-rigid': 12, limit: 12, 'impact-heavy': 18, success: [8, 70, 14], warning: [14, 90, 8], error: [12, 50, 12, 80, 16],
};
const vibrate = typeof navigator.vibrate === 'function' ? navigator.vibrate.bind(navigator) : null;
// A stronger buzz within the 150 ms still plays (it cuts the weaker one short): a press's selection tick then the
// action's own feedback (dot-sheet's send: selection, then success) keeps the second, as the iPhone plays both.
let lastBuzz = -1e9, lastStrength = 0;
const strength = (p) => (Array.isArray(p) ? p.reduce((a, b, i) => a + (i % 2 ? 0 : b), 0) : Number(p) || 0);
const paced = (pattern) => {
  const now = performance.now(), k = strength(pattern);
  if (now - lastBuzz < 150 && k <= lastStrength) return true;
  lastBuzz = now; lastStrength = k;
  return vibrate(pattern);
};
const haptics = {
  play(kind) { const pattern = HAPTIC[kind]; if (pattern !== undefined && vibrate) paced(pattern); return pattern !== undefined; },
};
if (vibrate) {
  // A stop (0) and a long pattern (the checkmate's crescendo) pass as they are.
  navigator.vibrate = (pattern) => (pattern === 0 || (Array.isArray(pattern) && pattern.length > 5) ? vibrate(pattern) : paced(pattern));
}
let messageTries = 0;
const hookMessages = () => {
  const ex = globalThis.exact;
  if (typeof ex?.message !== 'function') { if (++messageTries < 1200) setTimeout(hookMessages, 50); return; }
  if (ex.message.demosHaptics) return;
  const pass = ex.message;
  const message = function (host, text) {
    if (typeof text === 'string' && text.startsWith('haptic:') && haptics.play(text.slice(7))) return;
    return pass.call(this, host, text);
  };
  message.demosHaptics = true;
  ex.message = message;
};
if (DOM) hookMessages();

// The trackpad's wheel-to-touches handler (below). It listens on the launch card only (demo-card's `install`), never
// on the window: a blocking wheel listener on the window made every wheel on the page (the home pager's trackpad
// swipes, a demo's own scrollers) wait for the main thread before the compositor could scroll.
let trackpadWheel = null;

// ---- A demo's canvases are sized in the screen's points, whatever scales the screen ------------------------------
// The web host sizes a GPU canvas (and its world's layout) from getBoundingClientRect, which includes every transform
// above it: the frame's scale on a desktop (a 420 pt screen shown at 0.9 laid the surface out 378 pt wide) and, worse,
// the launch card's, which is the icon's size when the demo mounts. A surface sized then kept that size, as a transform
// fires no ResizeObserver: the-little-prince's page stayed laid out ~60 pt wide and zoomed up, a stuck blurry still,
// after an open from its icon. On the iPhone a surface is laid out at the screen's size and the launch scales it.
// Here a canvas in the card (or a GPU input host) reports its layout size (offsetWidth / offsetHeight) at its on-page
// corner, and a pointer event delivered to it carries clientX / clientY mapped back by the same scale, so a point
// on the canvas is in the same points as its size (the host reads it as clientX - rect.left).
if (DOM) {
  // A surface's host is its canvas, or the node whose own child the canvas is (gpu-glue.js `surface`): the host's size
  // makes the canvas at creation (the scaled one made a wrongly sized backing store and targets, resized next frame).
  const gpuBox = (e) => (e.localName === 'canvas' || e.hasAttribute?.('data-gpu-input') || (e.nodeType === 1 && e.querySelector(':scope > canvas[data-surface]'))) && e.closest('[data-testid="web-card"]');
  const rect = Element.prototype.getBoundingClientRect;
  const scaleOf = (e, r) => {
    const w = e.offsetWidth, h = e.offsetHeight;
    if (!(w > 0 && h > 0) || (Math.abs(r.width - w) < 0.01 && Math.abs(r.height - h) < 0.01)) return null;
    return { w, h, kx: r.width / w, ky: r.height / h };
  };
  Element.prototype.getBoundingClientRect = function () {
    const r = rect.call(this);
    if (!gpuBox(this)) return r;
    const k = scaleOf(this, r);
    return k ? new DOMRect(r.left, r.top, k.w, k.h) : r;
  };
  const POINTER = /^(pointer|mouse|click|dblclick|auxclick|contextmenu|wheel|lostpointercapture|gotpointercapture)/;
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const wraps = new WeakMap();
  const wrap = (fn) => {
    let w = wraps.get(fn);
    if (w) return w;
    w = function (event) {
      const handle = typeof fn === 'function' ? (ev) => fn.call(this, ev) : (ev) => fn.handleEvent(ev);
      if (!gpuBox(this) || typeof event.clientX !== 'number') return handle(event);
      const r = rect.call(this), k = scaleOf(this, r);
      if (!k) return handle(event);
      const x = r.left + (event.clientX - r.left) / k.kx, y = r.top + (event.clientY - r.top) / k.ky;
      return handle(new Proxy(event, {
        get(t, p) {
          if (p === 'clientX' || p === 'x' || p === 'pageX') return x;
          if (p === 'clientY' || p === 'y' || p === 'pageY') return y;
          const v = Reflect.get(t, p, t);
          return typeof v === 'function' ? v.bind(t) : v;
        },
      }));
    };
    wraps.set(fn, w);
    return w;
  };
  const wrapped = (target, type, fn) => fn && target instanceof Element && (target.localName === 'canvas' || target.hasAttribute('data-gpu-input')) && POINTER.test(type);
  EventTarget.prototype.addEventListener = function (type, fn, options) { return add.call(this, type, wrapped(this, type, fn) ? wrap(fn) : fn, options); };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    if (wrapped(this, type, fn) && wraps.has(fn)) remove.call(this, type, wraps.get(fn), options);
    return remove.call(this, type, fn, options);
  };

  // A trackpad drives a demo as fingers would (the iPhone has no wheel): over anything in a demo that claims touches
  // (a computed touch-action other than auto: a GPU canvas, a Contract pan, a host drag), a pinch (a wheel with ctrl
  // set, as Chrome and Safari deliver it) is two touches spreading about the pointer, 50 pt either side, by Chrome's
  // step (deltaY is -100 x ln of the scale step), and a two-finger scroll is one touch dragging with the content
  // (deltaY > 0 moves it up). The touches lift once the wheel has been still for 120 ms, so the release (its
  // velocity, a snap) is the touch's; a scroll that travelled under 10 pt is cancelled, not lifted, so it is never a
  // tap. A scroller under the pointer that can scroll the wheel's way keeps it (the browser scrolls it), as does an
  // axis the claim leaves to the browser (pan-x / pan-y). The touches are dispatched on the element under the
  // pointer, untrusted (the demo card's close pan ignores them; capturing them is a no-op), and the wrapper above
  // maps their points on a canvas. A real touch down holds them off.
  const LIFT_MS = 120, SLOP = 10, HALF = 50, FIRST_ID = 0x7f000000;
  const synthetic = (id) => id >= FIRST_ID && id < FIRST_ID + 0x1000000;
  for (const name of ['setPointerCapture', 'releasePointerCapture']) {
    const f = Element.prototype[name];
    Element.prototype[name] = function (id) { if (!synthetic(id)) return f.call(this, id); };
  }
  const real = new Set();
  add.call(window, 'pointerdown', (e) => { if (e.isTrusted && e.pointerType === 'touch') real.add(e.pointerId); }, true);
  for (const t of ['pointerup', 'pointercancel']) add.call(window, t, (e) => { if (e.isTrusted) real.delete(e.pointerId); }, true);
  let held = null, ids = FIRST_ID;
  const fire = (s, type, i, [x, y]) => {
    const lifted = type === 'pointerup' || type === 'pointercancel';
    try { s.el.dispatchEvent(new PointerEvent(type, { pointerId: s.ids[i], pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons: lifted ? 0 : 1, pressure: lifted ? 0 : 0.5, width: 1, height: 1 })); } catch {}
  };
  const points = (s) => s.pinch ? [[s.c[0] - s.half, s.c[1]], [s.c[0] + s.half, s.c[1]]] : [s.at];
  const lift = () => {
    const s = held;
    if (!s) return;
    held = null; clearTimeout(s.timer);
    const type = s.pinch || s.travel >= SLOP ? 'pointerup' : 'pointercancel';
    const p = points(s);
    for (let i = p.length - 1; i >= 0; i--) fire(s, type, i, p[i]);
  };
  // What a wheel over `t` in `card` drives: the element claiming touches, or null (the browser keeps the wheel).
  const claimant = (t, card, dx, dy, pinch) => {
    const across = Math.abs(dx) > Math.abs(dy);
    for (let n = t; n && n !== card.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!pinch && n !== card) {
        const ox = cs.overflowX, oy = cs.overflowY;
        if (across && (ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return null;
        if (!across && (oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return null;
      }
      const ta = cs.touchAction;
      if (ta && ta !== 'auto') {
        if (!pinch && ((across && /pan-x/.test(ta)) || (!across && /pan-y/.test(ta)) || ta === 'manipulation')) return null;
        if (pinch && /pinch-zoom|manipulation/.test(ta)) return null;
        return n;
      }
    }
    return null;
  };
  trackpadWheel = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // A held gesture keeps the wheel until it lifts, whatever moved under the pointer (the content follows it).
    if (held && held.el.isConnected && e.ctrlKey === held.pinch) {
      e.preventDefault(); e.stopImmediatePropagation();
      return step(held, e);
    }
    const card = t.closest('[data-testid="web-card"]');
    if (!card || t.closest('input,textarea,select,[contenteditable]')) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? card.clientHeight : 1;
    const host = claimant(t, card, e.deltaX * unit, e.deltaY * unit, e.ctrlKey);
    if (!host) return;
    e.preventDefault(); e.stopImmediatePropagation();
    lift();
    if (real.size) return;
    const r = rect.call(host), k = host.offsetWidth > 0 ? r.width / host.offsetWidth : 1;
    held = { el: t, pinch: e.ctrlKey, k, c: [e.clientX, e.clientY], at: [e.clientX, e.clientY], half: HALF * k, travel: 0, timer: 0, ids: e.ctrlKey ? [++ids, ++ids] : [++ids] };
    points(held).forEach((p, i) => fire(held, 'pointerdown', i, p));
    step(held, e);
  };
  const step = (s, e) => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (s.pinch) s.half = Math.min(4000 * s.k, Math.max(s.k, s.half * Math.exp(-dy / 100)));
    else { s.at = [s.at[0] - dx, s.at[1] - dy]; s.travel = Math.max(s.travel, Math.hypot(s.at[0] - s.c[0], s.at[1] - s.c[1]) / s.k); }
    points(s).forEach((p, i) => fire(s, 'pointermove', i, p));
    clearTimeout(s.timer);
    s.timer = setTimeout(lift, LIFT_MS);
  };
}

// ---- A transform drag works in the scaled desktop frame ---------------------------------------------------------
// The host's transform drag (`transformDragFor`: expandable-mini-player's sheet, the toasts, the bottom sheets) admits
// a target only on an untransformed path (motion-glue.js `transformSnapshot`: every ancestor's scale 1, the target's
// box centred on its clip's by its translate in client pixels). The desktop frame scales the screen to the window
// (web-phone.contract, `scale=s`), so on a desktop no transform drag ever began: the sheet ignored a mouse. The drag
// is the screen's points, as on the iPhone: for the drag's target and clip, getBoundingClientRect answers in the
// unscaled screen (anchored at the display's corner), a pointer event on a handle carries its point mapped the same
// way, and the frame's own scale reads 1. The finger and the sheet move together; a phone browser (no frame) is
// untouched.
if (DOM) {
  let dirty = true, frames = new Set(), boxes = new Set();
  const refresh = () => {
    if (!dirty) return;
    dirty = false;
    frames = new Set([...document.querySelectorAll('[data-testid="web-device"]')].map((d) => d.parentElement));
    boxes = new Set();
    for (const h of document.querySelectorAll('[data-transformdragfor]')) {
      const t = document.getElementById(h.getAttribute('data-transformdragfor'));
      if (t) { boxes.add(t); if (t.parentElement) boxes.add(t.parentElement); }
    }
  };
  new MutationObserver(() => { dirty = true; }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-transformdragfor', 'id', 'data-testid'] });
  const rect = Element.prototype.getBoundingClientRect;
  // The corner and scale of the display holding `el`, or null when it is not scaled.
  const mapping = (el) => {
    const device = el.closest('[data-testid="web-device"]');
    if (!device || !(device.offsetWidth > 0)) return null;
    const r = rect.call(device), s = r.width / device.offsetWidth;
    return Math.abs(s - 1) < 1e-6 ? null : { x: r.left, y: r.top, s };
  };
  Element.prototype.getBoundingClientRect = function () {
    const r = rect.call(this);
    if (dirty) refresh();
    if (!boxes.has(this)) return r;
    const m = mapping(this);
    return m ? new DOMRect(m.x + (r.left - m.x) / m.s, m.y + (r.top - m.y) / m.s, r.width / m.s, r.height / m.s) : r;
  };
  const computed = window.getComputedStyle;
  window.getComputedStyle = function (el, pseudo) {
    const cs = computed.call(this, el, pseudo);
    if (dirty) refresh();
    if (pseudo || !frames.has(el)) return cs;
    return new Proxy(cs, {
      get(t, p) {
        if (p === 'scale') return 'none';
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? (p === 'getPropertyValue' ? (n) => (n === 'scale' ? 'none' : t.getPropertyValue(n)) : v.bind(t)) : v;
      },
    });
  };
  const POINTER = /^(pointer|lostpointercapture|gotpointercapture)/;
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const wraps = new WeakMap();
  const wrap = (fn) => {
    let w = wraps.get(fn);
    if (w) return w;
    w = function (event) {
      const handle = typeof fn === 'function' ? (ev) => fn.call(this, ev) : (ev) => fn.handleEvent(ev);
      const m = typeof event.clientX === 'number' ? mapping(this) : null;
      if (!m) return handle(event);
      const x = m.x + (event.clientX - m.x) / m.s, y = m.y + (event.clientY - m.y) / m.s;
      return handle(new Proxy(event, {
        get(t, p) {
          if (p === 'clientX' || p === 'x' || p === 'pageX') return x;
          if (p === 'clientY' || p === 'y' || p === 'pageY') return y;
          const v = Reflect.get(t, p, t);
          return typeof v === 'function' ? v.bind(t) : v;
        },
      }));
    };
    wraps.set(fn, w);
    return w;
  };
  // A mouse that dragged a handle still clicks it (the pointer is captured, so the press and the release land on the
  // same node), and the handle's own press ran: the mini player's sheet, dragged down past the middle, closed and at
  // once reopened on its `press=expand`. A finger's drag makes no click, nor does a pan on the iPhone: a click after
  // the mouse travelled past the slop (10 pt) on a handle is dropped before any listener hears it.
  let down = null;
  add.call(window, 'pointerdown', (e) => { down = e.pointerType === 'mouse' ? [e.clientX, e.clientY] : null; }, true);
  add.call(window, 'click', (e) => {
    const from = down;
    down = null;
    if (!from || !(e.target instanceof Element) || !e.target.closest('[data-transformdragfor]')) return;
    if (Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 10) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  const wrapped = (target, type, fn) => fn && target instanceof Element && POINTER.test(type) && target.hasAttribute('data-transformdragfor');
  EventTarget.prototype.addEventListener = function (type, fn, options) { return add.call(this, type, wrapped(this, type, fn) ? wrap(fn) : fn, options); };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    if (wrapped(this, type, fn) && wraps.has(fn)) remove.call(this, type, wraps.get(fn), options);
    return remove.call(this, type, fn, options);
  };
}

// ---- A tap keeps the keyboard where it is ----------------------------------------------------------------------
// On the iPhone a tap on a button (or anywhere that is not a text field) leaves the first responder alone: the
// keyboard stays up and the field keeps its text. A browser moves focus on mousedown, so a tap on a demo's send
// button blurred its field first: dot-sheet's arrow closed the sheet (the field's blur) before its press could
// submit. While a text field in a demo has focus, a press on anything but another field does not take it.
if (DOM) {
  addEventListener('mousedown', (e) => {
    const a = document.activeElement, t = e.target;
    if (!(t instanceof Element) || !a?.matches?.('input,textarea,[contenteditable=""],[contenteditable="true"]')) return;
    if (!t.closest('[data-testid="web-card"]') || t.closest('input,textarea,select,[contenteditable]')) return;
    e.preventDefault();
  }, true);
}

// ---- A touch screen has no hover --------------------------------------------------------------------------------
// The web host washes any pressable a mouse is over (`--exact-hover-wash`, the bordered / gray buttons' quaternary
// fill): a grey square stayed behind a demo's button wherever the pointer rested on the desktop frame (sculptures-in-
// words' toggle after a click), and iOS Safari keeps :hover on the last element tapped. The iPhone draws none.
// The host's :hover rules are taken out of its sheets (they are many, several behind `:has(...:hover)`, so every move
// of a mouse over the launcher re-matched styles up the tree); the variables cover a sheet added later.
if (DOM) {
  const sheet = document.createElement('style');
  sheet.textContent = '#exact-root#exact-root :is(button,a[data-view][href],[data-exact-on~="press"]){--exact-hover-wash:none;--exact-hover-dim:1}#exact-root#exact-root button[data-button-style]:hover{background-image:none!important}';
  document.head.append(sheet);
  const seen = new WeakSet();
  const strip = () => {
    for (const s of document.styleSheets) {
      if (seen.has(s) || s.ownerNode === sheet) continue;
      let rules;
      try { rules = s.cssRules; } catch { continue; }
      seen.add(s);
      const walk = (list, owner) => { for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i];
        if (r.selectorText && r.selectorText.includes(':hover')) { try { owner.deleteRule(i); } catch {} }
        else if (r.cssRules?.length) walk(r.cssRules, r);
      } };
      walk(rules, s);
    }
  };
  strip();
  new MutationObserver(strip).observe(document.head, { childList: true });
  addEventListener('load', strip);
}

// Classic scrollbars: where the system draws scrollbars that take room (a desktop with a mouse, Windows, Linux,
// headless Chrome), every scroller in a demo lost 15 px of its width to a grey bar the iPhone never shows (add-to-cart's
// cards ended 15 px short of the frame's edge). Hidden there; overlay scrollbars (a Mac trackpad, phone browsers),
// which take no room and show only while scrolling as the iPhone's indicator does, are kept.
if (DOM) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  document.documentElement.append(probe);
  const classic = probe.offsetWidth - probe.clientWidth > 0;
  probe.remove();
  if (classic) {
    const sheet = document.createElement('style');
    sheet.textContent = '#exact-root *{scrollbar-width:none}#exact-root ::-webkit-scrollbar{display:none}';
    document.head.append(sheet);
  }
}

// Named scroll timelines (`scroll-timeline="--name y"` on a scroller, `animation-timeline="--name"` on views outside it
// under a `timeline-scope`): the host writes them as `--exact-scroll-timeline` / `--exact-animation-timeline` and its
// motion glue hands a name the browser runs to CSS only when it follows a drag timeline, which a page with no drag never
// does, so the consumers stayed paused at their start (animated-indicator-list's header and bar never moved). Hand them
// over here, as the glue would: the name as `animation-timeline`, the animations running. Only names a scroller in the
// page declares; a drag timeline stays the glue's.
if (DOM && typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'scroll()')) {
  let queued = false;
  const hand = () => {
    queued = false;
    const names = new Set([...document.querySelectorAll('[style*="--exact-scroll-timeline"]')]
      .map((e) => e.style.getPropertyValue('--exact-scroll-timeline').trim().split(/\s+/)[0]).filter((n) => n.startsWith('--')));
    if (!names.size) return;
    for (const el of document.querySelectorAll('[style*="--exact-animation-timeline"]')) {
      const name = el.style.getPropertyValue('--exact-animation-timeline').trim();
      if (!names.has(name) || el.style.getPropertyValue('animation-timeline').trim() === name) continue;
      el.style.setProperty('animation-timeline', name);
      el.style.setProperty('animation-play-state', 'running');
    }
  };
  // Only mutations that touch a consumer or a scroller wake it: a flight's or a drag's style writes do not.
  const KEY = '-exact-animation-timeline', SRC = '-exact-scroll-timeline';
  const relevant = (n) => n.nodeType === 1 && (n.getAttribute('style')?.includes(KEY) || n.getAttribute('style')?.includes(SRC)
    || n.querySelector?.(`[style*="${KEY}"],[style*="${SRC}"]`));
  new MutationObserver((records) => {
    if (queued) return;
    for (const r of records) {
      if (r.type === 'attributes' ? (r.target.getAttribute('style')?.includes(KEY) || r.target.getAttribute('style')?.includes(SRC))
        : [...r.addedNodes].some(relevant)) { queued = true; requestAnimationFrame(hand); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  // This module can load after a demo opened by its link has mounted: look once now.
  queued = true;
  requestAnimationFrame(hand);
}

// ---- SF Symbols the web host's table lacks ----------------------------------------------------------------------
// The host draws `symbol:sf/<name>` from its own subset of paths; a name outside it is an empty image. Each one a demo
// uses is drawn here at the symbol's semibold box in ems of its point size (as the iPhone sizes it): textformat ("Aa",
// 1.45 x 0.906 em: 20 x 12.5 at sculptures-in-words' 13.79 pt).
if (DOM) {
  const SF = {
    textformat: ['0 0 32 20', 1.45, 0.906, '<path d="M1.6 18.6L8 1.6L14.4 18.6M3.9 12.8H12.1" fill="none" stroke="black" stroke-width="2.9" stroke-linejoin="round" stroke-linecap="round"/><path d="M20.9 8.3C21.9 7.1 23.3 6.6 24.9 6.6C27.5 6.6 29 8 29 10.6V18.6M29 12.7C26.5 12.7 20.3 12.5 20.3 15.7C20.3 17.6 21.8 18.7 23.8 18.7C26.4 18.7 29 17.2 29 14.6" fill="none" stroke="black" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>'],
  };
  const sheet = document.createElement('style');
  sheet.textContent = Object.entries(SF).map(([name, [box, w, h, body]]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`;
    return `#exact-root img[data-symbol-source="symbol:sf/${name}"][data-symbol-path=""]{mask-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")!important;mask-size:contain!important;width:${w}em!important;height:${h}em!important;max-width:none!important}`;
  }).join('');
  document.head.append(sheet);
}

// ---- Continuous corners that do not fit are round, as UIKit draws them --------------------------------------------
// `corner-shape: -exact-continuous` is written as a superellipse whose radius is the radius times the curve's reach
// (1.52). UIKit draws a continuous corner only where that reach fits in half the side; where it does not (a disc,
// a capsule, a pill), its corners are circular arcs of the radius asked, clamped to half the side: a 48 pt disc of
// radius 24 is a circle on the iPhone, where the superellipse made it a squircle on the web. Each element whose class
// or style gives it the curve is measured when it mounts and when it resizes, and turned round while it does not fit.
if (DOM) {
  const turned = new WeakSet();
  let classes = null, sheets = -1;
  const selector = () => {
    if (sheets === document.styleSheets.length && classes) return classes;
    sheets = document.styleSheets.length;
    const found = new Set();
    const walk = (rules) => { for (const r of rules) {
      if (r.cssRules?.length) walk(r.cssRules);
      if (r.style?.cornerShape?.startsWith('superellipse') && r.selectorText) for (const m of r.selectorText.matchAll(/\.(c\d+)\b/g)) found.add(m[1]);
    } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
    classes = [...[...found].map((c) => '.' + c), '[style*="corner-shape"]'].join(',');
    return classes;
  };
  const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
  const fit = (e, w, h) => {
    if (turned.has(e)) { e.style.removeProperty('corner-shape'); for (const c of corners) e.style.removeProperty(`border-${c.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase()).slice(1)}-radius`); turned.delete(e); }
    const cs = getComputedStyle(e);
    if (!cs.cornerShape?.startsWith('superellipse')) return;
    const reach = parseFloat(cs.getPropertyValue('--exact-curve-reach')) || 1.52, half = Math.min(w, h) / 2;
    const radii = corners.map((c) => parseFloat(cs[`border${c}Radius`]) || 0);
    if (half <= 0 || Math.max(...radii) <= half + 0.01) return;
    turned.add(e);
    e.style.setProperty('corner-shape', 'round');
    // The radius asked (the written one over the reach), unless the runtime animates the radius in the style.
    if (!/border[a-z-]*radius/.test(e.getAttribute('style') ?? '')) corners.forEach((c, i) => e.style.setProperty(`border-${c.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase()).slice(1)}-radius`, `${radii[i] / reach}px`));
  };
  const sizes = new ResizeObserver((entries) => { for (const en of entries) fit(en.target, en.borderBoxSize?.[0]?.inlineSize ?? en.contentRect.width, en.borderBoxSize?.[0]?.blockSize ?? en.contentRect.height); });
  const watched = new WeakSet();
  let queued = false;
  const scan = () => {
    queued = false;
    const root = document.getElementById('exact-root');
    if (!root) return;
    for (const e of root.querySelectorAll(selector())) if (!watched.has(e)) { watched.add(e); sizes.observe(e, { box: 'border-box' }); }
  };
  const mutations = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } });
  const start = () => { const root = document.getElementById('exact-root'); if (!root) return void setTimeout(start, 50); mutations.observe(root, { childList: true, subtree: true }); scan(); };
  if (typeof CSS !== 'undefined' && CSS.supports?.('corner-shape', 'round')) start();
}

// ---- The launch: modules/apple/DemoLaunch.swift on the web --------------------------------------------------------
// Open: the card (`web-card`) grows out of the tapped icon, its width, aspect and centre each on their own spring, the
// icon's artwork cross-fading into it, the corners overshooting the display's radius and settling, a slight trapezoid
// straightening as it lands; the icons behind (`web-home-zoom`) shrink, blur (`web-blur`) and dim (`web-dim`). Close:
// a drag shrinks the card under the finger; a throw or a pull past a tenth of the screen flies it into its icon, a
// shorter pull springs back. Every flight is the springs run to rest ahead of time (1/120 s steps), handed to the
// compositor as linear keyframes of transform and opacity (the corners' radius is the one main-thread track), so a busy
// main thread (the demo's first commit, wasm, a pipeline compile) does not hold the motion back.
const spring = (omega, zeta) => ({ omega, zeta });
const K = {
  openWidth: spring(22.6, 0.977), openAspect: spring(34.6, 1.088), openCenterX: spring(26.9, 1.02), openCenterY: spring(32.1, 0.892),
  closeWidth: spring(15.7, 0.867), closeHeight: spring(25.7, 0.948), closeCenterX: spring(12.6, 0.67), closeCenterY: spring(13.6, 0.72),
  homeScale: 0.912, homeGain: 0.445, blurGainAtFull: 0.56,
  openHomeScale: spring(11, 1), openHomeBlur: spring(10.5, 1), openHomeDim: spring(25, 1),
  closeHomeScale: spring(10, 1), closeHomeDim: spring(8.7, 0.73), closeBlurRate: 12.6,
  dragTravel: 0.7, dragMinScale: 0.3, failSideways: 30, activeOffsetY: 10, stripFraction: 0.18,
  closeVelocity: 250, closeTravel: 0.1, throwProjection: 0.15, artGone: [0.2, 0.42], taper: 0.334, taperIn: 0.065,
  openRadius: [[0.14, 0.53], [0.35, 0.84], [0.45, 1], [0.5, 1.18], [0.6, 1.27], [0.7, 1.29], [0.8, 1.26], [0.85, 1.23], [0.9, 1.16], [0.95, 1.1], [0.98, 1.056], [1, 1]],
  closeRadiusFrom: 0.35, iconRadiusRatio: 0.2237, rate: 120,
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// A damped spring by natural frequency and damping ratio, mass 1, stepped in closed form.
class Spring {
  constructor(x, p = K.openWidth) { this.x = x; this.v = 0; this.target = x; this.p = p; }
  run(target, p, velocity) { this.target = target; this.p = p; if (velocity !== undefined) this.v = velocity; }
  set(x) { this.x = x; this.target = x; this.v = 0; }
  step(t) {
    const x0 = this.x - this.target, v0 = this.v, w = this.p.omega, z = this.p.zeta;
    if (x0 === 0 && v0 === 0) return;
    if (z < 0.9999) {
      const a = z * w, wd = w * Math.sqrt(1 - z * z), e = Math.exp(-a * t), A = x0, B = (v0 + a * x0) / wd, c = Math.cos(wd * t), s = Math.sin(wd * t);
      this.x = this.target + e * (A * c + B * s); this.v = e * ((-a * A + B * wd) * c + (-a * B - A * wd) * s);
    } else if (z <= 1.0001) {
      const e = Math.exp(-w * t), B = v0 + w * x0;
      this.x = this.target + e * (x0 + B * t); this.v = e * (v0 - w * B * t);
    } else {
      const r = Math.sqrt(z * z - 1), r1 = -w * (z - r), r2 = -w * (z + r), c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2, e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
      this.x = this.target + c1 * e1 + c2 * e2; this.v = r1 * c1 * e1 + r2 * c2 * e2;
    }
  }
  settled(tol) { return Math.abs(this.x - this.target) < tol && Math.abs(this.v) < tol * 8; }
}
// An element's layout box in `root`'s coordinates (transforms left out, scrolls taken in).
function frameIn(el, root) {
  let x = 0, y = 0, n = el;
  while (n && n !== root) {
    x += n.offsetLeft; y += n.offsetTop;
    const p = n.offsetParent;
    for (let a = n.parentElement; a && a !== p && a !== root; a = a.parentElement) { x -= a.scrollLeft; y -= a.scrollTop; }
    if (p && p !== root) { x -= p.scrollLeft; y -= p.scrollTop; }
    if (!p) break;
    n = p;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
// The icon the finger last pressed on the launcher, and the page it was on.
let lastTap = null;
const noteTap = (e) => {
  const b = e.target?.closest?.('[data-testid^="icon-"]');
  if (!b) return;
  lastTap = { slug: b.getAttribute('data-testid').slice(5), at: performance.now(), scroll: b.closest('[data-testid="pager"]')?.scrollLeft ?? 0 };
};
if (DOM) document.addEventListener('pointerdown', noteTap, true);
if (DOM) document.addEventListener('click', noteTap, true);
// A demo's card draws only once its launch has placed it: the route's first frame can paint before this module's view
// is made, which showed the demo full screen for a frame ahead of the open.
if (DOM) {
  const sheet = document.createElement('style');
  sheet.textContent = '[data-testid="web-card"]:not([data-launched]){visibility:hidden}canvas[data-web-frozen]{visibility:hidden!important}';
  document.head.append(sheet);
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The open card's Back handler (`onBack` in `launch`). A Back is caught at the Navigation API's `navigate` event,
// before the history moves: the router's popstate listener (registered before this module loads) runs ahead of any
// listener added here and tore the demo down at once. `passing` is the traversal this module started itself.
let backHandler = null, passing = null;
if (DOM && globalThis.navigation) navigation.addEventListener('navigate', (e) => {
  if (passing && e.navigationType === 'traverse' && e.destination.key === passing) { passing = null; return; }
  backHandler?.(e);
});

// When each WebGPU canvas last took a frame to draw into (`getCurrentTexture`): a closing card copies only a canvas
// that drew in the current frame, the one moment its picture is readable (`freeze` in `launch`).
const drawnAt = new WeakMap();
if (DOM && typeof GPUCanvasContext === 'function') {
  const take = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function () { drawnAt.set(this.canvas, performance.now()); return take.call(this); };
}

function launch(el, props, event) {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{display:block}img{position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;will-change:opacity}</style><img alt="">';
  const art = root.querySelector('img');
  let p = props, phase = 'idle', closing = false, grouped = false, flight = null, track = null, landedSent = false;
  let screen = null, card = null, content = null, zoom = null, dim = null, blur = null, icon = null;
  let sw = 0, sh = 0, R = 62, rest0 = false, iconFrame = null, iconRadius = 0, radius = 0, releaseRadius = 0;
  const w = new Spring(0), h = new Spring(0), aspect = new Spring(1), cx = new Spring(0), cy = new Spring(0);
  const homeScale = new Spring(1), homeBlur = new Spring(0), homeDim = new Spring(0);
  let dragFrom = { s: 1, c: { x: 0, y: 0 } }, dragAnchor = { x: 0, y: 0 }, dragHeld = { x: 0, y: 0 };

  const framed = () => p.framed === 'true';
  // The display's corners: the frame's 62 pt; a phone's browser page is square-cornered at rest (its glass rounds it).
  const restRadius = (q) => (framed() ? R : R * (1 - smoothstep(0.9, 1, q)));
  const widthProgress = () => {
    const iw = iconFrame.w * (closing ? homeScale.x : 1), span = sw - iw;
    return span > 0 ? (w.x - iw) / span : 1;
  };
  const openRadius = () => {
    const q = widthProgress();
    let last = [0, iconRadius / R];
    for (const pt of K.openRadius) {
      if (q <= pt[0]) return restRadius(q) / 1 * lerp(last[1], pt[1], clamp01((q - last[0]) / (pt[0] - last[0]))) * (framed() ? 1 : 1);
      last = pt;
    }
    return restRadius(q);
  };
  const artAlpha = () => (phase === 'opening' || phase === 'closing' ? 1 - smoothstep(K.artGone[0], K.artGone[1], w.x / sw) : 0);
  const dimOf = (hd, bl) => {
    const gain = 1 - (1 - K.homeGain) * clamp01(hd), blurGain = 1 - (1 - K.blurGainAtFull) * bl;
    return clamp01(1 - gain / Math.max(blurGain, 0.01));
  };
  const pose = (since = 0) => {
    const q = widthProgress();
    let taper = 0;
    if (phase === 'opening') taper = K.taper / sw * (1 - clamp01(q));
    else if (phase === 'closing') taper = K.taper / sw * (1 - clamp01(q)) * clamp01(since / K.taperIn) * smoothstep(0, 0.08, q);
    const bl = clamp01(homeBlur.x);
    return { w: w.x, h: Math.max(h.x, 1), cx: cx.x, cy: cy.x, radius, taper, art: artAlpha(), hs: homeScale.x, dim: dimOf(homeDim.x, bl), blur: bl };
  };
  // A pose as the layers' styles: the card a box of W x H by a non-uniform scale of the screen-sized element (its
  // corners given per axis so they read round), the demo inside at the uniform scale W / screen width.
  const styles = (q) => {
    const W = q.w, H = q.h, k = q.taper, top = q.cy - H / 2, bottom = q.cy + H / 2;
    let half = H / 2;
    if (k !== 0) for (let i = 0; i < 4; i++) half = (bottom - top) / 2 * (1 - k * k * half * half);
    const centerY = k !== 0 ? top + half / (1 - k * half) : q.cy;
    const sx = W / sw, sy = (half * 2) / sh;
    return {
      card: `translate(${q.cx}px,${centerY}px) matrix3d(1,0,0,0,0,1,0,${k},0,0,1,0,0,0,0,1) translate(${-W / 2}px,${-half}px) scale(${sx},${sy})`,
      // The corners as a clip-path, which Chrome animates on the compositor (a border-radius animation repaints the card
      // and its whole demo on the main thread every frame).
      clip: `inset(0 round ${q.radius / sx}px / ${q.radius / sy}px)`,
      content: `scale(1,${sx / sy})`,
      art: String(q.art), home: `scale(${q.hs})`, dim: String(q.dim), blur: String(q.blur),
    };
  };
  const put = (q) => {
    const st = styles(q);
    card.style.transform = st.card; card.style.clipPath = st.clip; content.style.transform = st.content;
    art.style.opacity = st.art; zoom.style.transform = st.home; dim.style.opacity = st.dim; blur.style.opacity = st.blur;
  };
  const behind = (on) => {
    blur.style.visibility = on ? 'visible' : 'hidden';
    // The layers are promoted once, when the card is set up (`promote`), never at a flight's start: a promotion in the
    // first frame of a flight rasterizes the layer in that frame.
  };
  // At rest the card is the screen: no transform, no clip radius (the frame's display rounds it), the blur off.
  const rest = () => {
    card.style.transform = 'none'; card.style.clipPath = ''; content.style.transform = 'none'; art.style.opacity = '0';
    zoom.style.transform = `scale(${K.homeScale})`; dim.style.opacity = String(dimOf(1, 1)); blur.style.opacity = '1';
    behind(false);
  };
  const stopFlight = () => { if (flight) { for (const a of flight.anims) a.cancel(); clearTimeout(flight.timer); flight = null; } };
  // The flight's pose and velocity now, read off its timeline (an open caught by a drag or a close).
  const shown = () => {
    if (!flight || !flight.poses.length) return null;
    const x = Math.max(0, performance.now() - flight.start) / 1000 * K.rate, n = flight.poses.length;
    const i = Math.min(Math.floor(x), n - 1), j = Math.min(i + 1, n - 1), u = x - i, a = flight.poses[i], b = flight.poses[j];
    const at = {}; for (const key in a) at[key] = lerp(a[key], b[key], u);
    const vel = (key) => (j > i ? (b[key] - a[key]) * K.rate : 0);
    return { pose: at, v: { w: vel('w'), h: vel('h'), cx: vel('cx'), cy: vel('cy'), hs: vel('hs') } };
  };
  const step = (dt) => {
    if (phase === 'opening') {
      w.step(dt); aspect.step(dt); cx.step(dt); cy.step(dt); homeScale.step(dt); homeBlur.step(dt); homeDim.step(dt);
      h.set(w.x * aspect.x); radius = openRadius();
    } else if (phase === 'returning') {
      w.step(dt); cx.step(dt); cy.step(dt); h.set(w.x * sh / sw); radius = restRadius(1) * w.x / sw;
    } else if (phase === 'closing') {
      homeScale.step(dt); homeDim.step(dt); homeBlur.x *= Math.exp(-K.closeBlurRate * dt);
      retarget(); w.step(dt); h.step(dt); cx.step(dt); cy.step(dt);
      radius = lerp(iconRadius * homeScale.x, releaseRadius, smoothstep(0, K.closeRadiusFrom, widthProgress()));
    }
  };
  const settled = () => {
    if (phase === 'opening') return w.settled(0.25) && aspect.settled(0.0005) && cx.settled(0.25) && cy.settled(0.25) && homeDim.settled(0.004) && homeBlur.settled(0.004) && homeScale.settled(0.0005);
    if (phase === 'returning') return w.settled(0.25) && cx.settled(0.25) && cy.settled(0.25);
    // The close lands once the card is within a point or so of its icon: the route then hands the home back, whose
    // own icon is under it (the spring's sub-point tail would hold the home's taps for another 0.4 s).
    return w.settled(1.2) && h.settled(1.2) && cx.settled(1.2) && cy.settled(1.2) && homeScale.settled(0.002) && homeDim.settled(0.02) && homeBlur.x < 0.02;
  };
  const retarget = () => {
    const s = homeScale.x, mx = sw / 2, my = sh / 2;
    w.target = iconFrame.w * s; h.target = iconFrame.h * s;
    cx.target = mx + (iconFrame.x + iconFrame.w / 2 - mx) * s; cy.target = my + (iconFrame.y + iconFrame.h / 2 - my) * s;
  };
  // Runs the springs to rest and hands the compositor the whole path.
  const fly = (done) => {
    stopFlight();
    const poses = [pose(0)], dt = 1 / K.rate;
    for (let i = 1; i < K.rate * 3 && !settled(); i++) { step(dt); poses.push(pose(i * dt)); }
    const ls = poses.map(styles), duration = (poses.length - 1) / K.rate * 1000, o = { duration: Math.max(1, duration), easing: 'linear', fill: 'forwards' };
    behind(true);
    const anims = [
      card.animate(ls.map((l) => ({ transform: l.card })), o), card.animate(ls.map((l) => ({ clipPath: l.clip })), o),
      content.animate(ls.map((l) => ({ transform: l.content })), o), art.animate(ls.map((l) => ({ opacity: l.art })), o),
      zoom.animate(ls.map((l) => ({ transform: l.home })), o), dim.animate(ls.map((l) => ({ opacity: l.dim })), o),
      blur.animate(ls.map((l) => ({ opacity: l.blur })), o),
    ];
    flight = { start: performance.now(), poses, anims, timer: 0 };
    const f = flight;
    f.timer = setTimeout(() => { if (flight !== f) return; put(poses.at(-1)); stopFlight(); done(); }, duration);
  };

  // The node joins the page in the same task as this call (the runtime's commit): the open is set up in a microtask
  // after it, before the frame paints, so the card never shows full screen for a frame first.
  let waits = 0;
  const begin = () => {
    if (!el.isConnected) return ++waits < 20 ? queueMicrotask(begin) : requestAnimationFrame(begin);
    screen = el.closest('[data-testid="web-screen"]'); card = el.closest('[data-testid="web-card"]');
    if (!screen || !card) return;
    card.setAttribute('data-launched', '');
    content = card.querySelector('[data-testid="web-card-content"]');
    zoom = screen.querySelector('[data-testid="web-home-zoom"]'); dim = screen.querySelector('[data-testid="web-dim"]'); blur = screen.querySelector('[data-testid="web-blur"]');
    sw = screen.offsetWidth; sh = screen.offsetHeight; R = framed() ? 62 : 48;
    card.style.transformOrigin = '0 0'; content.style.transformOrigin = '0 0'; zoom.style.transformOrigin = '50% 50%';
    // Promoted for good: every flight then moves layers that already exist (see `behind`).
    for (const e of [card, content, zoom]) e.style.willChange = 'transform';
    for (const e of [dim, blur]) e.style.willChange = 'opacity';
    art.src = new URL(p.art ?? '', document.baseURI).href;
    install();
    const tapped = lastTap && lastTap.slug === p.slug && performance.now() - lastTap.at < 2500;
    if (tapped) { const pager = screen.querySelector('[data-testid="pager"]'); if (pager) pager.scrollLeft = lastTap.scroll; }
    lastTap = null;
    findIcon();
    if (!tapped || !iconFrame || reducedMotion()) {
      // A link has no icon to open out of: the demo simply appears, as on the phone.
      phase = 'open'; rest(); return;
    }
    grouped = true;
    icon.style.visibility = 'hidden';
    w.set(iconFrame.w); w.run(sw, K.openWidth);
    aspect.set(iconFrame.h / iconFrame.w); aspect.run(sh / sw, K.openAspect); h.set(w.x * aspect.x);
    cx.set(iconFrame.x + iconFrame.w / 2); cx.run(sw / 2, K.openCenterX);
    cy.set(iconFrame.y + iconFrame.h / 2); cy.run(sh / 2, K.openCenterY);
    homeScale.set(1); homeScale.run(K.homeScale, K.openHomeScale);
    homeBlur.set(0); homeBlur.run(1, K.openHomeBlur); homeDim.set(0); homeDim.run(1, K.openHomeDim);
    phase = 'opening'; radius = iconRadius;
    put(pose(0));
    fly(() => { phase = 'open'; rest(); });
  };
  // The demo's icon on the page shown behind (the copy of the launcher this route draws), or none off the page.
  const findIcon = () => {
    iconFrame = null;
    // Opened from a search's results: out of (and back into) the row's icon.
    const row = searchIcon(screen, p.slug);
    if (row !== undefined) {
      if (row) { iconFrame = row; icon = row.el; iconRadius = row.w * K.iconRadiusRatio; }
      return;
    }
    const img = screen.querySelector(`[data-testid="icon-${CSS.escape(p.slug)}"] img`);
    if (!img) return;
    const f = frameIn(img, screen);
    if (f.w > 0 && f.x + f.w > 0 && f.x < sw && f.y + f.h > 0 && f.y < sh) { iconFrame = f; icon = img; iconRadius = f.w * K.iconRadiusRatio; }
  };

  // A closing card (dragged or flying) shows its demo's GPU canvases as stills. A live WebGPU canvas inside the moving
  // card made the GPU process wait on the demo's frames before every composite (chessboard: 10-35 frames presented in
  // the 1.5 s of a close); hidden, the same close presented 180-440. Each canvas is copied in the frame callback after
  // the GPU glue's (the only moment its picture is readable) into a 2D canvas styled as it and placed right after it,
  // so whatever the demo draws over it stays over it; a canvas that drew nothing that frame (an idle surface, whose
  // picture is no longer readable) stays live. The card is torn down when it lands; a drag that springs back thaws.
  let stills = [];
  const freeze = (frameAt) => {
    if (!content || !content.isConnected || !closing && phase !== 'dragging') return;
    for (const c of content.querySelectorAll('canvas[data-surface]')) {
      if (c.hasAttribute('data-web-frozen') || !(drawnAt.get(c) >= frameAt) || c.width < 2 || c.height < 2) continue;
      const s = document.createElement('canvas');
      s.width = c.width; s.height = c.height;
      try { s.getContext('2d').drawImage(c, 0, 0); } catch { continue; }
      s.style.cssText = c.style.cssText; s.style.visibility = ''; s.style.pointerEvents = 'none';
      s.setAttribute('aria-hidden', 'true');
      c.after(s); stills.push(s);
      c.setAttribute('data-web-frozen', '');
    }
  };
  const thaw = () => {
    for (const s of stills) s.remove();
    stills = [];
    if (content) for (const c of content.querySelectorAll('canvas[data-web-frozen]')) c.removeAttribute('data-web-frozen');
  };

  // The close: from wherever the card shows, into its icon (or a fade when the icon is not on the page).
  const close = (velocity) => {
    if (closing || !screen) return;
    closing = true;
    haptics.play('impact-medium');
    requestAnimationFrame(freeze);
    cancelTrack();
    const now = shown();
    if (!iconFrame) findIcon();
    if (!iconFrame || reducedMotion()) {
      stopFlight();
      card.animate([{ opacity: 1, transform: getComputedStyle(card).transform }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
        .finished.then(landed, landed);
      return;
    }
    if (icon) icon.style.visibility = 'hidden';
    let v = velocity ?? { w: 0, h: 0, cx: 0, cy: 0 };
    if (now) {
      const q = now.pose;
      w.set(q.w); h.set(q.h); cx.set(q.cx); cy.set(q.cy); homeScale.set(q.hs); homeBlur.set(q.blur); radius = q.radius;
      homeDim.set(phase === 'opening' ? clamp01(homeDim.x) : 1);
      if (!velocity) v = now.v;
    } else if (phase === 'open' || phase === 'idle') {
      w.set(sw); h.set(sh); cx.set(sw / 2); cy.set(sh / 2); homeScale.set(K.homeScale); homeBlur.set(1); homeDim.set(1); radius = restRadius(1);
    }
    stopFlight();
    // As the route's `closing` would (it hears of a dragged close only when the card lands): the demo and the home
    // behind take no tap during the flight.
    content.style.pointerEvents = 'none'; screen.firstElementChild.style.pointerEvents = 'none';
    phase = 'closing'; grouped = true; releaseRadius = radius;
    w.run(w.x, K.closeWidth, v.w); h.run(h.x, K.closeHeight, v.h); cx.run(cx.x, K.closeCenterX, v.cx); cy.run(cy.x, K.closeCenterY, v.cy);
    homeScale.run(1, K.closeHomeScale); homeDim.run(0, K.closeHomeDim); homeBlur.target = 0;
    retarget();
    fly(landed);
  };
  const landed = () => {
    if (landedSent) return;
    landedSent = true;
    if (icon) icon.style.visibility = '';
    // A Back (the browser's, a mouse's back button): held at its `navigate` event while the card flew; the history
    // moves now, when the card has landed, so the route's teardown runs after the flight, never in its first frame.
    if (backState) { goBack(); return; }
    if (p.closing !== 'true') event(0);
    event(1, 'landed');
  };
  // Back while the demo shows: the card flies into its icon as the close button's close does (on the phone a Back is
  // the swipe's close), and the route's own popstate handler (registered without capture, so after this one) gets
  // the event when the card lands. Without it the route tore the demo down at once in one 30-170 ms task, unanimated.
  let backState = null;
  const goBack = () => {
    const key = backState.key; backState = null; passing = key;
    try { navigation.traverseTo(key).finished.catch(() => {}); } catch { passing = null; history.back(); }
  };
  const onBack = (e) => {
    if (e.navigationType !== 'traverse' || !e.cancelable || !e.destination.sameDocument || closing || backState) return;
    if (!screen || !card || !card.isConnected || new URL(e.destination.url).pathname.endsWith(`/demo/${p.slug}`)) return;
    e.preventDefault();
    backState = { key: e.destination.key };
    close();
  };

  // ---- the swipe-down close: the same rules as ClosePan / CloseZone (tools/close-gesture.md) ----
  // The screen's rect is read once per press (at its down, before the drag writes a style): read after a write, it
  // forced a style and layout of the whole page on every move.
  let screenRect = null;
  const toScreen = (e) => {
    const r = screenRect ?? screen.getBoundingClientRect(), k = r.width / sw || 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const zoneAllows = (pt) => {
    const z = String(p.zone ?? '').trim();
    if (!z) return true;
    for (const word of z.split(/\s+/)) {
      if (word === 'strip') return false;
      const [x0, y0, x1, y1] = word.split(',').map(Number);
      if ([x0, y0, x1, y1].every(Number.isFinite) && pt.x >= x0 * sw && pt.x <= x1 * sw && pt.y >= y0 * sh && pt.y <= y1 * sh) return false;
    }
    return true;
  };
  // A vertical scroller under the finger scrolled into its content keeps the pull (iOS's hand-off at the top).
  const scrolledInto = (target) => {
    for (let n = target; n && n !== card; n = n.parentElement) {
      if (n.nodeType !== 1) continue;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) return true;
    }
    return false;
  };
  const down = (e) => {
    if (track || closing || !e.isTrusted || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!(phase === 'open' || phase === 'opening' || phase === 'returning')) return;
    screenRect = screen.getBoundingClientRect();
    const pt = toScreen(e), strip = pt.y < Math.max(Number(p['safe-top']) || 0, sh * K.stripFraction);
    if (!strip && (!zoneAllows(pt) || scrolledInto(e.target))) return;
    track = { id: e.pointerId, target: e.target, start: pt, client: { x: e.clientX, y: e.clientY }, strip, active: false, samples: [], decided: false };
  };
  const cancelTrack = () => { track = null; };
  const move = (e) => {
    if (!track || e.pointerId !== track.id) return;
    const pt = toScreen(e), tx = pt.x - track.start.x, ty = pt.y - track.start.y;
    if (!track.active) {
      if (Math.abs(tx) > K.failSideways || (track.strip && ty < -K.activeOffsetY)) { track = null; return; }
      if (ty > K.activeOffsetY && ty > Math.abs(tx)) activate(e, pt); else return;
      if (!track) return;
    }
    e.stopImmediatePropagation(); e.preventDefault();
    track.samples.push({ t: e.timeStamp, x: pt.x, y: pt.y });
    while (track.samples.length > 2 && e.timeStamp - track.samples[0].t > 100) track.samples.shift();
    drag(pt);
  };
  const activate = (e, pt) => {
    let from = { s: 1, c: { x: sw / 2, y: sh / 2 } };
    if (phase !== 'open') {
      const now = shown();
      if (!now || now.pose.w < 0.75 * sw) { track = null; return; }
      from = { s: now.pose.w / sw, c: { x: now.pose.cx, y: now.pose.cy } };
    }
    stopFlight();
    // The drag moves the card with the canvases as stills too: live, they held the drag's frames as a flight's.
    requestAnimationFrame(freeze);
    // The demo's own gesture on this pointer ends, as when the browser takes a touch to scroll.
    try { track.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: track.id, pointerType: e.pointerType, isPrimary: true, bubbles: true, clientX: e.clientX, clientY: e.clientY })); } catch {}
    track.active = true;
    phase = 'dragging';
    behind(true);
    homeScale.set(K.homeScale); homeBlur.set(1); homeDim.set(1);
    dragFrom = from; dragAnchor = pt;
    dragHeld = { x: (pt.x - from.c.x) / from.s, y: (pt.y - from.c.y) / from.s };
    track.anchorAt = pt;
  };
  const dragPose = (t) => {
    const d = Math.max(0, t.y), s = Math.max(K.dragMinScale, dragFrom.s - d / (K.dragTravel * sh));
    return { s, x: dragAnchor.x + t.x - dragHeld.x * s, y: dragAnchor.y + d - dragHeld.y * s };
  };
  const drag = (pt) => {
    const d = dragPose({ x: pt.x - dragAnchor.x, y: pt.y - dragAnchor.y });
    w.set(sw * d.s); h.set(sh * d.s); cx.set(d.x); cy.set(d.y); radius = restRadius(1) * d.s || R * d.s;
    put({ w: w.x, h: h.x, cx: cx.x, cy: cy.x, radius: framed() ? R * d.s : R * d.s, taper: 0, art: 0, hs: K.homeScale, dim: dimOf(1, 1), blur: 1 });
  };
  const up = (e) => {
    // The cancel this close sends the demo is not the finger's.
    if (!track || e.pointerId !== track.id || !e.isTrusted) return;
    const t = track; track = null;
    if (!t.active) return;
    e.stopImmediatePropagation(); e.preventDefault();
    // The click the browser makes of this press would land on the demo.
    const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 400);
    const pt = toScreen(e), a = t.samples[0] ?? { t: e.timeStamp, ...pt }, b = t.samples.at(-1) ?? a, dt = Math.max(1, b.t - a.t) / 1000;
    const vx = t.samples.length > 1 ? (b.x - a.x) / dt : 0, vy = t.samples.length > 1 ? (b.y - a.y) / dt : 0;
    const tr = { x: pt.x - dragAnchor.x, y: pt.y - dragAnchor.y }, d = Math.max(0, tr.y), thrown = d + Math.max(0, vy) * K.throwProjection;
    const held = dragPose(tr);
    const ds = d > 0 && held.s > K.dragMinScale ? -vy / (K.dragTravel * sh) : 0;
    const v = { w: sw * ds, h: sh * ds, cx: vx + (sw / 2 - dragAnchor.x) * ds, cy: (d > 0 ? vy : 0) + (sh / 2 - dragAnchor.y) * ds };
    radius = R * held.s;
    if (e.type === 'pointerup' && vy > -100 && (vy > K.closeVelocity || thrown > K.closeTravel * sh)) {
      phase = 'released';
      // The route hears of the close when the card has landed (`landed`): its commit (the launcher's pointer-events)
      // in the release's frame held the flight's first frames ~70 ms.
      close(v);
    } else {
      phase = 'returning';
      w.run(sw, K.openWidth, v.w); cx.run(sw / 2, K.openCenterX, v.cx); cy.run(sh / 2, K.openCenterY, v.cy);
      homeScale.set(K.homeScale); homeBlur.set(1); homeDim.set(1);
      fly(() => { phase = 'open'; rest(); thaw(); });
    }
  };
  const touchmove = (e) => {
    if (!track || e.touches.length !== 1) return;
    if (track.active) { if (e.cancelable) e.preventDefault(); return; }
    if (track.decided) return;
    const t = e.touches[0], dx = t.clientX - track.client.x, dy = t.clientY - track.client.y;
    if (dx === 0 && dy === 0) return;
    track.decided = true;
    // A pull down that may become the close: the page must not take this touch to scroll (which cancels it).
    if (dy > 0 && dy >= Math.abs(dx) && e.cancelable) e.preventDefault();
  };
  let installed = false;
  const noop = () => {};
  const install = () => {
    if (installed) return; installed = true;
    card.addEventListener('pointerdown', down, true);
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    card.addEventListener('touchmove', touchmove, { capture: true, passive: false });
    // A blocking touchstart listener on the window while a demo is up: without one (a production page has no other)
    // Chrome sends the touch's start uncancelable and lets the compositor take a pull down over a touch-action:auto
    // view as a scroll at its first move (pointercancel, every touchmove uncancelable), so the swipe-down close never
    // began over sudoku, stacked-list, clerk-toast, fluid-slider... opened from their icons. One on the card is not
    // enough (its region is not consulted under the card's transform); the dev page had one (its tooling's).
    addEventListener('touchstart', noop, { capture: true, passive: false });
    if (trackpadWheel) card.addEventListener('wheel', trackpadWheel, { capture: true, passive: false });
    backHandler = onBack;
  };
  const uninstall = () => {
    if (!installed) return; installed = false;
    card.removeEventListener('pointerdown', down, true);
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    card.removeEventListener('touchmove', touchmove, { capture: true });
    removeEventListener('touchstart', noop, { capture: true });
    if (trackpadWheel) card.removeEventListener('wheel', trackpadWheel, { capture: true });
    if (backHandler === onBack) backHandler = null;
  };
  begin();
  return {
    set(n) { const was = p.closing; p = n; if (n.closing === 'true' && was !== 'true') close(); },
    destroy() {
      stopFlight(); uninstall(); thaw(); if (icon) icon.style.visibility = '';
      // Torn down before it landed (another route took the screen): the Back still happens.
      if (backState) goBack();
    },
  };
}

// ---- Pull-to-search: modules/apple/SearchReveal.swift on the web --------------------------------------------------
// A downward pull on the pager drives one reveal value 0...1 over 100 pt of damped travel: the icons and the dots ride
// the finger on a rubber band and shrink a touch (the wallpaper stays), the home blurs (the radius grows as the
// reveal's power 3.5: sharp at a quarter, strongest at commit), dims, the field slides in, the results fade in. Each
// move writes transform and opacity only; the growing blur is three fixed backdrop blurs cross-faded by opacity, so no
// frame re-rasterizes a filter of a new radius. Past the trigger (or flicked) the release lands the search: the field
// narrows for Cancel and takes the keys, the results filter as you type, a tapped row opens its demo out of the row's
// icon. Short of it the pull springs back on iOS's spring (damping 0.85, response 0.35 s) from the finger's speed.
const PULL = {
  trigger: 100, rubber: 260, disarm: 0.85, flick: 900, activate: 10, failX: 10, blur: [0.1, 1], blurPower: 3.5,
  dimPower: 1.5, field: [0.15, 0.55], list: [0.35, 1], fieldRide: 0.4, listRide: 1, commitMs: 340, exitMs: 360, exitDelay: 60,
  springDamping: 0.85, springResponse: 0.35, gridRubber: 0.55, gridShrink: 0.04, gridAway: 48, fieldDrop: 24, focusMs: 360,
  barHeight: 48, barTop: 10, listGap: 24, rowPadding: 7, blurRadius: 30, maxDim: 0.28,
};
const BLUR_STEPS = [3, 10, 30];
const span = (x, [a, b]) => clamp01((x - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// What a search shows, shared by the launcher's copies (the home's route and the one under an open demo), so the home a
// closing card lands on shows the same search.
const searchShared = { committed: false, query: '', grid: 0, scroll: 0 };
const searches = new Set();
// A committed search's row icon for `slug` on `screen` (the launch opens out of it and closes back into it), `null` when
// that search does not list it, `undefined` when no search is committed there.
const searchIcon = (screen, slug) => {
  for (const s of searches) if (s.screen() === screen && s.committed()) return s.rowIcon(slug);
  return undefined;
};

function searchReveal(el, props, event) {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
:host{display:block;pointer-events:none}*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}
.b{position:absolute;inset:0;opacity:0;visibility:hidden;will-change:opacity}
.dim{position:absolute;inset:0;background:#000;opacity:0;visibility:hidden;will-change:opacity}
.list{position:absolute;inset:0;overflow-y:auto;overscroll-behavior:contain;opacity:0;visibility:hidden;scrollbar-width:none;will-change:opacity,transform}
.list::-webkit-scrollbar{display:none}
.row{all:unset;display:flex;align-items:center;gap:14px;width:100%;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent}
.row img{flex-shrink:0;display:block}
.row span{flex:1;color:rgba(255,255,255,.95);font-size:17px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row::after{content:"";position:absolute;left:var(--x);right:0;bottom:0;height:.5px;background:rgba(255,255,255,.1)}
.row:active{opacity:.6}
.empty{color:rgba(255,255,255,.55);font-size:17px;font-weight:500;text-align:center;margin-top:40px;display:none}
.band{position:absolute;left:0;right:0;top:0;opacity:0;visibility:hidden;pointer-events:none;background:linear-gradient(rgba(31,31,32,.92),rgba(31,31,32,.7) var(--bar),rgba(31,31,32,0));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);-webkit-mask-image:linear-gradient(#000 var(--bar),transparent);mask-image:linear-gradient(#000 var(--bar),transparent)}
.bar{position:absolute;height:48px;opacity:0;visibility:hidden;will-change:opacity,transform}
.pill{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:24px;background:rgba(118,118,128,.28);backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18);transition:width .36s cubic-bezier(.25,1,.35,1)}
.hint{position:absolute;top:0;height:48px;display:flex;align-items:center;gap:7px;color:#8e8e93;font-size:17px;pointer-events:none;left:50%;transform:translateX(-50%);transition:left .36s cubic-bezier(.25,1,.35,1),transform .36s cubic-bezier(.25,1,.35,1)}
.n .hint,.q .hint{left:16px;transform:none}.q .hint span{visibility:hidden}
input{all:unset;position:absolute;inset:0;padding:0 16px 0 41px;color:#fff;font-size:17px;caret-color:#0a84ff;-webkit-user-select:text;user-select:text}
.cancel{all:unset;position:absolute;right:0;top:0;height:48px;display:flex;align-items:center;color:#fff;font-size:17px;cursor:pointer;opacity:0;transform:translateX(40px);transition:opacity .36s,transform .36s cubic-bezier(.25,1,.35,1);pointer-events:none}
.n .cancel{opacity:1;transform:none;pointer-events:auto}
.still,.still *{transition:none!important}
</style>
<div class="b"></div><div class="b"></div><div class="b"></div><div class="dim"></div>
<div class="list" role="list"><div class="rows"></div><div class="empty">No Results</div></div>
<div class="band"></div>
<div class="bar"><div class="pill"><div class="hint"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="8.5" cy="8.5" r="5.8"/><path d="M13 13L17.5 17.5" stroke-linecap="round"/></svg><span>Search</span></div>
<input type="search" aria-label="Search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
<button class="cancel" type="button">Cancel</button></div>`;
  const $ = (q) => root.querySelector(q);
  const blurs = [...root.querySelectorAll('.b')], dim = $('.dim'), list = $('.list'), rowsBox = $('.rows'), empty = $('.empty');
  const band = $('.band'), bar = $('.bar'), pill = $('.pill'), input = $('input'), cancel = $('.cancel');
  blurs.forEach((b, i) => { b.style.backdropFilter = b.style.webkitBackdropFilter = `blur(${BLUR_STEPS[i]}px)`; });
  let p = props, rows = [], results = [], committed = false, reveal = 0, pull = 0, grid = 0, run = 0, track = null, armed = false, pullBase = 0;
  let screen = null, pager = null, box = null, sw = 0, sh = 0;
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  const iconSize = () => num(p['icon-size'], 62), margin = () => num(p['side-margin'], 22);
  const safeTop = () => num(p['safe-top'], 0), safeBottom = () => num(p['safe-bottom'], 0);
  const barBottom = () => safeTop() + PULL.barTop + PULL.barHeight, listTop = () => barBottom() + PULL.listGap;

  const rubber = (x) => (1 - 1 / (Math.max(0, x) * PULL.gridRubber / sh + 1)) * sh;
  const unrubber = (g) => sh / PULL.gridRubber * (1 / (1 - Math.min(Math.max(0, g), sh * 0.99) / sh) - 1);
  const rubberSlope = (x) => { const k = Math.max(0, x) * PULL.gridRubber / sh + 1; return PULL.gridRubber / (k * k); };
  const damp = (x) => PULL.rubber * (1 - Math.exp(-Math.max(0, x) / PULL.rubber));
  const look = (r, pp, g) => {
    const b = span(r, PULL.blur), fp = span(r, PULL.field), lp = span(r, PULL.list), s = 1 - PULL.gridShrink * clamp01(r);
    return { blur: PULL.blurRadius * b ** PULL.blurPower, dim: clamp01(r) ** PULL.dimPower * PULL.maxDim, bar: fp,
      barY: -PULL.fieldDrop * (1 - fp) + pp * PULL.fieldRide, list: smooth(lp), listY: -16 * (1 - lp) + pp * PULL.listRide, band: fp,
      grid: g === 0 && s === 1 ? '' : `translateY(${g}px) scale(${s})` };
  };
  const vis = (e, o) => { e.style.opacity = String(o); e.style.visibility = o > 0.001 ? 'visible' : 'hidden'; };
  // A blur radius as the three fixed blurs: the step below at full, the step above faded in by the remainder.
  const putBlur = (radius) => {
    let lo = -1;
    for (let i = 0; i < BLUR_STEPS.length; i++) if (radius >= BLUR_STEPS[i]) lo = i;
    blurs.forEach((b, i) => {
      let o = 0;
      if (i === lo) o = 1;
      else if (i === lo + 1) { const from = lo < 0 ? 0 : BLUR_STEPS[lo]; o = clamp01((radius - from) / (BLUR_STEPS[i] - from)); }
      vis(b, o);
    });
  };
  const put = (l) => {
    putBlur(l.blur); vis(dim, l.dim); vis(bar, l.bar); bar.style.transform = `translateY(${l.barY}px)`;
    vis(band, l.band); vis(list, l.list); list.style.transform = `translateY(${l.listY}px)`;
    if (box) { box.style.transform = l.grid; box.style.willChange = l.grid ? 'transform' : ''; }
  };
  const render = () => put(look(reveal, pull, grid));
  const layout = () => {
    const m = margin();
    bar.style.left = `${m}px`; bar.style.right = `${m}px`; bar.style.top = `${safeTop() + PULL.barTop}px`;
    band.style.height = `${listTop()}px`; band.style.setProperty('--bar', `${(barBottom() / listTop()) * 100}%`);
    list.style.padding = `${listTop()}px ${m}px ${safeBottom() + 40}px`;
    pill.style.width = committed ? `calc(100% - ${cancel.offsetWidth + 12}px)` : '100%';
    bar.classList.toggle('n', committed);
  };
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    results = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)) : rows;
    const size = iconSize(), pad = PULL.rowPadding;
    rowsBox.replaceChildren(...results.map((r) => {
      const b = document.createElement('button');
      b.className = 'row'; b.type = 'button'; b.dataset.slug = r.slug; b.setAttribute('role', 'listitem');
      b.style.height = `${size + pad * 2}px`;
      const img = document.createElement('img');
      img.src = new URL(r.icon, document.baseURI).href; img.alt = ''; img.decoding = 'async';
      img.style.cssText = `width:${size}px;height:${size}px;border-radius:${size * K.iconRadiusRatio}px`;
      const name = document.createElement('span'); name.textContent = r.name;
      b.style.setProperty('--x', `${size + 14}px`);
      b.append(img, name);
      return b;
    }));
    empty.style.display = results.length ? 'none' : 'block';
    bar.classList.toggle('q', input.value !== '');
  };
  const setRows = () => {
    const parts = (k) => String(p[k] ?? '').split('|');
    const slugs = p.slugs ? parts('slugs') : [], names = parts('names'), labels = parts('labels'), icons = parts('icons');
    rows = slugs.map((slug, i) => ({ slug, name: names[i] ?? slug, label: labels[i] ?? '', icon: icons[i] ?? '' }));
    filter();
  };

  // Runs: the look sampled along a curve from here to there, a frame at a time (the home is idle under a search).
  const stopRun = () => { if (run) { cancelAnimationFrame(run.raf); run = 0; } };
  const animate = (to, ms, curve, delay = 0, then) => {
    stopRun();
    const from = { r: reveal, p: pull, g: grid }, start = performance.now() + delay;
    const r = { raf: 0 };
    const tick = (now) => {
      const t = clamp01((now - start) / ms), k = now < start ? 0 : curve(t);
      reveal = lerp(from.r, to.r, k); pull = lerp(from.p, to.p, k); grid = lerp(from.g, to.g, k);
      render();
      if (t < 1) r.raf = requestAnimationFrame(tick);
      else { run = 0; reveal = to.r; pull = to.p; grid = to.g; render(); then?.(); }
    };
    run = r; r.raf = requestAnimationFrame(tick);
  };
  const settleBack = (v) => {
    if (!(reveal > 0 || pull > 0 || grid > 0)) return render();
    const x = grid > 0.5 ? unrubber(grid) : 0, y0v = grid > 0.5 ? rubberSlope(x) * v / grid : 0;
    const w = 2 * Math.PI / PULL.springResponse, z = PULL.springDamping, wd = w * Math.sqrt(1 - z * z), b = (y0v + z * w) / wd;
    const y = (t) => Math.exp(-z * w * t) * (Math.cos(wd * t) + b * Math.sin(wd * t));
    const sec = Math.min(1.2, Math.max(0.2, Math.log((1 + Math.abs(b)) / 0.002) / (z * w)));
    animate({ r: 0, p: 0, g: 0 }, sec * 1000, (t) => 1 - y(t * sec));
  };
  const commit = () => {
    committed = true; searchShared.committed = true;
    el.style.pointerEvents = 'auto';
    layout();
    searchShared.grid = grid + PULL.gridAway;
    animate({ r: 1, p: 0, g: grid + PULL.gridAway }, PULL.commitMs, easeOutCubic, 0, () => { input.focus({ preventScroll: true }); });
  };
  const dismiss = () => {
    if (!committed) return;
    haptics.play('selection');
    committed = false; searchShared.committed = false;
    input.blur();
    layout();
    el.style.pointerEvents = 'none';
    animate({ r: 0, p: 0, g: 0 }, PULL.exitMs, easeInOutCubic, PULL.exitDelay, () => { input.value = ''; searchShared.query = ''; searchShared.scroll = 0; filter(); list.scrollTop = 0; });
  };
  // A committed search shown at once (the copy of the launcher under a demo opened from it).
  const adopt = () => {
    committed = true; el.style.pointerEvents = 'auto';
    // Already narrowed: no transition from the wide field.
    bar.classList.add('still');
    requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('still')));
    input.value = searchShared.query; filter(); layout();
    reveal = 1; pull = 0; grid = searchShared.grid; render();
    list.scrollTop = searchShared.scroll;
  };

  // ---- the pull, on the pager ----
  const toScreen = (e) => { const r = screen.getBoundingClientRect(), k = r.width / sw || 1; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
  const down = (e) => {
    if (committed || track || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (screen.querySelector('[data-testid="web-card"]')) return;
    const caught = !!run;
    if (caught) stopRun();
    const pt = toScreen(e);
    track = { id: e.pointerId, start: pt, last: { y: pt.y, t: e.timeStamp }, v: 0, active: false, caught, target: e.target };
  };
  const move = (e) => {
    if (!track || e.pointerId !== track.id) return;
    const pt = toScreen(e), dx = pt.x - track.start.x, dy = pt.y - track.start.y, dt = (e.timeStamp - track.last.t) / 1000;
    if (dt > 0) track.v = track.v * 0.5 + ((pt.y - track.last.y) / dt) * 0.5;
    track.last = { y: pt.y, t: e.timeStamp };
    if (!track.active) {
      if (Math.abs(dx) > PULL.failX || dy < -PULL.failX) { const caught = track.caught; track = null; if (caught) settleBack(0); return; }
      if (!(dy >= PULL.activate && dy > Math.abs(dx) * 1.5)) return;
      track.active = true; armed = false;
      pullBase = grid > 0.5 ? unrubber(grid) : 0;
      try { track.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: track.id, pointerType: e.pointerType, isPrimary: true, bubbles: true })); } catch {}
    }
    e.stopImmediatePropagation(); e.preventDefault();
    const x = Math.max(0, pullBase + Math.max(0, dy) - PULL.activate), pp = damp(x);
    reveal = Math.min(pp / damp(PULL.trigger - PULL.activate), 1); pull = pp; grid = rubber(x);
    render();
    const travel = x + PULL.activate;
    if (!armed && travel > PULL.trigger) { armed = true; haptics.play('impact-light'); }
    else if (armed && travel < PULL.trigger * PULL.disarm) { armed = false; haptics.play('selection'); }
  };
  const up = (e) => {
    if (!track || e.pointerId !== track.id || !e.isTrusted) return;
    const t = track; track = null;
    if (!t.active) { if (t.caught) settleBack(0); return; }
    e.stopImmediatePropagation(); e.preventDefault();
    const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 400);
    if (e.type === 'pointerup' && (armed || t.v > PULL.flick)) { if (!armed) haptics.play('impact-light'); commit(); }
    else settleBack(e.type === 'pointerup' ? t.v : 0);
  };
  const touchmove = (e) => {
    if (!track) return;
    if (track.active) { if (e.cancelable) e.preventDefault(); }
  };
  // A trackpad's two-finger pull down (a wheel's negative deltaY) is the same pull: the travel follows the deltas,
  // and when they stop the pull lands (past the trigger) or springs back.
  let wheel = null;
  const onWheel = (e) => {
    if (committed || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || screen.querySelector('[data-testid="web-card"]')) return;
    if (!wheel && e.deltaY >= 0) return;
    if (!wheel) { stopRun(); wheel = { travel: PULL.activate, timer: 0 }; armed = false; pullBase = 0; }
    wheel.travel = Math.max(0, wheel.travel - e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.5);
    const x = Math.max(0, wheel.travel - PULL.activate), pp = damp(x);
    reveal = Math.min(pp / damp(PULL.trigger - PULL.activate), 1); pull = pp; grid = rubber(x);
    render();
    if (!armed && wheel.travel > PULL.trigger) { armed = true; haptics.play('impact-light'); }
    else if (armed && wheel.travel < PULL.trigger * PULL.disarm) armed = false;
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => { wheel = null; if (armed) commit(); else settleBack(0); }, 140);
  };

  // ---- the committed search ----
  input.addEventListener('input', () => { searchShared.query = input.value; filter(); });
  list.addEventListener('scroll', () => { if (committed) searchShared.scroll = list.scrollTop; }, { passive: true });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismiss(); else if (e.key === 'Enter') input.blur(); });
  cancel.addEventListener('click', dismiss);
  root.addEventListener('click', (e) => {
    if (!committed) return;
    const row = e.target.closest?.('.row');
    if (row) {
      haptics.play('selection');
      lastTap = { slug: row.dataset.slug, at: performance.now(), scroll: pager?.scrollLeft ?? 0 };
      event(1, row.dataset.slug);
      setTimeout(() => input.blur(), 120);
      return;
    }
    // A tap on nothing (the dim, the list's empty room) leaves the search.
    if (e.target === list || e.target === rowsBox || e.target === empty || e.composedPath()[0] === list) dismiss();
  });

  const me = {
    screen: () => screen, committed: () => committed,
    rowIcon(slug) {
      const img = rowsBox.querySelector(`.row[data-slug="${CSS.escape(slug)}"] img`);
      if (!img || !screen) return null;
      const r = img.getBoundingClientRect(), sr = screen.getBoundingClientRect(), k = sr.width / sw || 1;
      const f = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k, el: img };
      return f.y + f.h > listTop() && f.y < sh ? f : null;
    },
  };
  let waits = 0;
  const begin = () => {
    if (!el.isConnected) return ++waits < 20 ? queueMicrotask(begin) : requestAnimationFrame(begin);
    screen = el.closest('[data-testid="web-screen"]') ?? el.parentElement;
    const board = el.closest('[data-testid="springboard"]');
    pager = board?.querySelector('[data-testid="pager"]'); box = board?.querySelector('[data-testid="web-home-pull"]');
    sw = screen.offsetWidth; sh = screen.offsetHeight;
    if (box) box.style.transformOrigin = '50% 50%';
    if (pager) {
      // The pager scrolls sideways itself; a vertical pull is this view's (no browser pan takes the touch).
      pager.style.touchAction = 'pan-x';
      pager.addEventListener('pointerdown', down, true);
      pager.addEventListener('touchmove', touchmove, { capture: true, passive: false });
      // Passive: the pull's wheel needs no preventDefault (the pager does not scroll vertically), and a blocking
      // listener made every trackpad swipe of the pages wait for the main thread.
      pager.addEventListener('wheel', onWheel, { passive: true });
    }
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    searches.add(me);
    setRows(); layout();
    if (searchShared.committed) adopt(); else render();
  };
  setRows();
  begin();
  return {
    set(n) { p = n; setRows(); layout(); },
    destroy() {
      stopRun(); searches.delete(me);
      pager?.removeEventListener('pointerdown', down, true); pager?.removeEventListener('touchmove', touchmove, { capture: true }); pager?.removeEventListener('wheel', onWheel, { passive: true });
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      if (box) box.style.transform = '';
    },
  };
}

// ---- The icons' long-press menu: AppIcon.swift's context menu on the web ------------------------------------------
// A press held 0.5 s on an icon (or a right click) lifts the icon (scale 1.06 and a shadow) over a blurred, dimmed home
// and opens the menu by it: the demo's name, then Inspiration (when the demo credits one), Share and View Code. Share is
// the browser's share sheet where there is one, else the link is copied. The press that opened the menu is not a tap.
const sourceUrl = (slug) => `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`;
const MENU_ICONS = {
  sparkles: '<path d="M10 2.5L11.6 7.6L16.5 9.2L11.6 10.8L10 15.9L8.4 10.8L3.5 9.2L8.4 7.6Z" fill="currentColor" stroke="none"/><path d="M16 14.2L16.6 16L18.3 16.6L16.6 17.2L16 19L15.4 17.2L13.7 16.6L15.4 16Z" fill="currentColor" stroke="none"/>',
  share: '<path d="M10 2.8V12.5M6.6 6.1L10 2.8L13.4 6.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8.6H5.6C4.7 8.6 4 9.3 4 10.2V16C4 16.9 4.7 17.6 5.6 17.6H14.4C15.3 17.6 16 16.9 16 16V10.2C16 9.3 15.3 8.6 14.4 8.6H13" stroke-linecap="round"/>',
  code: '<path d="M5.5 2.8H11.5L15.5 6.8V16.2C15.5 16.9 14.9 17.5 14.2 17.5H5.8C5.1 17.5 4.5 16.9 4.5 16.2V3.8C4.5 3.2 4.9 2.8 5.5 2.8Z" stroke-linejoin="round"/><path d="M11.3 2.9V7H15.4M7.5 10.5H12.5M7.5 13.5H12.5" stroke-linecap="round"/>',
};
// ---- The launcher's pager on a desktop: a mouse drags the pages, a page snaps -----------------------------------
// Touch and trackpads scroll the pager natively (scroll-snap, momentum, the browser's rubber band); a mouse cannot
// scroll sideways, so a press-and-drag moves the pages with the pointer (in the frame's scaled coordinates), resists
// past the first and last page, and a release snaps one page on by the throw (or back). Arrow keys page, a tap on
// the dots pages toward its side (as iOS's page control), and the icons are loaded at once rather than lazily, so a
// page swiped to never shows empty tiles (the phone draws them predecoded).
function pagerDrive(board, screenOf) {
  const pager = board.querySelector('[data-testid="pager"]');
  if (!pager) return () => {};
  const width = () => pager.clientWidth || 1;
  const pages = () => Math.max(1, Math.round(pager.scrollWidth / width()));
  const page = () => Math.round(pager.scrollLeft / width());
  const go = (n) => { const to = Math.max(0, Math.min(pages() - 1, n)); pager.scrollTo({ left: to * width(), behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  let drag = null;
  const scale = () => { const s = screenOf(); return s ? s.getBoundingClientRect().width / (s.offsetWidth || 1) : 1; };
  const rubber = (x, d) => (1 - 1 / (Math.abs(x) * 0.55 / d + 1)) * d * Math.sign(x);
  const down = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || drag) return;
    // Sizes are read here, once: read in a move, after the last move's writes, each forced a style and layout.
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pager.scrollLeft, startPage: page(), active: false, samples: [], k: scale(), w: width(), max: (pages() - 1) * width() };
  };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k, dy = (e.clientY - drag.y) / drag.k;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 6) return;
      drag.active = true;
      pager.style.scrollSnapType = 'none';
      try { e.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.pointerId, pointerType: 'mouse', bubbles: true })); } catch {}
    }
    e.stopImmediatePropagation(); e.preventDefault();
    drag.samples.push({ t: e.timeStamp, x: dx });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
    const max = drag.max, want = drag.from - dx;
    const over = want < 0 ? want : want > max ? want - max : 0;
    pager.scrollLeft = Math.max(0, Math.min(max, want));
    const band = over ? `translateX(${-rubber(over, drag.w)}px)` : '';
    if (band !== drag.band) { pager.style.transform = band; drag.band = band; }
  };
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id || !e.isTrusted) return;
    const d = drag; drag = null;
    if (!d.active) return;
    e.stopImmediatePropagation();
    const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 400);
    const a = d.samples[0], b = d.samples.at(-1), v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) * 1000 : 0;
    const moved = d.from - pager.scrollLeft;
    let to = d.startPage;
    if (v < -300 || (Math.abs(v) <= 300 && moved < -width() / 2)) to = d.startPage + 1;
    else if (v > 300 || (Math.abs(v) <= 300 && moved > width() / 2)) to = d.startPage - 1;
    if (pager.style.transform) {
      pager.animate([{ transform: pager.style.transform }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.25,1,.35,1)' });
      pager.style.transform = '';
    }
    pager.style.scrollSnapType = '';
    go(to);
  };
  // A tap on the dots: a page toward the tapped side of the current dot.
  const dots = pager.nextElementSibling;
  const dotTap = (e) => {
    const r = dots.getBoundingClientRect(), n = pages(), at = (e.clientX - r.left) / r.width;
    const current = (page() + 0.5) / n;
    if (Math.abs(at - current) > 0.5 / n) go(page() + (at > current ? 1 : -1));
  };
  if (dots) { dots.style.cursor = 'pointer'; dots.addEventListener('click', dotTap); }
  const key = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const screen = screenOf();
    if (!screen || screen.querySelector('[data-testid="web-card"]') || !pager.offsetParent || /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    if (document.activeElement?.shadowRoot?.activeElement) return;
    e.preventDefault();
    go(page() + (e.key === 'ArrowRight' ? 1 : -1));
  };
  // Every icon now, not when its page nears the screen.
  const eager = () => { for (const img of board.querySelectorAll('[data-testid^="icon-"] img')) if (img.loading !== 'eager') { img.loading = 'eager'; img.decode?.().catch(() => {}); } };
  eager();
  const watch = new MutationObserver(eager);
  watch.observe(pager, { childList: true, subtree: true });
  pager.addEventListener('pointerdown', down, true);
  addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  addEventListener('keydown', key);
  return () => {
    watch.disconnect(); dots?.removeEventListener('click', dotTap);
    pager.removeEventListener('pointerdown', down, true);
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    removeEventListener('keydown', key);
  };
}

function iconMenu(el, props) {
  let p = props, board = null, press = null, menu = null, unpager = () => {};
  const lists = () => {
    const parts = (k) => String(p[k] ?? '').split('|');
    const slugs = parts('slugs'), names = parts('demo-names'), insp = parts('inspirations');
    return (slug) => { const i = slugs.indexOf(slug); return i < 0 ? null : { name: names[i] ?? slug, inspiration: insp[i] ?? '' }; };
  };
  const close = (animated = true) => {
    const m = menu; menu = null;
    if (!m) return;
    const done = () => { m.layer.close(); m.icon.style.visibility = ''; };
    if (!animated) return done();
    m.root.querySelector('.bd').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    m.root.querySelector('.m').animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    m.root.querySelector('.lift').animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' }).finished.then(done, done);
  };
  const toast = (layer, text) => {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:absolute;left:50%;bottom:120px;transform:translateX(-50%);padding:10px 18px;border-radius:20px;background:rgba(40,40,44,.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#fff;font:500 15px -apple-system,system-ui,sans-serif;pointer-events:none';
    layer.host.shadowRoot.append(t);
  };
  const act = (kind, slug, demo, layer) => {
    if (kind === 'inspiration') return window.open(demo.inspiration, '_blank', 'noopener');
    if (kind === 'code') return window.open(sourceUrl(slug), '_blank', 'noopener');
    const url = sourceUrl(slug), text = `${demo.name} — ${url}`;
    if (typeof navigator.share === 'function') { navigator.share({ title: demo.name, text, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => {}, () => {});
    return 'Link Copied';
  };
  const open = (button) => {
    if (menu) return;
    const slug = button.getAttribute('data-testid').slice(5), demo = lists()(slug), img = button.querySelector('img');
    if (!demo || !img) return;
    haptics.play('impact-medium');
    const layer = overlay(el);
    layer.host.style.pointerEvents = 'auto';
    const root = layer.host.attachShadow({ mode: 'open' });
    const hr = layer.host.getBoundingClientRect(), W = layer.host.offsetWidth, H = layer.host.offsetHeight, k = hr.width / W || 1;
    const r = img.getBoundingClientRect(), f = { x: (r.left - hr.left) / k, y: (r.top - hr.top) / k, w: r.width / k, h: r.height / k };
    const rows = [...(demo.inspiration ? [['inspiration', 'Inspiration', 'sparkles']] : []), ['share', 'Share', 'share'], ['code', 'View Code', 'code']];
    root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}
.bd{position:absolute;inset:0;background:rgba(0,0,0,.22);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%)}
.lift{position:absolute;border-radius:${f.w * K.iconRadiusRatio}px;box-shadow:0 14px 34px rgba(0,0,0,.42),0 3px 8px rgba(0,0,0,.25);transform:scale(1.06);will-change:transform}
.m{position:absolute;width:250px;border-radius:14px;overflow:hidden;background:rgba(48,48,52,.72);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 18px 50px rgba(0,0,0,.35);color:#fff;will-change:transform,opacity}
.t{padding:10px 16px 8px;font-size:13px;color:rgba(235,235,245,.6);text-align:center;border-bottom:.5px solid rgba(255,255,255,.14)}
.r{all:unset;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;padding:11px 16px;font-size:17px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.12)}
.r:last-child{border-bottom:0}.r:active,.r:hover{background:rgba(255,255,255,.1)}.r svg{flex-shrink:0}</style>
<div class="bd"></div><img class="lift" alt=""><div class="m" role="menu"><div class="t"></div>${rows.map(([id, title, ic]) => `<button class="r" role="menuitem" data-k="${id}"><span>${title}</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7">${MENU_ICONS[ic]}</svg></button>`).join('')}</div>`;
    root.querySelector('.t').textContent = demo.name;
    const lift = root.querySelector('.lift');
    lift.src = img.currentSrc || img.src;
    Object.assign(lift.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    const m = root.querySelector('.m'), mh = 44 + rows.length * 45, gap = 14;
    const below = f.y + f.h * 1.03 + gap + mh < H - 40;
    // Its leading edge on the icon's on the left half of the screen, its trailing edge on the icon's on the right.
    const left = Math.min(Math.max(16, f.x + f.w / 2 < W / 2 ? f.x : f.x + f.w - 250), W - 266);
    m.style.left = `${left}px`;
    m.style.top = `${below ? f.y + f.h * 1.03 + gap : f.y - f.h * 0.03 - gap - mh}px`;
    m.style.transformOrigin = `${f.x + f.w / 2 - left}px ${below ? 0 : mh}px`;
    img.style.visibility = 'hidden';
    root.querySelector('.bd').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    lift.animate([{ transform: 'scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' }, { transform: 'scale(1.06)' }], { duration: 320, easing: 'cubic-bezier(.32,.72,0,1)' });
    m.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
    menu = { layer, root, icon: img };
    root.querySelector('.bd').addEventListener('click', () => close());
    lift.addEventListener('click', () => close());
    for (const b of root.querySelectorAll('.r')) b.addEventListener('click', () => {
      haptics.play('selection');
      const said = act(b.dataset.k, slug, demo, layer);
      if (said) { toast(layer, said); setTimeout(() => close(), 700); } else close();
    });
  };
  const iconAt = (e) => { const b = e.target?.closest?.('[data-testid^="icon-"]'); return b && board?.contains(b) ? b : null; };
  const swallowClick = () => {
    const swallow = (c) => { c.stopImmediatePropagation(); c.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 600);
  };
  const down = (e) => {
    if (menu || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const b = iconAt(e);
    if (!b) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, b, timer: setTimeout(() => { if (press) { press.fired = true; open(b); } }, 500) };
  };
  const move = (e) => { if (press && e.pointerId === press.id && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; } };
  const up = (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    if (press.fired) { e.stopImmediatePropagation(); swallowClick(); }
    press = null;
  };
  const context = (e) => { const b = iconAt(e); if (!b) return; e.preventDefault(); if (press) { clearTimeout(press.timer); press = null; } open(b); };
  const key = (e) => { if (e.key === 'Escape' && menu) close(); };
  let waits = 0;
  const begin = () => {
    if (!el.isConnected) return ++waits < 20 ? queueMicrotask(begin) : requestAnimationFrame(begin);
    board = el.closest('[data-testid="springboard"]');
    if (!board) return;
    unpager = pagerDrive(board, () => el.closest('[data-testid="web-screen"]'));
    board.addEventListener('pointerdown', down, true);
    board.addEventListener('contextmenu', context, true);
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    addEventListener('keydown', key);
  };
  begin();
  return {
    set(n) { p = n; },
    destroy() {
      close(false); unpager();
      board?.removeEventListener('pointerdown', down, true); board?.removeEventListener('contextmenu', context, true);
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      removeEventListener('keydown', key);
    },
  };
}

// ---- Motion: modules/apple/MotionFeed.swift and the iPhone's startSensorInput, on the web --------------------------
// `motion-feed` writes a sensor's samples straight into a GPU canvas's input while the node is on the page, through the
// GPU module's own sensor path (`exact.gpu.sensors`, the events `startSensorInput` would feed): `gravity` (W3C
// GravitySensor units and sign, m/s², face up z = +9.81: Linear Sensors) or `relativeOrientation` (a quaternion
// [x, y, z, w]: Threads Holo Ticket, Card Shader Reflections). Sources, best first: the Generic Sensor classes
// (Chromium on Android), else `devicemotion` / `deviceorientation` (iOS Safari asks permission on the first tap inside
// the demo: DeviceMotionEvent.requestPermission must run in a press). A desktop has neither: the pointer's place over
// the screen tilts the phone (centre is the phone at rest), so the framed mockup still shows the effect.
const G = 9.80665;
const webkitMotion = () => typeof DeviceOrientationEvent === 'function' && 'webkitCompassHeading' in DeviceOrientationEvent.prototype;
// Device Orientation's alpha, beta, gamma (degrees, Z-X'-Y'') as a quaternion (@exact/motion's, Orientation Sensor §6.1).
const quaternionFromAngles = (alpha, beta, gamma) => {
  const d = Math.PI / 360, a = (alpha ?? 0) * d, b = (beta ?? 0) * d, g = (gamma ?? 0) * d;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return [sb * cg * ca - cb * sg * sa, cb * sg * ca + sb * cg * sa, cb * cg * sa + sb * sg * ca, cb * cg * ca - sb * sg * sa];
};
let motionAsked = null;
// iOS Safari's prompt, from inside a press (both events' requestPermission in the same turn, as @exact/motion does).
const askMotion = () => {
  if (motionAsked) return motionAsked;
  const asks = [];
  if (typeof DeviceMotionEvent?.requestPermission === 'function') asks.push(DeviceMotionEvent.requestPermission());
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') asks.push(DeviceOrientationEvent.requestPermission());
  motionAsked = Promise.allSettled(asks);
  return motionAsked;
};
const needsAsk = () => typeof DeviceMotionEvent?.requestPermission === 'function' || typeof DeviceOrientationEvent?.requestPermission === 'function';

function motionFeed(el, props) {
  let p = props, stops = [], last = 0, live = false, real = false, mouse = null, raf = 0;
  const surface = () => String(p.feed ?? ''), sensor = () => (p.sensor === 'relativeOrientation' ? 'relativeOrientation' : 'gravity');
  const period = () => 1000 / Math.max(1, Number(p.frequency) || 50);
  const write = (values, force = false) => {
    const now = performance.now();
    if (!force && now - last < period() * 0.5) return;
    last = now;
    const gpu = globalThis.exact?.gpu;
    if (!gpu?.sensors || !surface()) return;
    gpu.sensors([{ surface: surface(), event: JSON.stringify({ t: 'sensor', sensor: sensor(), values: [...values, 0, 0, 0, 0].slice(0, 4), dropped: 0, at: globalThis.exact?.now?.() ?? now }) }]);
  };
  const fromAngles = (beta, gamma) => {
    if (sensor() === 'relativeOrientation') return quaternionFromAngles(0, beta, gamma);
    const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
    return [-G * Math.sin(g) * Math.cos(b), G * Math.sin(b), G * Math.cos(g) * Math.cos(b)];
  };
  // The device's own readings: the first one ends the pointer's stand-in.
  const sample = (values) => { if (!real) { real = true; stopMouse(); } write(values); };
  const startDevice = (events = false) => {
    const name = sensor();
    const Class = name === 'gravity' ? globalThis.GravitySensor : globalThis.RelativeOrientationSensor;
    if (typeof Class === 'function' && !events) {
      try {
        const s = new Class({ frequency: Number(p.frequency) || 50 });
        s.addEventListener('reading', () => sample(name === 'gravity' ? [s.x, s.y, s.z] : [...s.quaternion]));
        // No such sensor here (or not allowed): the events, which a browser without one still sends where it can.
        s.addEventListener('error', () => { s.stop(); if (live) startDevice(true); });
        s.start();
        stops.push(() => s.stop());
        return;
      } catch {}
    }
    if (name === 'gravity') {
      const on = (e) => {
        const a = e.accelerationIncludingGravity;
        if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) return;
        const k = webkitMotion() ? -1 : 1;
        sample([a.x * k, a.y * k, a.z * k]);
      };
      addEventListener('devicemotion', on);
      stops.push(() => removeEventListener('devicemotion', on));
    } else {
      const on = (e) => { if ([e.alpha, e.beta, e.gamma].every((n) => typeof n === 'number')) sample(quaternionFromAngles(e.alpha, e.beta, e.gamma)); };
      addEventListener('deviceorientation', on);
      stops.push(() => removeEventListener('deviceorientation', on));
    }
  };
  // The pointer over the screen as the phone's tilt: centre is the phone at rest (flat for an attitude, held at 45°
  // for gravity), the edges ±30° of pitch and ±40° of roll.
  const pointer = (e) => {
    if (real || e.pointerType === 'touch') return;
    const screen = el.closest('[data-testid="web-device"]') ?? document.documentElement, r = screen.getBoundingClientRect();
    mouse = { x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)) };
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      if (!mouse || real) return;
      const rest = sensor() === 'gravity' ? 45 : 0;
      write(fromAngles(rest - mouse.y * 30, mouse.x * 40), true);
    });
  };
  const stopMouse = () => { removeEventListener('pointermove', pointer, true); cancelAnimationFrame(raf); raf = 0; };
  const press = () => { askMotion().then(() => { if (live) { stopDevice(); startDevice(); } }); };
  const stopDevice = () => { for (const f of stops.splice(0)) f(); };
  const start = () => {
    if (live || !surface()) return;
    live = true;
    startDevice();
    if (needsAsk()) { addEventListener('pointerdown', press, { capture: true, once: true }); stops.push(() => removeEventListener('pointerdown', press, true)); }
    addEventListener('pointermove', pointer, true);
    // At rest until the first reading or the pointer moves.
    const rest = sensor() === 'gravity' ? 45 : 0;
    setTimeout(() => { if (live && !real && !mouse) write(fromAngles(rest, 0), true); }, 60);
  };
  const stop = () => {
    if (!live) return;
    live = false;
    stopDevice(); stopMouse();
    globalThis.exact?.gpu?.sensors?.([{ surface: surface(), event: JSON.stringify({ t: 'sensorEnded', sensor: sensor(), at: globalThis.exact?.now?.() ?? performance.now() }) }]);
  };
  start();
  return {
    set(n) { const changed = n.feed !== p.feed || n.sensor !== p.sensor || n.frequency !== p.frequency; if (changed) { stop(); p = n; start(); } else p = n; },
    destroy: stop,
  };
}

const views = {
  // A glass (or blur) pane behind other content.
  'glass-pane'(el, props) {
    const box = shadow(el, '');
    const draw = (p) => {
      const clear = p['glass-style'] === 'clear', none = p['glass-style'] === 'none', light = p.scheme === 'light';
      const r = p['corner-size'] === 'capsule' ? '9999px' : `${num(p['corner-size'], 0)}px`;
      // Clear glass shows its tint at about half its alpha, with no wash and a light saturation: liquid-glass-
      // playground's rgba(0,0,0,.5) over its photo reads 0.76 / 0.83 / 0.63 of the photo's mean r / g / b on the iPhone.
      const tintColor = p['pane-tint'] && clear ? `color-mix(in srgb, ${p['pane-tint']} 50%, transparent)` : p['pane-tint'];
      const tint = tintColor ? `linear-gradient(${tintColor}, ${tintColor}),` : '';
      const fill = none ? 'transparent' : light ? 'rgba(255,255,255,.55)' : clear ? 'transparent' : 'rgba(40,40,44,.5)';
      const filter = `blur(${clear ? 10 : 22}px) saturate(${clear ? 120 : 180}%)`;
      box.style.cssText = `position:absolute;inset:0;border-radius:${r};background:${tint}${fill ? `linear-gradient(${fill},${fill})` : ''};` +
        (none ? '' : `backdrop-filter:${filter};-webkit-backdrop-filter:${filter};box-shadow:0 8px 24px rgba(0,0,0,.12),inset 0 0 0 .5px rgba(255,255,255,${light ? .6 : .25})`);
    };
    draw(props);
    return { set: draw };
  },
  // A round glass button with an SF symbol; `edge` is the bar side it sits on (no effect here).
  'glass-button'(el, props, event) {
    const box = shadow(el, 'button{all:unset;cursor:pointer;position:absolute;inset:0;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s}button:active{transform:scale(.92)}');
    const b = document.createElement('button');
    b.setAttribute('role', 'button');
    b.style.cssText = GLASS;
    b.addEventListener('click', () => event(0));
    box.append(b);
    const draw = (p) => { b.innerHTML = icon(p.symbol === 'chevron.backward' ? 'chevron.backward' : p.symbol ?? 'xmark'); b.setAttribute('aria-label', p.caption ?? ''); };
    draw(props);
    return { set: draw };
  },
  // A progressive blur: the radius runs along the height by a ramp, drawn as three stacked blurs under masks.
  'variable-blur'(el, props) {
    const box = shadow(el, '');
    box.style.pointerEvents = 'none';
    const layers = [0.25, 0.5, 1].map(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; box.append(d); return d; });
    const draw = (p) => {
      const radius = num(p['blur-radius'], 20), from = num(p['ramp-from'], 0) * 100, to = num(p['ramp-to'], 1) * 100, up = p['ramp-up'] === 'true';
      const dir = up ? 'to top' : 'to bottom', span = Math.max(1, to - from);
      layers.forEach((d, i) => {
        const a = from + span * (i / 3), b = from + span * ((i + 1) / 3 + (i === 2 ? 0 : 0.35)), c = Math.min(100, b + span * 0.4);
        const mask = `linear-gradient(${dir}, transparent ${a}%, #000 ${Math.min(100, b)}%, #000 ${i === 2 ? 100 : c}%, ${i === 2 ? '#000' : 'transparent'} 100%)`;
        d.style.cssText = `position:absolute;inset:0;backdrop-filter:blur(${radius * [0.25, 0.55, 1][i]}px);-webkit-backdrop-filter:blur(${radius * [0.25, 0.55, 1][i]}px);-webkit-mask-image:${mask};mask-image:${mask}`;
      });
    };
    draw(props);
    return { set: draw };
  },
  // Numbers that roll: each changed character slides in the direction of the change.
  'rolling-count'(el, props, event) {
    const box = shadow(el, '.t{position:absolute;white-space:pre;display:flex;line-height:1;font-variant-numeric:tabular-nums}.c{display:inline-block;overflow:visible}');
    const t = document.createElement('div');
    t.className = 't';
    box.append(t);
    let text = null, last = {};
    const draw = (p) => {
      const top = p.anchor === 'top-leading';
      // A bundled face: the host declares it as `ExactPlanStack<i>`, not under its PostScript name, and the
      // iPhone draws it as is (`.custom(family, fixedSize:)`), so its own weight, not the rounded bold.
      const face = p.family ? bundledFace(p.family) : null;
      const family = face ? `"${face}", ` : p.family ? `"${p.family}", ` : '';
      const weight = face ? 400 : { ultraLight: 200, thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 }[p.weight] ?? 700;
      const design = { default: 'system-ui', rounded: 'ui-rounded, "SF Pro Rounded", system-ui', monospaced: 'ui-monospace, monospace', serif: 'ui-serif, serif' }[p.design] ?? 'ui-rounded, "SF Pro Rounded", system-ui';
      t.style.cssText = `font:${weight} ${num(p.points, 17)}px/1 ${family}${design};letter-spacing:${num(p.tracking, 0)}px;color:${p.tint ?? '#000'};` +
        (top ? 'left:0;top:0' : 'left:0;right:0;top:0;justify-content:center;text-align:center');
      const next = p.count ?? '';
      if (next !== text) {
        const down = p.down === 'true', secs = num(p.seconds, 0.3), delay = num(p.delay, 0) * 1000;
        const old = text ?? '';
        const chars = [...next];
        t.replaceChildren(...chars.map((ch, i) => {
          const s = document.createElement('span');
          s.className = 'c'; s.textContent = ch;
          if (text !== null && ch !== [...old][i]) {
            const dy = (down ? -1 : 1) * num(p.points, 17) * 0.55;
            s.animate([{ transform: `translateY(${dy}px)`, opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
              { duration: secs * 1000, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
          }
          return s;
        }));
        text = next;
      }
      last = p;
    };
    draw(props);
    queueMicrotask(() => event(8, 'rolling-count:2'));
    return { set: draw };
  },
  // A slider: the filled track, the unfilled track from the thumb's edge, a glass capsule thumb that widens when held.
  'swift-slider'(el, props, event) {
    const box = shadow(el, '.k{position:absolute;inset:0;touch-action:none;cursor:pointer}.f,.u{position:absolute;top:12.3px;height:6px;border-radius:3px}.th{position:absolute;top:1px;height:28px;border-radius:14px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.28),0 0 0 .5px rgba(0,0,0,.08);transition:width .18s,margin .18s}');
    const k = document.createElement('div'), f = document.createElement('div'), u = document.createElement('div'), th = document.createElement('div');
    k.className = 'k'; f.className = 'f'; u.className = 'u'; th.className = 'th';
    f.style.background = '#0a84ff';
    k.append(u, f, th); box.append(k);
    k.setAttribute('role', 'slider');
    let value = 0, held = false;
    const draw = () => {
      const w = el.clientWidth, half = held ? 33 : 18.5, c = 18.5 + value * (w - 37);
      f.style.cssText += `;left:0;width:${c}px`;
      u.style.cssText += `;left:${c + half}px;right:0;display:${c + half < w ? 'block' : 'none'}`;
      th.style.cssText += `;left:${c - half}px;width:${half * 2}px`;
      k.setAttribute('aria-valuenow', String(value));
    };
    const move = (e) => {
      const r = el.getBoundingClientRect(), s = r.width / (el.clientWidth || 1);
      const x = (e.clientX - r.left) / s;
      const v = Math.min(1, Math.max(0, (x - 18.5) / (el.clientWidth - 37)));
      if (v !== value) { value = v; draw(); event(1, String(v)); }
    };
    k.addEventListener('pointerdown', (e) => { held = true; k.setPointerCapture(e.pointerId); move(e); draw(); });
    k.addEventListener('pointermove', (e) => { if (held) move(e); });
    const up = () => { held = false; draw(); };
    k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
    const set = (p) => {
      f.style.background = '#0a84ff';
      u.style.background = p['max-track-tint'] && p['max-track-tint'] !== '#00000000' ? p['max-track-tint'] : 'rgba(60,60,67,.18)';
      if (p.progress !== undefined && !held) value = Math.min(1, Math.max(0, num(p.progress, value)));
      draw();
    };
    set(props);
    new ResizeObserver(draw).observe(el);
    return { set };
  },
  // The checkmate crescendo: the phone's vibration motor where there is one.
  'mate-haptic'(el, props) {
    let played = props.plays, stopped = props.stops;
    return { set(p) {
      if (p.plays !== played) { played = p.plays; navigator.vibrate?.([30, 40, 30, 60, 80, 90, 120, 40, 60, 160]); }
      if (p.stops !== stopped) { stopped = p.stops; navigator.vibrate?.(0); }
    } };
  },
  // A sheet of switches over the demo.
  'toggle-sheet'(el, props, event) {
    let layer = null, p = props, switches = null;
    const close = () => { layer?.close(); layer = null; };
    const open = () => {
      if (layer) return;
      layer = overlay(el);
      const rows = String(p.switches ?? '').split('|').filter(Boolean).map((r) => { const [id, on, ...l] = r.split(':'); return { id, on: on === '1' || on === 'true', label: l.join(':') }; });
      const tint = p['switch-tint'] ?? '#34c759';
      const root = layer.host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}.s{position:absolute;inset:0;background:rgba(0,0,0,.4);pointer-events:auto;animation:f .25s both}.p{position:absolute;left:0;right:0;bottom:0;background:#1c1c1e;color:#fff;border-radius:38px 38px 0 0;padding:28px 22px 44px;pointer-events:auto;animation:u .38s cubic-bezier(.32,.72,0,1) both}.g{position:absolute;top:8px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:3px;background:#555}h2{font-size:20px;font-weight:600;text-align:center;margin:6px 0 22px}.r{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;font-size:17px}.w{width:51px;height:31px;border-radius:16px;background:#39393d;position:relative;transition:background .2s;cursor:pointer}.w::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.w.on::after{transform:translateX(20px)}@keyframes f{from{opacity:0}}@keyframes u{from{transform:translateY(100%)}}</style><div class="s"></div><div class="p"><div class="g"></div><h2></h2></div>`;
      root.querySelector('h2').textContent = p.caption ?? '';
      const panel = root.querySelector('.p');
      switches = new Map();
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'r';
        const label = document.createElement('span'); label.textContent = r.label;
        const sw = document.createElement('div'); sw.setAttribute('role', 'switch');
        const show = (on) => { r.on = on; sw.className = 'w' + (on ? ' on' : ''); sw.style.background = on ? tint : ''; sw.setAttribute('aria-checked', String(on)); };
        show(r.on);
        // A flip plays the selection haptic, as ToggleSheet.swift's Toggle does.
        sw.addEventListener('click', () => { show(!r.on); haptics.play('selection'); event(1, `${r.id}:${r.on}`); });
        switches.set(r.id, show);
        row.append(label, sw); panel.append(row);
      }
      // A drag down on the panel (not on a switch) follows the finger and dismisses past a third of it or on a flick, as
      // the iPhone's sheet; short of that it springs back.
      panel.style.touchAction = 'none';
      panel.addEventListener('pointerdown', (e) => {
        if (e.target.closest?.('[role="switch"]')) return;
        const y0 = e.clientY, k = panel.getBoundingClientRect().height / panel.offsetHeight || 1;
        let dy = 0, last = [performance.now(), 0], v = 0;
        panel.setPointerCapture(e.pointerId); panel.style.animation = 'none'; panel.style.transition = 'none';
        const move = (m) => { dy = Math.max(0, (m.clientY - y0) / k); const t = performance.now(); v = (dy - last[1]) / Math.max(1, t - last[0]); last = [t, dy]; panel.style.transform = `translateY(${dy}px)`; };
        const up = () => {
          panel.removeEventListener('pointermove', move); panel.removeEventListener('pointerup', up); panel.removeEventListener('pointercancel', up);
          panel.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
          if (dy > panel.offsetHeight / 3 || (v > 0.5 && dy > 12)) { panel.style.transform = 'translateY(100%)'; root.querySelector('.s').style.opacity = '0'; setTimeout(() => { close(); event(1, 'dismissed'); }, 250); }
          else panel.style.transform = '';
        };
        panel.addEventListener('pointermove', move); panel.addEventListener('pointerup', up); panel.addEventListener('pointercancel', up);
      });
      // Only a press that began on the scrim dismisses: the double tap that opened the sheet ends (its click) on it.
      const scrim = root.querySelector('.s');
      let pressed = false;
      scrim.addEventListener('pointerdown', () => { pressed = true; });
      scrim.addEventListener('click', () => { if (!pressed) return; pressed = false; close(); event(1, 'dismissed'); });
    };
    // While it is up the rows follow the props, as the iPhone's model does (light-on-painting's Cord turns off with
    // the Bulb).
    const set = (n) => {
      p = n;
      if (layer && switches) for (const r of String(n.switches ?? '').split('|').filter(Boolean)) { const [id, on] = r.split(':'); switches.get(id)?.(on === '1' || on === 'true'); }
      n.open === 'true' ? open() : close();
    };
    set(props);
    return { set, destroy: close };
  },
  // A round glass ellipsis button that opens movement > painter > painting.
  'painting-menu'(el, props, event) {
    const box = shadow(el, 'button{all:unset;cursor:pointer;position:absolute;right:0;top:0;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s}button:active{transform:scale(.92)}');
    const b = document.createElement('button');
    b.style.cssText = GLASS; b.innerHTML = icon('ellipsis'); b.setAttribute('aria-label', 'Choose a painting');
    box.append(b);
    let p = props, layer = null;
    const tree = () => { const out = []; for (const e of String(p.items ?? '').split('|')) { const [k, id, ...n] = e.split(' '); const node = { id, name: n.join(' '), kids: [] }; if (k === 'm') out.push(node); else if (k === 'p' && out.length) out.at(-1).kids.push(node); else if (k === 't' && out.at(-1)?.kids.length) out.at(-1).kids.at(-1).kids.push(node); } return out; };
    const close = () => { layer?.close(); layer = null; };
    b.addEventListener('click', () => {
      if (layer) return close();
      layer = overlay(el);
      const r = b.getBoundingClientRect(), root = layer.host.attachShadow({ mode: 'open' });
      const dev = layer.host.getBoundingClientRect(), s = dev.width / 420;
      root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}.s{position:absolute;inset:0;pointer-events:auto}.m{position:absolute;width:260px;max-height:70%;overflow:auto;background:rgba(44,44,46,.82);backdrop-filter:blur(30px) saturate(180%);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);color:#fff;pointer-events:auto;animation:i .2s cubic-bezier(.2,.8,.2,1) both;transform-origin:top right}.i{display:flex;align-items:center;gap:8px;padding:12px 16px;font-size:17px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.12)}.i:active{background:rgba(255,255,255,.12)}.i b{width:18px;font-weight:600}.i span{flex:1}@keyframes i{from{opacity:0;transform:scale(.9)}}</style><div class="s"></div><div class="m"></div>`;
      const m = root.querySelector('.m');
      m.style.right = `${420 - ((r.right - dev.left) / s)}px`; m.style.top = `${(r.bottom - dev.top) / s + 8}px`;
      const stack = [];
      const show = (title, items) => {
        m.replaceChildren();
        if (stack.length) { const back = document.createElement('div'); back.className = 'i'; back.innerHTML = '<b>‹</b><span></span>'; back.querySelector('span').textContent = title; back.onclick = () => { stack.pop(); const [t, i] = stack.at(-1) ?? ['', null]; stack.length ? show(t, i) : top(); }; m.append(back); }
        for (const it of items) {
          const row = document.createElement('div'); row.className = 'i';
          // A painting (the tree's leaves, `kids` empty) or Default is picked; a movement or a painter opens its menu.
          const leaf = !it.kids?.length;
          row.innerHTML = `<b>${leaf && (p.selected ?? '') === it.id ? '✓' : ''}</b><span></span>${leaf ? '' : '<b style="text-align:right">›</b>'}`;
          row.querySelector('span').textContent = it.name;
          row.onclick = () => { if (leaf) { close(); event(1, it.id); } else { stack.push([it.name, it.kids]); show(it.name, it.kids); } };
          m.append(row);
        }
      };
      const top = () => show('', [{ id: '', name: 'Default' }, ...tree()]);
      top();
      root.querySelector('.s').addEventListener('click', close);
    });
    return { set(n) { p = n; }, destroy: close };
  },
  // Plays the demo's track: its length, its loudness by slice, its clock and its end, as messages.
  'audio-track'(el, props, event) {
    const audio = new Audio();
    audio.preload = 'auto';
    let file = null, token = null, want = false, timer = null;
    const url = (f) => new URL(f, document.baseURI).href;
    const load = async (f) => {
      file = f; audio.src = url(f);
      audio.onerror = () => event(8, `missing:${f}`);
      audio.onloadedmetadata = () => event(8, `ready:${audio.duration}`);
      audio.onended = () => { event(8, 'ended:'); clearInterval(timer); };
      try {
        const buf = await (await fetch(url(f))).arrayBuffer();
        const data = (await new (globalThis.AudioContext ?? globalThis.webkitAudioContext)().decodeAudioData(buf)).getChannelData(0);
        const n = 50, step = Math.floor(data.length / n), lv = [];
        for (let i = 0; i < n; i++) { let s = 0; for (let j = i * step; j < (i + 1) * step; j += 16) s += data[j] * data[j]; lv.push(Math.sqrt(s / (step / 16))); }
        const max = Math.max(...lv) || 1;
        event(8, 'wave:' + lv.map((v) => (v / max).toFixed(3)).join(','));
      } catch {}
    };
    const set = (p) => {
      const f = p.file || 'assets/audio/track.m4a';
      if (f !== file) load(f);
      const seek = p.seek;
      if (seek?.includes(':')) { const [t, s] = [seek.slice(0, seek.indexOf(':')), Number(seek.slice(seek.indexOf(':') + 1))]; if (t !== token) { token = t; if (Number.isFinite(s)) audio.currentTime = s; } }
      const w = (p['play-state'] ?? p.playing) === 'true';
      if (w !== want) {
        want = w;
        if (w) { audio.play().catch(() => {}); clearInterval(timer); timer = setInterval(() => event(8, `time:${audio.currentTime}`), 500); }
        else { audio.pause(); clearInterval(timer); }
      }
    };
    set(props);
    return { set, destroy() { audio.pause(); clearInterval(timer); audio.src = ''; } };
  },
  // The bottom tab bar: a floating glass capsule.
  'native-tabbar'(el, props, event) {
    const box = shadow(el, '.b{position:absolute;left:16px;right:16px;bottom:22px;height:62px;border-radius:31px;display:flex;align-items:stretch;padding:4px;color:#fff;font:600 10px -apple-system,system-ui,sans-serif}.t{all:unset;cursor:pointer;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:27px;color:rgba(255,255,255,.62);transition:background .2s,color .2s}.t.on{background:rgba(255,255,255,.14)}');
    const bar = document.createElement('div');
    bar.className = 'b'; bar.style.cssText = GLASS;
    box.append(bar);
    const draw = (p) => {
      const titles = String(p['tab-titles'] ?? '').split('|'), symbols = String(p['tab-symbols'] ?? '').split('|'), sel = num(p['selected-tab'], 0);
      bar.replaceChildren(...titles.map((t, i) => {
        const b = document.createElement('button');
        b.className = 't' + (i === sel ? ' on' : ''); b.innerHTML = icon(symbols[i], 22); b.append(t);
        if (i === sel && p['tab-tint']) b.style.color = p['tab-tint'];
        b.addEventListener('click', () => event(1, `tab:${i}`));
        return b;
      }));
    };
    draw(props);
    return { set: draw };
  },
};
views['music-tabbar'] = views['native-tabbar'];
views['demo-card'] = launch;
views['search-reveal'] = searchReveal;
views['icon-grid'] = iconMenu;
views['motion-feed'] = motionFeed;

export function create(tag, element, json, event) {
  const props = JSON.parse(json);
  const make = views[tag];
  if (!make) { shadow(element, ''); return {}; }
  return make(element, props, event) ?? {};
}
export function setProps(h, json) { h.set?.(JSON.parse(json)); }
export function snapshot() {}
export function destroy(h) { h.destroy?.(); }
