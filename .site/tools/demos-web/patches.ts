// Fixes to the Demos app's web artifact that belong to Exact's web host, applied by tools/compose.ts to its copy of the
// artifact until the Exact the demos pin carries them (docs/decisions.md D18). Each patch names the exact text it
// replaces and fails the compose when that text is not there exactly once, so a new Exact never gets a stale patch.
// A patched file keeps its name, so its importers (themselves content-named) stay byte for byte the build's; its name
// then no longer hashes its content, so compose.ts serves it revalidated (max-age 0, ETag), not `immutable`.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// `requires`: text the edits depend on but do not replace (the minified names they use, by the declarations that bind
// them). Each must be in the file exactly once, after `requires[0]` (the scope that binds them) and before the first
// edit, so a rename in a new Exact fails the compose instead of shipping a patch that calls the wrong thing.
type Patch = { file: RegExp; why: string; edits: [string, string][]; prepend?: string; dir?: string; requires?: string[] };

export const PATCHES: Patch[] = [
  {
    // Exit ghosts of adjacent siblings collapse onto the first one's place (Composable Text: "Using Max" → "Use Max",
    // the leaving i, n, g drawn on top of each other). The web-js host's region removal calls exit() once per leaving
    // node (pieces.js `Leave`), and exit() reads the node's box (`kept`) after the previous sibling was already taken
    // out of flow, so each later sibling reads the first one's offset. The batched path (`before`) reads all first.
    // Fix: an exit without a reading takes its ghost out of flow at the end of the task (or before the next
    // before/after, so layout transitions measure the final rows), each at the box it had when it left.
    file: /^presence-glue-[\w-]+\.js$/,
    why: 'exit ghosts of adjacent siblings collapse onto one place',
    prepend: 'const __xgOut=(s,a)=>{s.position=`absolute`,s.left=`${a[0]}px`,s.top=`${a[1]}px`,s.width=`${a[2]}px`,s.height=`${a[3]}px`},__xgQ=[],__xgFlush=()=>{for(let[s,a]of __xgQ.splice(0))__xgOut(s,a)},__xgLater=(s,a)=>{__xgQ.push([s,a])===1&&queueMicrotask(__xgFlush)};\n',
    edits: [
      ['s.transition=`none`,s.position=`absolute`,s.left=`${a[0]}px`,s.top=`${a[1]}px`,s.width=`${a[2]}px`,s.height=`${a[3]}px`,', 's.transition=`none`,(r?__xgOut:__xgLater)(s,a),'],
      ['before(e,t){b=new Map;', 'before(e,t){__xgFlush();b=new Map;'],
      ['after(e,t){let n=new Set(', 'after(e,t){__xgFlush();let n=new Set('],
    ],
  },
  {
    // A `height -exact-spring(...)` transition snaps on the web (Miles Bar Chart: paging a week jumps every bar to its
    // new height while its colour springs). Height is one of the properties the motion engine plays as physics
    // (motion/src/property.rs `springs`), so the CSS lowering keeps only `height 0s ease 0s` for it and leaves the
    // spring to the engine. But the JS target's motion.js tells the engine a node's height only for a height drag's
    // owner (`observeHeight` returns unless the id is `owner`, fed by rt.js `mh`); `mo` carries translate, scale,
    // rotate, opacity, transition and velocity, never height. So any other node's height change reaches the engine
    // never, and the inline write lands at once. Fix: the style hook (every dynamic style write on a node motion
    // follows) tells the engine a followed, non-owner node's px height when its transition springs height (or `all`);
    // the first time, the height it had before the write first, so the first change already springs. The write still
    // lands inline (the hook returns as before); the engine's `animate` op plays the spring over it at the flush.
    // Names are the minified build's (motion.js): p the wasm, b `nodes`, P `owner`, _ `now`, s `viewId`, x `authored`,
    // c the hooks. `requires` pins each to the declaration that binds it, in the function whose return sets c.style:
    // the function's own parameters (s, c), the wasm's exports (p), the clock (_), the maps (b, x), the owner (P), the
    // owner's own height write (P, b's `transition`, p.m_height(id, px, seconds), _), and the drag modules' arguments
    // (p as `w`, s, _, x). Checked by tools/parity/height-spring.ts.
    file: /^motion-(?!glue-)[\w-]+\.js$/,
    why: 'a height -exact-spring transition snaps (only a height drag owner tells the engine its height)',
    requires: [
      'async function _({clock:t,wall:r,views:o,viewId:s,hooks:c,say:l,inflight:u}){',
      ',p=(f.instance??f).exports,',
      ',_=()=>t.agent?t.now:Math.max(t.now,r()),',
      ',b=new Map,x=new Map,S=new Map,',
      ',M=new Map,N=new Map,P=null,',
      'n!==P&&(P!=null&&p.m_unheight(P)&&R.retire(P,`height`),P=n,',
      'function L(e,[t,n]=[]){if(e!==P||typeof t!=`number`)return;let r=b.get(e);r||b.set(e,r={}),r.transition!==n&&(r.transition=n,p.m_transitions(e,h(n??``))),p.m_height(e,t,_()/1e3)}',
      'z=a({w:p,views:o,viewId:s,api:R,lower:y,ops:D,now:_,authored:x,holds:S,',
      'return c.observe=E,c.style=(e,t,n)=>{',
    ],
    prepend: 'const __xhPx=v=>{let m=/^\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)px\\s*$/i.exec(v??``);return m?Number(m[1]):NaN},__xhSprings=t=>typeof t==`string`&&t.toLowerCase().split(/,(?![^(]*\\))/).some(e=>{if(!/-exact-spring\\(/.test(e))return!1;let w=e.replace(/-exact-spring\\([^)]*\\)/g,` `).trim().split(/\\s+/).filter(t=>t&&!/^[\\d.]+m?s$/.test(t));return!w.length||w.includes(`height`)||w.includes(`all`)});\n',
    edits: [[
      'c.style=(e,t,n)=>{let r=s(e);if(!x.has(r))return!1;',
      'c.style=(e,t,n)=>{let r=s(e);if(t===`height`&&r!==P&&b.has(r)&&__xhSprings(b.get(r).transition)){let a=__xhPx(n),o=b.get(r);if(Number.isFinite(a)){if(!o.__xh){let i=__xhPx(e.style.height);Number.isFinite(i)&&p.m_height(r,i,_()/1e3)}o.__xh=1,p.m_height(r,a,_()/1e3)}}if(!x.has(r))return!1;',
    ]],
  },
  {
    // The framed app on reactiive.io's /demos (D19): a close asked for while the tab is hidden waited for frames that
    // never come, so the route heard of the close only when the tab came back. A hidden document lands the card at
    // once. A site fix to the Demos app's web module, kept out of its sources (isolation.md §6) and applied here.
    file: /^index\.js$/,
    dir: 'modules',
    why: 'a close in a hidden tab waits for frames that never come',
    edits: [[
      '    if (!iconFrame) findIcon();\n    if (!iconFrame || reducedMotion()) {',
      '    if (!iconFrame) findIcon();\n    if (document.hidden) { stopFlight(); landed(); return; }\n    if (!iconFrame || reducedMotion()) {',
    ]],
  },
  {
    // The framed phone's status bar and home indicator (home/web-phone.contract WebStatusBar, drawn in two inks): their
    // ink follows the open and close flight, by opacity in the flight's own keyframes, as the card covers the bar
    // (35-95 % of its width), instead of snapping at the route's change (the demo's ink at the tap's first frame, the
    // launcher's only when the close had landed). Checked by tools/parity/sim-statusbar.ts.
    file: /^index\.js$/,
    dir: 'modules',
    why: "the status bar's ink snaps at the route's change instead of following the flight",
    edits: [
      ["  const art = root.querySelector('img');\n  let p = props, phase = 'idle', closing = false, grouped = false, flight = null, track = null, landedSent = false;\n  let screen = null, card = null, content = null, zoom = null, dim = null, blur = null, icon = null;\n  let sw = 0, sh = 0, R = 62, rest0 = false, iconFrame = null, iconRadius = 0, radius = 0, releaseRadius = 0;\n  const w = new Spring(0), h = new Spring(0), aspect = new Spring(1), cx = new Spring(0), cy = new Spring(0);\n  const homeScale = new Spring(1), homeBlur = new Spring(0), homeDim = new Spring(0);\n",
       "  const art = root.querySelector('img');\n  let p = props, phase = 'idle', closing = false, grouped = false, flight = null, track = null, landedSent = false;\n  let screen = null, card = null, content = null, zoom = null, dim = null, blur = null, icon = null;\n  // The framed phone's status bar and home indicator: each drawn twice, in the launcher's ink and the demo's\n  // (home/web-phone.contract WebStatusBar), cross-faded by the flight so they change with the card, on the compositor.\n  let inks = [];\n  let sw = 0, sh = 0, R = 62, rest0 = false, iconFrame = null, iconRadius = 0, radius = 0, releaseRadius = 0;\n  const w = new Spring(0), h = new Spring(0), aspect = new Spring(1), cx = new Spring(0), cy = new Spring(0);\n  const homeScale = new Spring(1), homeBlur = new Spring(0), homeDim = new Spring(0);\n"],
      ["    if (phase === 'opening') taper = K.taper / sw * (1 - clamp01(q));\n    else if (phase === 'closing') taper = K.taper / sw * (1 - clamp01(q)) * clamp01(since / K.taperIn) * smoothstep(0, 0.08, q);\n    const bl = clamp01(homeBlur.x);\n    return { w: w.x, h: Math.max(h.x, 1), cx: cx.x, cy: cy.x, radius, taper, art: artAlpha(), hs: homeScale.x, dim: dimOf(homeDim.x, bl), blur: bl };\n  };\n  // A pose as the layers' styles: the card a box of W x H by a non-uniform scale of the screen-sized element (its\n  // corners given per axis so they read round), the demo inside at the uniform scale W / screen width.\n",
       "    if (phase === 'opening') taper = K.taper / sw * (1 - clamp01(q));\n    else if (phase === 'closing') taper = K.taper / sw * (1 - clamp01(q)) * clamp01(since / K.taperIn) * smoothstep(0, 0.08, q);\n    const bl = clamp01(homeBlur.x);\n    // The demo's ink as its card covers the bar: from 35 % of the card's width to 95 % (iOS turns the bar's style as\n    // the app's window reaches it, not at the tap).\n    return { w: w.x, h: Math.max(h.x, 1), cx: cx.x, cy: cy.x, radius, taper, art: artAlpha(), hs: homeScale.x, dim: dimOf(homeDim.x, bl), blur: bl, ink: smoothstep(0.35, 0.95, clamp01(q)) };\n  };\n  // A pose as the layers' styles: the card a box of W x H by a non-uniform scale of the screen-sized element (its\n  // corners given per axis so they read round), the demo inside at the uniform scale W / screen width.\n"],
      ["      // and its whole demo on the main thread every frame).\n      clip: `inset(0 round ${q.radius / sx}px / ${q.radius / sy}px)`,\n      content: `scale(1,${sx / sy})`,\n      art: String(q.art), home: `scale(${q.hs})`, dim: String(q.dim), blur: String(q.blur),\n    };\n  };\n  const put = (q) => {\n    const st = styles(q);\n    card.style.transform = st.card; card.style.clipPath = st.clip; content.style.transform = st.content;\n    art.style.opacity = st.art; zoom.style.transform = st.home; dim.style.opacity = st.dim; blur.style.opacity = st.blur;\n  };\n  const behind = (on) => {\n    blur.style.visibility = on ? 'visible' : 'hidden';\n    // The layers are promoted once, when the card is set up (`promote`), never at a flight's start: a promotion in the\n",
       "      // and its whole demo on the main thread every frame).\n      clip: `inset(0 round ${q.radius / sx}px / ${q.radius / sy}px)`,\n      content: `scale(1,${sx / sy})`,\n      art: String(q.art), home: `scale(${q.hs})`, dim: String(q.dim), blur: String(q.blur), ink: q.ink,\n    };\n  };\n  const put = (q) => {\n    const st = styles(q);\n    card.style.transform = st.card; card.style.clipPath = st.clip; content.style.transform = st.content;\n    art.style.opacity = st.art; zoom.style.transform = st.home; dim.style.opacity = st.dim; blur.style.opacity = st.blur;\n    inkAt(st.ink);\n  };\n  const inkAt = (a) => { for (const [el, demo] of inks) el.style.opacity = String(demo ? a : 1 - a); };\n  const behind = (on) => {\n    blur.style.visibility = on ? 'visible' : 'hidden';\n    // The layers are promoted once, when the card is set up (`promote`), never at a flight's start: a promotion in the\n"],
      ["  const rest = () => {\n    card.style.transform = 'none'; card.style.clipPath = ''; content.style.transform = 'none'; art.style.opacity = '0';\n    zoom.style.transform = `scale(${K.homeScale})`; dim.style.opacity = String(dimOf(1, 1)); blur.style.opacity = '1';\n    behind(false);\n  };\n  const stopFlight = () => { if (flight) { for (const a of flight.anims) a.cancel(); clearTimeout(flight.timer); flight = null; } };\n",
       "  const rest = () => {\n    card.style.transform = 'none'; card.style.clipPath = ''; content.style.transform = 'none'; art.style.opacity = '0';\n    zoom.style.transform = `scale(${K.homeScale})`; dim.style.opacity = String(dimOf(1, 1)); blur.style.opacity = '1';\n    inkAt(1);\n    behind(false);\n  };\n  const stopFlight = () => { if (flight) { for (const a of flight.anims) a.cancel(); clearTimeout(flight.timer); flight = null; } };\n"],
      ["      content.animate(ls.map((l) => ({ transform: l.content })), o), art.animate(ls.map((l) => ({ opacity: l.art })), o),\n      zoom.animate(ls.map((l) => ({ transform: l.home })), o), dim.animate(ls.map((l) => ({ opacity: l.dim })), o),\n      blur.animate(ls.map((l) => ({ opacity: l.blur })), o),\n    ];\n    flight = { start: performance.now(), poses, anims, timer: 0 };\n    const f = flight;\n",
       "      content.animate(ls.map((l) => ({ transform: l.content })), o), art.animate(ls.map((l) => ({ opacity: l.art })), o),\n      zoom.animate(ls.map((l) => ({ transform: l.home })), o), dim.animate(ls.map((l) => ({ opacity: l.dim })), o),\n      blur.animate(ls.map((l) => ({ opacity: l.blur })), o),\n      ...inks.map(([el, demo]) => el.animate(ls.map((l) => ({ opacity: demo ? l.ink : 1 - l.ink })), o)),\n    ];\n    flight = { start: performance.now(), poses, anims, timer: 0 };\n    const f = flight;\n"],
      ["    card.setAttribute('data-launched', '');\n    content = card.querySelector('[data-testid=\"web-card-content\"]');\n    zoom = screen.querySelector('[data-testid=\"web-home-zoom\"]'); dim = screen.querySelector('[data-testid=\"web-dim\"]'); blur = screen.querySelector('[data-testid=\"web-blur\"]');\n    sw = screen.offsetWidth; sh = screen.offsetHeight; R = framed() ? 62 : 48;\n    card.style.transformOrigin = '0 0'; content.style.transformOrigin = '0 0'; zoom.style.transformOrigin = '50% 50%';\n    // Promoted for good: every flight then moves layers that already exist (see `behind`).\n",
       "    card.setAttribute('data-launched', '');\n    content = card.querySelector('[data-testid=\"web-card-content\"]');\n    zoom = screen.querySelector('[data-testid=\"web-home-zoom\"]'); dim = screen.querySelector('[data-testid=\"web-dim\"]'); blur = screen.querySelector('[data-testid=\"web-blur\"]');\n    const device = screen.parentElement;\n    inks = ['status', 'indicator'].flatMap((k) => [[device?.querySelector(`[data-testid=\"web-${k}-home\"]`), false], [device?.querySelector(`[data-testid=\"web-${k}-demo\"]`), true]]).filter(([el]) => el);\n    sw = screen.offsetWidth; sh = screen.offsetHeight; R = framed() ? 62 : 48;\n    card.style.transformOrigin = '0 0'; content.style.transformOrigin = '0 0'; zoom.style.transformOrigin = '50% 50%';\n    // Promoted for good: every flight then moves layers that already exist (see `behind`).\n"],
    ],
  },
  {
    // A mouse drag of the launcher's pages, the pull to search or a demo card's close, released outside the phone's
    // screen in reactiive.io's /demos, never ended: the framed app's pointer is not captured across its frame, so the
    // release went to the page and the pages stayed mid-drag (then followed the mouse with no button held). The bridge's
    // mouse scroll (tools/demos-web/mouse-scroll.js) sees the pointer leave the screen and dispatches the lift itself
    // (a pointerup marked `exactLifted`, where the pointer left); these three pans hear only trusted releases, so they
    // hear that mark too. Checked by tools/parity/mouse-scroll.ts (4).
    file: /^index\.js$/,
    dir: 'modules',
    why: "a mouse drag of the app's own pans released outside the framed phone never ends",
    edits: [
      ["    // The cancel this close sends the demo is not the finger's.\n    if (!track || e.pointerId !== track.id || !e.isTrusted) return;\n",
       "    // The cancel this close sends the demo is not the finger's.\n    if (!track || e.pointerId !== track.id || !(e.isTrusted || e.exactLifted === true)) return;\n"],
      ["  const up = (e) => {\n    if (!track || e.pointerId !== track.id || !e.isTrusted) return;\n    const t = track; track = null;\n    if (!t.active) { if (t.caught) settleBack(0); return; }\n",
       "  const up = (e) => {\n    if (!track || e.pointerId !== track.id || !(e.isTrusted || e.exactLifted === true)) return;\n    const t = track; track = null;\n    if (!t.active) { if (t.caught) settleBack(0); return; }\n"],
      ["    // Not the pointercancel this (or the pull) sends the icon under the press.\n    if (!drag || e.pointerId !== drag.id || !e.isTrusted) return;\n",
       "    // Not the pointercancel this (or the pull) sends the icon under the press.\n    if (!drag || e.pointerId !== drag.id || !(e.isTrusted || e.exactLifted === true)) return;\n"],
    ],
  },
];

