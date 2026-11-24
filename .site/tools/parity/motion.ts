#!/usr/bin/env bun
// The motion check: the same page on two origins, its animations and its hover/focus transitions compared
// (docs/parity.md, "motion").
//   bun tools/parity/motion.ts <live origin> <local origin> <route>... [--widths 1440,390] [--out motion.json]
// For each route and width, in a fresh context:
// 1. entrances: every running CSS animation 60 ms after the first paint (document.getAnimations()): its keyframes'
//    animated properties and their from/to values, duration, delay, iterations, direction, fill and the keyframes'
//    easing; matched across origins by the animated element's own text (or its tag and order);
// 2. interactions: every link and button: cursor, transition (properties, durations, easings, delays) and what
//    hovering it changes (computed colour, background, opacity, transform, scale, box-shadow, text-decoration and
//    each child's), read 600 ms after the pointer moves onto it; and what focusing it by keyboard changes
//    (box-shadow, outline);
// 3. frames: each animation's progress sampled at 0, 25, 50, 75 and 100 % of its active time (opacity, filter,
//    transform, translate, scale, rotate), so curves, not only parameters, are compared.
// A difference is reported per element; exit 1 when any.
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [live, local] = args;
const routes = args.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const out = opt('--out') ?? '/tmp/site-motion.json';

const KEY = `const key = (el) => { const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40); return t || (el.tagName.toLowerCase() + ':' + [...document.querySelectorAll(el.tagName)].indexOf(el)); };`;

const ENTRANCES = `(async () => {
  ${KEY}
  const props = ['opacity', 'filter', 'transform', 'translate', 'scale', 'rotate'];
  // Only what can be seen: an animation on a box with no size (the other breakpoint's header) draws nothing.
  const anims = document.getAnimations().filter((a) => a.animationName && (() => { const t = a.effect.target, r = t.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; for (let n = t.parentElement; n; n = n.parentElement) { const q = n.getBoundingClientRect(); if (getComputedStyle(n).overflow !== 'visible' && (q.height <= 1 || q.width <= 1)) return false; } return true; })());
  const out = [];
  for (const a of anims) {
    const t = a.effect.getComputedTiming(), kf = a.effect.getKeyframes();
    const el = a.effect.target;
    const frames = [];
    const end = t.delay + t.activeDuration;
    if (isFinite(end) && end < 20000) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        a.pause(); a.currentTime = t.delay + p * t.duration - (p === 1 ? 0.01 : 0);
        const cs = getComputedStyle(el); const f = {}; for (const k of props) f[k] = cs[k]; frames.push(f);
      }
      a.play();
    }
    out.push({ key: key(el), name: a.animationName, duration: t.duration, delay: t.delay, iterations: t.iterations, direction: t.direction, fill: t.fill,
      keyframes: kf.map((k) => { const o = { offset: k.offset, easing: k.easing }; for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) o[p] = k[p]; return o; }), frames });
  }
  return out;
})()`;

const TARGETS = `(() => {
  ${KEY}
  return [...document.querySelectorAll('a[href], button, [role=button]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]') && getComputedStyle(el.closest('#mobile-menu') ?? el).opacity !== '0'; })
    .map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { key: key(el), x: r.x + r.width / 2, y: r.y + r.height / 2, cursor: cs.cursor, transition: [cs.transitionProperty.split(', ').filter((p) => !p.startsWith('--')).join(', '), ...[cs.transitionDuration, cs.transitionTimingFunction, cs.transitionDelay].map((v) => [...new Set(v.split(/, (?![^(]*\\))/))].join(', '))].join(' | ') }; });
})()`;

const LOOK = (key: string) => `(() => {
  ${KEY}
  const el = [...document.querySelectorAll('a[href], button, [role=button]')].find((e) => key(e) === ${JSON.stringify(key)});
  if (!el) return null;
  // Colours compared as the pixels they paint (lab(), oklch() and rgb() spellings of one colour are equal).
  const cv = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { if (c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return 'none'; cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].join(','); };
  const shadow = (v) => v.replace(/(rgba?|lab|oklch|oklab)\\([^)]*\\)/g, (c) => rgba(c)).split(/, (?=none|\\d)/).filter((l) => !l.startsWith('none 0px 0px 0px 0px')).join(', ') || 'none';
  // scale: 1 and none paint alike; text-decoration is the element's (a child span's own value is not inherited).
  const pick = (e, deco) => { const cs = getComputedStyle(e); return [rgba(cs.color), rgba(cs.backgroundColor), cs.opacity, cs.transform, cs.scale === '1' ? 'none' : cs.scale, shadow(cs.boxShadow), deco ? cs.textDecorationLine : '', cs.outlineStyle].join(' ; '); };
  // The element and its descendants that look different from it; a bare text wrapper in the element's colour (a
  // run of its own text, which the reference writes as a text node) is not a part.
  const own = pick(el, true), bare = pick(el, false);
  return [own, ...[...el.querySelectorAll('*')].filter((c) => !(c.children.length === 0 && c.textContent.trim() && getComputedStyle(c).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(c).boxShadow === 'none' && rgba(getComputedStyle(c).color) === rgba(getComputedStyle(el).color))).map((c) => pick(c, false)).filter((p) => p !== bare)].slice(0, 8);
})()`;

