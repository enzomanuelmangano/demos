// Fixes to the Demos app's web artifact that belong to Exact's web host, applied by tools/compose.ts to its copy of the
// artifact until the Exact the demos pin carries them (docs/decisions.md D18). Each patch names the exact text it
// replaces and fails the compose when that text is not there exactly once, so a new Exact never gets a stale patch.
// A patched file keeps its name, so its importers (themselves content-named) stay byte for byte the build's; its name
// then no longer hashes its content, so compose.ts serves it revalidated (max-age 0, ETag), not `immutable`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Patch = { file: RegExp; why: string; edits: [string, string][]; prepend?: string; dir?: string };

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
    // Names are the minified build's (motion.js): p the wasm, b `nodes`, P `owner`, _ `now`, s `viewId`, x `authored`.
    // Checked by tools/parity/height-spring.ts.
    file: /^motion-(?!glue-)[\w-]+\.js$/,
    why: 'a height -exact-spring transition snaps (only a height drag owner tells the engine its height)',
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
    for (const [from, to] of p.edits) {
      const n = text.split(from).length - 1;
      if (n !== 1) throw new Error(`demos patch (${p.why}): ${files[0]} has ${n} copies of ${JSON.stringify(from.slice(0, 60))}`);
      text = text.replace(from, () => to);
    }
    writeFileSync(path, (p.prepend ?? '') + text);
    done.push({ file: p.dir ? `${p.dir}/${files[0]}` : files[0], why: p.why });
  }
  return done;
}
