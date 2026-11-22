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

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };
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


// ---- Haptics: the phone's motor where the browser has one (Android's `navigator.vibrate`; iOS Safari has none) ----
// The iOS feedback generators as pulse lengths (gpu/src/haptic.rs's kinds): selection 5 ms, light 8, medium 12, heavy
// 18, the notifications two or three pulses. A buzz within 150 ms of the last is dropped, as a drag's ticks would
// otherwise each cut the one before short. Contract's `haptic()` reaches the runtime's own vibrate(5 | 12)
// (host/web-js/commands.js), paced here too; a surface's `haptic:<kind>` messages (kept as kinds in the web's GPU
// module) are played here and never reach the app, as the iPhone's host consumes them.
const HAPTIC = {
  selection: 5, tick: 5, 'impact-light': 8, grab: 8, 'impact-soft': 8, release: 8, 'impact-medium': 12, impact: 12,
  'impact-rigid': 12, limit: 12, 'impact-heavy': 18, success: [8, 70, 14], warning: [14, 90, 8], error: [12, 50, 12, 80, 16],
};
const vibrate = typeof navigator.vibrate === 'function' ? navigator.vibrate.bind(navigator) : null;
let lastBuzz = -1e9;
const paced = (pattern) => {
  const now = performance.now();
  if (now - lastBuzz < 150) return true;
  lastBuzz = now;
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
hookMessages();

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
document.addEventListener('pointerdown', noteTap, true);
document.addEventListener('click', noteTap, true);
// A demo's card draws only once its launch has placed it: the route's first frame can paint before this module's view
// is made, which showed the demo full screen for a frame ahead of the open.
{
  const sheet = document.createElement('style');
  sheet.textContent = '[data-testid="web-card"]:not([data-launched]){visibility:hidden}';
  document.head.append(sheet);
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      radius: `${q.radius / sx}px / ${q.radius / sy}px`,
      content: `scale(1,${sx / sy})`,
      art: String(q.art), home: `scale(${q.hs})`, dim: String(q.dim), blur: String(q.blur),
    };
  };
  const put = (q) => {
    const st = styles(q);
    card.style.transform = st.card; card.style.borderRadius = st.radius; content.style.transform = st.content;
    art.style.opacity = st.art; zoom.style.transform = st.home; dim.style.opacity = st.dim; blur.style.opacity = st.blur;
  };
  const behind = (on) => {
    blur.style.visibility = on ? 'visible' : 'hidden';
    for (const e of [card, content, zoom, dim, blur]) e.style.willChange = on ? (e === dim || e === blur ? 'opacity' : 'transform') : '';
  };
  // At rest the card is the screen: no transform, no clip radius (the frame's display rounds it), the blur off.
  const rest = () => {
    card.style.transform = 'none'; card.style.borderRadius = framed() ? '' : '0'; content.style.transform = 'none'; art.style.opacity = '0';
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
      card.animate(ls.map((l) => ({ transform: l.card })), o), card.animate(ls.map((l) => ({ borderRadius: l.radius })), o),
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
    art.src = new URL(p.art ?? '', document.baseURI).href;
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
    const img = screen.querySelector(`[data-testid="icon-${CSS.escape(p.slug)}"] img`);
    iconFrame = null;
    if (!img) return;
    const f = frameIn(img, screen);
    if (f.w > 0 && f.x + f.w > 0 && f.x < sw && f.y + f.h > 0 && f.y < sh) { iconFrame = f; icon = img; iconRadius = f.w * K.iconRadiusRatio; }
  };

  // The close: from wherever the card shows, into its icon (or a fade when the icon is not on the page).
  const close = (velocity) => {
    if (closing || !screen) return;
    closing = true;
    haptics.play('impact-medium');
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
    event(1, 'landed');
  };

  begin();
  return {
    set(n) { const was = p.closing; p = n; if (n.closing === 'true' && was !== 'true') close(); },
    destroy() { stopFlight(); if (icon) icon.style.visibility = ''; },
  };
}

const views = {
  // A glass (or blur) pane behind other content.
  'glass-pane'(el, props) {
    const box = shadow(el, '');
    const draw = (p) => {
      const clear = p['glass-style'] === 'clear', none = p['glass-style'] === 'none', light = p.scheme === 'light';
      const r = p['corner-size'] === 'capsule' ? '9999px' : `${num(p['corner-size'], 0)}px`;
      const tint = p['pane-tint'] ? `linear-gradient(${p['pane-tint']}, ${p['pane-tint']}),` : '';
      const fill = none ? 'transparent' : light ? 'rgba(255,255,255,.55)' : clear ? 'rgba(255,255,255,.08)' : 'rgba(40,40,44,.5)';
      box.style.cssText = `position:absolute;inset:0;border-radius:${r};background:${tint}${fill ? `linear-gradient(${fill},${fill})` : ''};` +
        (none ? '' : `backdrop-filter:blur(${clear ? 10 : 22}px) saturate(180%);-webkit-backdrop-filter:blur(${clear ? 10 : 22}px) saturate(180%);box-shadow:0 8px 24px rgba(0,0,0,.12),inset 0 0 0 .5px rgba(255,255,255,${light ? .6 : .25})`);
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
      const family = p.family ? `"${p.family}", ` : '';
      const weight = { ultraLight: 200, thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 }[p.weight] ?? 700;
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
    let layer = null, p = props;
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
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'r';
        const label = document.createElement('span'); label.textContent = r.label;
        const sw = document.createElement('div'); sw.className = 'w' + (r.on ? ' on' : ''); sw.setAttribute('role', 'switch');
        if (r.on) sw.style.background = tint;
        sw.addEventListener('click', () => { r.on = !r.on; sw.classList.toggle('on', r.on); sw.style.background = r.on ? tint : ''; event(1, `${r.id}:${r.on}`); });
        row.append(label, sw); panel.append(row);
      }
      root.querySelector('.s').addEventListener('click', () => { close(); event(1, 'dismissed'); });
    };
    const set = (n) => { p = n; n.open === 'true' ? open() : close(); };
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
          const leaf = !it.kids;
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

export function create(tag, element, json, event) {
  const props = JSON.parse(json);
  const make = views[tag];
  if (!make) { shadow(element, ''); return {}; }
  return make(element, props, event) ?? {};
}
export function setProps(h, json) { h.set?.(JSON.parse(json)); }
export function snapshot() {}
export function destroy(h) { h.destroy?.(); }
