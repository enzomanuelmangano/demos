#!/usr/bin/env bun
// The hover audit: every element a :hover, :active, :focus-visible or :focus rule applies to (found from the page's
// own stylesheets, on both origins), plus every link, button and input, hovered with a real pointer, pressed, and
// focused by keyboard; compared live against local element by element (docs/parity.md, "hover audit").
//   bun tools/parity/hover.ts <live origin> <local origin> <route>... [--widths 1440,700] [--out /tmp/site-hover]
// Per element: cursor; transition (properties, durations, easings, delays); the computed look (colours as painted,
// opacity, transform, scale, shadow, text decoration, of the element and its distinct descendants) at rest, 700 ms
// into a hover, while pressed and when focused; and a screenshot of its box (8 px around) at rest and hovered, each
// diffed against the other origin's (threshold 32/255). Widths under 768 open the menu first and audit it too, with a
// mouse (a narrow desktop window, not a phone: touch has no hover). Exit 1 on any difference.
import { mkdirSync } from 'node:fs';
import { launch, type Page, Cdp } from './cdp.ts';
import { diffImages } from './diff.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [live, local] = args;
const routes = args.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const widths = (opt('--widths') ?? '1440,700').split(',').map(Number);
const out = opt('--out') ?? '/tmp/site-hover';
mkdirSync(out, { recursive: true });

const KEY = `const key = (el) => { const t = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40); const base = (t || el.tagName.toLowerCase()); const same = [...document.querySelectorAll('*')].filter((e) => e.__hk === base); el.__hk = base; return base + '#' + same.filter((e) => e !== el).length; };`;

// Candidates: what an interaction rule selects, and every control. Off-screen for the layout (a zero box, inside a
// clipped zero-height bar, inert or in the closed menu) is skipped.
const TARGETS = `(() => {
  const sels = new Set();
  const walk = (rules) => { for (const r of rules) { if (r.cssRules && !r.selectorText) { try { walk(r.cssRules); } catch {} } if (r.selectorText && /:(hover|active|focus-visible|focus)\\b/.test(r.selectorText)) for (const s of r.selectorText.split(/,(?![^(]*\\))/)) { const base = s.replace(/:(hover|active|focus-visible|focus)\\b/g, '').replace(/::?(before|after|placeholder|selection)\\b.*$/, '').trim(); if (base) sels.add(base); } } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch {} }
  const els = new Set(document.querySelectorAll('a[href], button, input, textarea, select, [role=button]'));
  for (const s of sels) { try { for (const e of document.querySelectorAll(s)) els.add(e); } catch {} }
  const seen = (el) => { const r = el.getBoundingClientRect(); if (!(r.width > 1 && r.height > 1)) return false; if (el.closest('[inert]')) return false; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false; if (n !== el && cs.overflow !== 'visible') { const q = n.getBoundingClientRect(); if (q.height <= 1 || q.width <= 1) return false; } } return true; };
  // Only the outermost of nested candidates that have the same box (a wrapper and its link) is kept.
  const list = [...els].filter((el) => el !== document.body && el !== document.documentElement && seen(el) && !/^(html|body|main|header|footer|nav)$/i.test(el.tagName) && el.getBoundingClientRect().width < innerWidth - 1);
  ${KEY}
  window.__hover = list;
  return list.map((el, i) => ({ i, key: key(el), tag: el.tagName.toLowerCase() }));
})()`;