/** Applies every patch to the artifact at `dir` (the copy under the composed output); returns what it changed. */
export function patchDemos(dir: string) {
  const done: { file: string; why: string }[] = [];
  for (const p of PATCHES) {
    const at = p.dir ? join(dir, p.dir) : dir;
    const files = readdirSync(at).filter((n) => p.file.test(n));
    if (files.length !== 1) throw new Error(`demos patch (${p.why}): ${files.length} files match ${p.file}`);
    const path = join(at, files[0]);
    let text = readFileSync(path, 'utf8');
    const count = (s: string) => text.split(s).length - 1;
    if (p.requires) {
      const first = text.indexOf(p.edits[0][0]);
      if (first < 0) throw new Error(`demos patch (${p.why}): ${files[0]} has 0 copies of ${JSON.stringify(p.edits[0][0].slice(0, 60))}`);
      const scope = text.indexOf(p.requires[0]);
      for (const r of p.requires) {
        const n = count(r);
        if (n !== 1) throw new Error(`demos patch (${p.why}): ${files[0]} has ${n} copies of the required ${JSON.stringify(r.slice(0, 80))}`);
        const at = text.indexOf(r);
        if (at < scope || at > first) throw new Error(`demos patch (${p.why}): ${files[0]}: the required ${JSON.stringify(r.slice(0, 80))} is not between ${JSON.stringify(p.requires[0].slice(0, 40))} and the first edit`);
      }
    }
    for (const [from, to] of p.edits) {
      const n = count(from);
      if (n !== 1) throw new Error(`demos patch (${p.why}): ${files[0]} has ${n} copies of ${JSON.stringify(from.slice(0, 60))}`);
      text = text.replace(from, () => to);
    }
    writeFileSync(path, (p.prepend ?? '') + text);
    done.push({ file: p.dir ? `${p.dir}/${files[0]}` : files[0], why: p.why });
  }
  return done;
}

// A dry run on a copy of an artifact's dist (the post-merge check, .github/workflows/site-demos-web.yml): every patch
// must apply exactly; the artifact itself is not touched. Exit 1 when one does not.
//   bun tools/demos-web/patches.ts --dry-run <demos dist>
if (import.meta.main) {
  const i = process.argv.indexOf('--dry-run');
  if (i < 0 || !process.argv[i + 1]) { console.error('usage: bun tools/demos-web/patches.ts --dry-run <demos dist>'); process.exit(2); }
  const copy = mkdtempSync(join(tmpdir(), 'demos-patch-dry-'));
  try {
    cpSync(resolve(process.argv[i + 1]), copy, { recursive: true });
    for (const { file, why } of patchDemos(copy)) console.log(`demos patch (dry run): ${file}: ${why}`);
    console.log(`demos patch (dry run): all ${PATCHES.length} patches apply`);
  } catch (e) {
    console.error(`::error::${(e as Error).message}`);
    process.exitCode = 1;
  } finally { rmSync(copy, { recursive: true, force: true }); }
}