async function capture(page: Page, url: string, width: number) {
  await page.goto(url);
  await Bun.sleep(60);
  const entrances = await page.eval<any[]>(ENTRANCES);
  await Bun.sleep(4000);
  const targets = await page.eval<any[]>(TARGETS);
  const hovers: any = {};
  for (const t of targets) {
    const before = await page.eval(LOOK(t.key));
    if (width >= 800) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
      await Bun.sleep(600);
    }
    const hovered = await page.eval(LOOK(t.key));
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 899 });
    await Bun.sleep(400);
    hovers[t.key] = { cursor: t.cursor, transition: t.transition, hoverChanges: JSON.stringify(before) === JSON.stringify(hovered) ? null : hovered };
  }
  return { entrances, hovers };
}

const { cdp, kill } = await launch({ port: 9346 });
const report: any[] = [];
let diffs = 0;
for (const route of routes) for (const w of widths) {
  const sides: any = {};
  for (const [side, origin] of [['live', live], ['local', local]] as const) { const page = await newPage(cdp, w); sides[side] = await capture(page, origin + route, w); await page.close(); }
  const issues: string[] = [];
  const byKey = (xs: any[]) => { const m = new Map<string, any[]>(); for (const x of xs) m.set(x.key, [...(m.get(x.key) ?? []), x]); return m; };
  const L = byKey(sides.live.entrances), B = byKey(sides.local.entrances);
  for (const [k, la] of L) {
    const ba = B.get(k) ?? [];
    for (const a of la) {
      const b = ba.find((x) => x.name === a.name) ?? ba[0];
      if (!b) { issues.push(`entrance missing: ${k} (${a.name})`); continue; }
      for (const f of ['duration', 'delay', 'iterations', 'direction']) if (a[f] !== b[f]) issues.push(`entrance ${k}: ${f} ${a[f]} ≠ ${b[f]}`);
      if (JSON.stringify(a.keyframes) !== JSON.stringify(b.keyframes)) issues.push(`entrance ${k}: keyframes ${JSON.stringify(a.keyframes)} ≠ ${JSON.stringify(b.keyframes)}`);
      // Same frames: the same text with every number within 0.001 (float noise between two engines' matrices).
      const nums = (fr: any) => (JSON.stringify(fr).match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
      const bare = (fr: any) => JSON.stringify(fr).replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#');
      const na = nums(a.frames), nb = nums(b.frames);
      if (bare(a.frames) !== bare(b.frames) || na.some((v, i) => Math.abs(v - nb[i]) > 0.001)) issues.push(`entrance ${k}: frames differ ${JSON.stringify(a.frames).slice(0, 300)} ≠ ${JSON.stringify(b.frames).slice(0, 300)}`);
    }
  }
  for (const k of B.keys()) if (!L.has(k)) issues.push(`entrance extra: ${k}`);
  for (const [k, a] of Object.entries<any>(sides.live.hovers)) {
    const b = sides.local.hovers[k];
    if (!b) { issues.push(`interactive missing: ${k}`); continue; }
    if (a.cursor !== b.cursor) issues.push(`${k}: cursor ${a.cursor} ≠ ${b.cursor}`);
    if (a.transition !== b.transition) issues.push(`${k}: transition ${a.transition} ≠ ${b.transition}`);
    if (JSON.stringify(a.hoverChanges) !== JSON.stringify(b.hoverChanges)) issues.push(`${k}: hover ${JSON.stringify(a.hoverChanges)} ≠ ${JSON.stringify(b.hoverChanges)}`);
  }
  diffs += issues.length;
  report.push({ route, width: w, issues, live: sides.live, local: sides.local });
  console.log(`${route} @${w}: ${issues.length} motion differences`);
  for (const i of issues.slice(0, 40)) console.log('  ' + i.slice(0, 400));
}
await Bun.write(out, JSON.stringify(report, null, 2));
kill();
process.exit(diffs ? 1 : 0);