const LOOK = (i: number) => `(() => {
  const el = window.__hover[${i}];
  const cv = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { if (c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return 'none'; cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].join(','); };
  const shadow = (v) => v.replace(/(rgba?|lab|oklch|oklab)\\([^)]*\\)/g, (c) => rgba(c)).split(/, (?=none|\\d)/).filter((l) => !/^(none )?0px 0px 0px 0px/.test(l) && !l.startsWith('none 0px 0px')).join(', ') || 'none';
  const pick = (e) => { const cs = getComputedStyle(e); return [rgba(cs.color), rgba(cs.backgroundColor), (parseFloat(cs.borderBottomWidth) > 0 ? rgba(cs.borderBottomColor) : ''), cs.opacity, cs.transform, cs.scale === '1' ? 'none' : cs.scale, shadow(cs.boxShadow), cs.textDecorationLine, cs.outlineStyle === 'none' ? '' : cs.outlineStyle + ' ' + rgba(cs.outlineColor)].join(' ; '); };
  const own = pick(el);
  // A bare text wrapper in the element's colour (the reference writes a text node there) is not a part.
  const ecs = getComputedStyle(el);
  const bare = (c) => { const cs = getComputedStyle(c); return c.children.length === 0 && c.textContent.trim() && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.boxShadow === 'none' && rgba(cs.color) === rgba(ecs.color) && cs.opacity === '1' && cs.transform === 'none'; };
  // A code run coloured by the CSS Custom Highlight API (data-hl, docs/decisions.md D16) counts as the token spans it
  // stands for: one part per highlight it uses, in that highlight's colour.
  const hl = [];
  for (const e of el.querySelectorAll('[data-hl]')) for (const t of e.getAttribute('data-hl').split('.')) { const name = 'tok-' + t[0]; if (CSS.highlights?.has(name)) hl.push([rgba(getComputedStyle(e, '::highlight(' + name + ')').color), ...pick(e).split(' ; ').slice(1)].join(' ; ')); }
  const kids = [...new Set([...[...el.querySelectorAll('*')].filter((c) => !bare(c)).map(pick), ...hl])].filter((p) => p !== own).sort();
  return [own, ...kids].slice(0, 8);
})()`;

const RECT = (i: number) => `(() => { const el = window.__hover[${i}]; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: r.x, y: r.y, w: r.width, h: r.height, sx: scrollX, sy: scrollY, cursor: cs.cursor, transition: [cs.transitionProperty.split(', ').filter((p) => !p.startsWith('--')).join(', '), ...[cs.transitionDuration, cs.transitionTimingFunction, cs.transitionDelay].map((v) => [...new Set(v.split(/, (?![^(]*\\))/))].join(', '))].join(' | ') }; })()`;

async function desktopPage(cdp: Cdp, width: number) {
  const height = 900;
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, width, height });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const { Page: P } = await import('./cdp.ts');
  const page = new P(cdp, sessionId, targetId, browserContextId);
  await page.send('Page.enable'); await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return page;
}

async function shot(page: Page, r: any, file: string) {
  const pad = 8;
  const clip = { x: Math.max(0, r.x + r.sx - pad), y: Math.max(0, r.y + r.sy - pad), width: Math.ceil(r.w + 2 * pad), height: Math.ceil(r.h + 2 * pad), scale: 1 };
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip });
  await Bun.write(file, Buffer.from(data, 'base64'));
}

const mouse = (page: Page, type: string, x: number, y: number, extra: any = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

async function capture(page: Page, url: string, width: number, side: string, tag: string, menu: boolean) {
  await page.goto(url);
  await Bun.sleep(4500);
  if (menu) {
    const p = await page.eval<any>(`(() => { const b = document.querySelector('[aria-controls=mobile-menu]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) return null;
    await mouse(page, 'mouseMoved', p.x, p.y); await mouse(page, 'mousePressed', p.x, p.y, { button: 'left', clickCount: 1 }); await mouse(page, 'mouseReleased', p.x, p.y, { button: 'left', clickCount: 1 });
    await Bun.sleep(700);
  }
  const targets = await page.eval<any[]>(TARGETS);
  const res: Record<string, any> = {};
  for (const t of targets) {
    if (menu && !(await page.eval<boolean>(`!!window.__hover[${t.i}].closest('#mobile-menu, [aria-controls=mobile-menu]')`))) continue;
    await mouse(page, 'mouseMoved', width - 2, 2);
    const r = await page.eval<any>(RECT(t.i));
    await Bun.sleep(450);
    const file = `${out}/${tag}-${t.key.replace(/[^\w]+/g, '_').slice(0, 50)}`;
    const rest = await page.eval(LOOK(t.i));
    await shot(page, r, `${file}.${side}.rest.png`);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    await mouse(page, 'mouseMoved', cx, cy);
    await Bun.sleep(700);
    const hover = await page.eval(LOOK(t.i));
    const cursor = await page.eval<string>(`getComputedStyle(window.__hover[${t.i}]).cursor`);
    await shot(page, r, `${file}.${side}.hover.png`);
    // Pressed: released away from it, so a link is not followed.
    await mouse(page, 'mousePressed', cx, cy, { button: 'left', clickCount: 1 });
    await Bun.sleep(250);
    const active = await page.eval(LOOK(t.i));
    await mouse(page, 'mouseMoved', width - 2, 2, { buttons: 1 });
    await mouse(page, 'mouseReleased', width - 2, 2, { button: 'left', clickCount: 1 });
    await page.eval(`document.activeElement?.blur?.()`);
    await Bun.sleep(300);
    const focusable = await page.eval<boolean>(`window.__hover[${t.i}].tabIndex >= 0`);
    let focus = null;
    if (focusable) { await page.eval(`window.__hover[${t.i}].focus({ focusVisible: true })`); await Bun.sleep(700); focus = await page.eval(LOOK(t.i)); await page.eval(`document.activeElement?.blur?.()`); }
    res[t.key] = { tag: t.tag, cursor, transition: r.transition, rest, hover, active, focus, file };
  }
  return res;
}

const { cdp, kill } = await launch({ port: 9347 });
const report: any[] = [];
let diffs = 0;
const cmpPage = await desktopPage(cdp, 400);
for (const route of routes) for (const w of widths) for (const menu of w < 768 ? [false, true] : [false]) {
  const tag = `${route.replace(/\W+/g, '_') || 'root'}@${w}${menu ? '-menu' : ''}`;
  const sides: any = {};
  for (const [side, origin] of [['live', live], ['local', local]] as const) {
    const page = await desktopPage(cdp, w);
    sides[side] = await capture(page, origin + route, w, side, tag, menu);
    await page.close();
  }
  const issues: string[] = [];
  const L = sides.live ?? {}, B = sides.local ?? {};
  let compared = 0;
  for (const [k, a] of Object.entries<any>(L)) {
    const b = B[k];
    if (!b) { issues.push(`missing locally: ${k} (${a.tag})${a.hover.join() !== a.rest.join() ? ' — live has a hover look' : ''}`); continue; }
    compared++;
    if (a.cursor !== b.cursor) issues.push(`${k}: cursor ${a.cursor} ≠ ${b.cursor}`);
    if (a.transition !== b.transition) issues.push(`${k}: transition ${a.transition} ≠ ${b.transition}`);
    for (const s of ['rest', 'hover', 'active', 'focus']) if (JSON.stringify(a[s]) !== JSON.stringify(b[s])) issues.push(`${k}: ${s} ${JSON.stringify(a[s])} ≠ ${JSON.stringify(b[s])}`);
    for (const s of ['rest', 'hover']) {
      const d = await diffImages(cmpPage, `${a.file}.live.${s}.png`, `${a.file}.local.${s}.png`, { diffOut: `${a.file}.${s}.diff.png` }).catch(() => null);
      if (!d) continue;
      if (d.a.join() !== d.b.join() || d.ratio > 0.01) issues.push(`${k}: ${s} pixels ${(d.ratio * 100).toFixed(2)} % differ (${d.a.join('x')} vs ${d.b.join('x')})`);
    }
  }
  for (const [k, b] of Object.entries<any>(B)) if (!L[k]) issues.push(`extra locally: ${k} (${b.tag})${b.hover.join() !== b.rest.join() ? ' — has a hover look' : ''}`);
  diffs += issues.length;
  report.push({ route, width: w, menu, compared, issues, live: L, local: B });
  console.log(`${route} @${w}${menu ? ' menu' : ''}: ${compared} elements compared, ${issues.length} differences`);
  for (const i of issues.slice(0, 60)) console.log('  ' + (process.env.HOVER_FULL ? i : i.slice(0, 420)));
}
await Bun.write(`${out}/report.json`, JSON.stringify(report, null, 2));
kill();
process.exit(diffs ? 1 : 0);
