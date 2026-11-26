#!/usr/bin/env bun
// A mouse drags the framed app's scroll views as a finger does (tools/demos-web/mouse-scroll.js): /demos at 1440x900,
// real mouse input (CDP, pointerType "mouse": down, moves, up), every check in the app's sandboxed frame.
//   bun tools/parity/mouse-scroll.ts <origin> [--headed] [--perf]      (exit 1 on any failure)
// 1. The search results (pull down on the launcher with the mouse, then drag the list up): the list follows the pointer
//    1:1 during the drag (within 2 pt), keeps going after the release (momentum) with a falling speed (UIScrollView's
//    0.998 / ms), and no press lands: no row opened, the search still open, no click reached the page.
// 2. The same list pulled down at its top: the content shows past the edge by the rubber band (less than the drag),
//    then springs back to 0 within 1.2 s of the release; no text selected.
// 3. A tap (no travel) on a result still opens its demo.
// 4. The launcher's pages (the app's own drag): a mouse drag released outside the phone's screen still releases (the
//    pages settle on a page instead of staying mid-drag).
// 5. A demo's list (Stacked List): moves, momentum, no click; a wheel on it still scrolls by the wheel's deltas; past its
//    end the rubber band and the bounce back.
// 6. At that list's top a mouse pull down closes the demo (the demo card's close pan claims it before the list's band).
// --perf: per-frame intervals in the app's renderer during a drag and its momentum, and during a drag past the list's end
//    and its bounce back (frames over 1.5x the median interval are dropped), and the paints and layouts meanwhile (the
//    list's own scrolling and the band's translate are composited: none expected). Judge it --headed (a display's rate).
import { launch, newPage, type Page } from './cdp.ts';

const origin = (process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:4318').replace(/\/$/, '');
const headed = process.argv.includes('--headed'), perf = process.argv.includes('--perf');
const { cdp, kill } = await launch({ port: 9603, headed });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const until = async (f: () => Promise<boolean>, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(50); } return false; };

type App = { page: Page; ev: <T = any>(e: string) => Promise<T>; off: { x: number; y: number }; sessionId: string };
async function open(): Promise<App> {
  const page = await newPage(cdp, 1440);
  // No arrow: this session turned it off.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{sessionStorage.setItem('reactiive.demos.hint','1');sessionStorage.setItem('reactiive.demos.arrow','off')}catch(e){}` });
  await page.goto(`${origin}/demos`);
  await until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live]')?.checkVisibility()`));
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/')).pop();
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const ev = async <T = any>(e: string): Promise<T> => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await until(() => ev(`document.querySelector('[data-testid="pager-track"]')?.style.willChange === 'transform'`));
  await Bun.sleep(600);
  const off = await page.eval<any>(`(() => { const r = document.querySelector('iframe[data-motion~=live]').getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  // A click that reached any listener past the capture phase (a drag's click is dropped in the capture phase).
  await ev(`window.__clicks = 0; addEventListener('click', () => __clicks++)`);
  return { page, ev, off, sessionId };
}
const mouse = (a: App, p: any) => a.page.send('Input.dispatchMouseEvent', p);
/** A mouse drag in the frame's px from (x, y) by (dx, dy): `steps` moves `ms` apart; `onMove(i)` after each. */
async function drag(a: App, x: number, y: number, dx: number, dy: number, { steps = 12, ms = 16, onMove }: { steps?: number; ms?: number; onMove?: (i: number) => Promise<void> } = {}) {
  x += a.off.x; y += a.off.y;
  await mouse(a, { type: 'mouseMoved', x, y });
  await mouse(a, { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await mouse(a, { type: 'mouseMoved', x: x + dx * i / steps, y: y + dy * i / steps, button: 'left', buttons: 1 });
    // The release follows the last move at once (a release 50 ms after the last move is a pointer at rest).
    if (i === steps) break;
    await onMove?.(i);
    await Bun.sleep(ms);
  }
  await mouse(a, { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', buttons: 0, clickCount: 1 });
}
const scale = (a: App) => a.ev<number>(`(() => { const s = document.querySelector('[data-testid=web-screen]'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
const LIST = `document.querySelector('[data-testid=search]').shadowRoot.querySelector('.list')`;
const committed = (a: App) => a.ev<boolean>(`getComputedStyle(document.querySelector('[data-testid=search]')).pointerEvents === 'auto'`);
async function openSearch(a: App) {
  const p = await a.ev(`(() => { const r = document.querySelector('[data-testid=pager]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.3 }; })()`);
  await drag(a, p.x, p.y, 0, 160, { steps: 16 });
  await until(() => committed(a), 4000);
  await Bun.sleep(700);
  // The keyboard's field focus is not under test: the list alone.
  return committed(a);
}
/** Offsets of the element at `expr` every frame into window.__trace: [t, scrollTop, band translate y]. */
const traceStart = (a: App, expr: string) => a.ev(`(() => { const e = ${expr}, kid = e.firstElementChild; window.__trace = []; window.__tracing = true;
  const tick = (t) => { const tr = getComputedStyle(kid).translate; const y = tr === 'none' ? 0 : parseFloat(tr.split(' ')[1] ?? '0') || 0; __trace.push([t, e.scrollTop, y]); if (__tracing) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })()`);
const traceStop = async (a: App) => { await a.ev(`window.__tracing = false`); return a.ev<number[][]>(`__trace`); };

// ---- 1-3: the search results ----
{
  const a = await open();
  check(await openSearch(a), '1 a mouse pull down on the launcher opens the search');
  const k = await scale(a);
  // Above the keyboard the field's focus raises.
  const box = await a.ev(`(() => { const r = ${LIST}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.45 }; })()`);
  const top0 = await a.ev<number>(`${LIST}.scrollTop`);
  const track: number[] = [];
  await traceStart(a, LIST);
  await drag(a, box.x, box.y, 0, -150, { steps: 10, ms: 12, onMove: async () => { track.push(await a.ev<number>(`${LIST}.scrollTop`)); } });
  const atRelease = await a.ev<number>(`${LIST}.scrollTop`);
  await Bun.sleep(1500);
  const trace = await traceStop(a);
  const end = await a.ev<number>(`${LIST}.scrollTop`);
  const expect = 150 * 9 / 10 / k; // the last reading is the ninth of ten moves
  const lastDrag = track.at(-1)! - top0;
  check(Math.abs(lastDrag - expect) < 2, `1 the list follows the pointer 1:1: ${lastDrag.toFixed(1)} pt for ${expect.toFixed(1)} pt of drag`);
  check(end - atRelease > 20, `1 momentum after the release: ${atRelease.toFixed(0)} → ${end.toFixed(0)} pt`);
  // The speed after the release falls (each 100 ms window travels less than the one before).
  const t0 = trace.find((r) => r[1] >= atRelease)?.[0] ?? trace[0][0];
  // The speed from the offsets of two frames `from` and `to` ms after the release (px per ms).
  const at = (ms: number) => trace.reduce((b, q) => (Math.abs(q[0] - t0 - ms) < Math.abs(b[0] - t0 - ms) ? q : b));
  const speed = (from: number, to: number) => { const a1 = at(from), b1 = at(to); return (b1[1] - a1[1]) / (b1[0] - a1[0]); };
  // From 100 ms after the release (the first frames hold the release's own frame and the probe's latency).
  const sp = [100, 300, 500].map((t) => speed(t, t + 200));
  check(sp[0] > sp[1] && sp[1] > sp[2] && sp[2] > 0, `1 the momentum decelerates: ${sp.map((x) => (x * 1000).toFixed(0)).join(', ')} pt/s over 200 ms windows`);
  // UIScrollView's normal rate: the speed falls by 0.998^200 = 0.670 every 200 ms.
  const ratio = Math.sqrt(sp[2] / sp[0]);
  check(Math.abs(ratio - 0.998 ** 200) < 0.05, `1 the rate is UIScrollView's normal deceleration: ${ratio.toFixed(3)} per 200 ms (0.670)`);
  check((await a.ev('location.pathname')).replace(/\/$/, '') === '/demos/app' && (await committed(a)) && (await a.ev('__clicks')) === 0, `1 no press from the drag (no demo opened, the search open, no click)`);

  // 2. The rubber band at the top.
  await a.ev(`${LIST}.scrollTop = 0`);
  await Bun.sleep(300);
  let maxBand = 0;
  await traceStart(a, LIST);
  await drag(a, box.x, box.y - 150, 0, 120, { steps: 10, ms: 16, onMove: async () => { const t = await a.ev<number[][]>(`__trace`); maxBand = Math.max(maxBand, ...t.map((r) => r[2])); } });
  const released = Date.now();
  await until(async () => { const t = await a.ev<number[][]>(`__trace`); return t.length > 3 && t.slice(-3).every((r) => Math.abs(r[2]) < 0.01); }, 3000);
  const back = Date.now() - released;
  const tr = await traceStop(a);
  maxBand = Math.max(maxBand, ...tr.map((r) => r[2]));
  check(maxBand > 10 && maxBand < 120 / k, `2 the rubber band at the top: the content ${maxBand.toFixed(1)} pt past the edge for ${(120 / k).toFixed(0)} pt of drag`);
  check(back < 1200 && Math.abs(tr.at(-1)![2]) < 0.01 && tr.at(-1)![1] === 0, `2 it springs back to the edge (${back} ms)`);
  check((await a.ev(`getSelection().toString()`)) === '', '2 no text selected by the drags');

  // 3. A tap still opens a result.
  const row = await a.ev(`(() => { const r = ${LIST}.querySelector('.row').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, slug: ${LIST}.querySelector('.row').dataset.slug }; })()`);
  await mouse(a, { type: 'mouseMoved', x: a.off.x + row.x, y: a.off.y + row.y });
  await mouse(a, { type: 'mousePressed', x: a.off.x + row.x, y: a.off.y + row.y, button: 'left', buttons: 1, clickCount: 1 });
  await Bun.sleep(60);
  await mouse(a, { type: 'mouseReleased', x: a.off.x + row.x, y: a.off.y + row.y, button: 'left', buttons: 0, clickCount: 1 });
  check(await until(() => a.ev(`location.pathname.endsWith('/demo/${row.slug}')`), 4000), `3 a tap on a result opens it (${row.slug})`);
  await a.page.close();
}

// ---- 4: the launcher's own drag, released outside the screen ----
{
  const a = await open();
  const p = await a.ev(`(() => { const r = document.querySelector('[data-testid=web-screen]').getBoundingClientRect(); return { x: r.x + r.width * 0.8, y: r.y + r.height / 2, w: r.width }; })()`);
  // From 80 % of the screen to well past its left edge (the frame's own page, outside the phone).
  await drag(a, p.x, p.y, -p.w * 1.1, 0, { steps: 14, ms: 16 });
  await Bun.sleep(1500);
  const r = await a.ev(`(() => { const t = document.querySelector('[data-testid=pager-track]'), w = document.querySelector('[data-testid=pager]').clientWidth; const x = -new DOMMatrix(getComputedStyle(t).transform).m41; return { x, w }; })()`);
  const page = r.x / r.w;
  check(Math.abs(page - Math.round(page)) < 0.01 && Math.round(page) >= 1, `4 a launcher drag released outside the phone settles on a page (${page.toFixed(3)})`);
  check((await a.ev('location.pathname')).replace(/\/$/, '') === '/demos/app', '4 and opens nothing');
  await a.page.close();
}

// ---- 5: a demo's list ----
async function openDemo(a: App, slug: string) {
  await a.page.eval(`document.querySelector('iframe[data-motion~=live]').contentWindow.postMessage({ demos: 'goto', slug: '${slug}', still: true }, '*')`);
  const ok = await until(() => a.ev(`location.pathname.endsWith('/demo/${slug}')`), 15000);
  await Bun.sleep(1500);
  return ok;
}
{
  const a = await open();
  check(await openDemo(a, 'stacked-list'), '5 Stacked List opens');
  const S = `document.querySelector('[data-testid=stacked-list-scroll]')`;
  const box = await a.ev(`(() => { const r = ${S}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.7 }; })()`);
  const s0 = await a.ev<number>(`${S}.scrollTop`);
  await drag(a, box.x, box.y, 0, -150, { steps: 10, ms: 12 });
  const s1 = await a.ev<number>(`${S}.scrollTop`);
  await Bun.sleep(1500);
  const s2 = await a.ev<number>(`${S}.scrollTop`);
  check(s1 - s0 > 150 && s2 - s1 > 20, `5 Stacked List: a mouse drag scrolls it (${(s1 - s0).toFixed(0)} pt) and it keeps going (${(s2 - s1).toFixed(0)} pt)`);
  check((await a.ev('location.pathname')).endsWith('/demo/stacked-list') && (await a.ev('__clicks')) === 0, '5 no press from the drag');
  // At rest first (a fast flick decelerates for seconds), then a wheel from the top.
  await until(async () => { const v = await a.ev<number>(`${S}.scrollTop`); await Bun.sleep(120); return v === (await a.ev<number>(`${S}.scrollTop`)); }, 8000);
  await a.ev(`${S}.scrollTop = 0`);
  await Bun.sleep(300);
  const x = a.off.x + box.x, y = a.off.y + box.y;
  await mouse(a, { type: 'mouseMoved', x, y });
  for (let i = 0; i < 10; i++) { await mouse(a, { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 20 }); await Bun.sleep(16); }
  await Bun.sleep(600);
  const w = await a.ev<number>(`${S}.scrollTop`);
  check(Math.abs(w - 200) < 2, `5 a wheel still scrolls it by its deltas (${w.toFixed(0)} for 200)`);
  // Past its end: the content shows past the edge (shifted up), then bounces back to the end.
  await a.ev(`${S}.scrollTop = ${S}.scrollHeight`);
  await Bun.sleep(300);
  const bottom = await a.ev<number>(`${S}.scrollTop`);
  await traceStart(a, S);
  await drag(a, box.x, box.y, 0, -120, { steps: 10, ms: 16 });
  await until(async () => { const t = await a.ev<number[][]>(`__trace`); return t.length > 3 && t.slice(-3).every((r) => Math.abs(r[2]) < 0.01); }, 3000);
  const tb = await traceStop(a), least = Math.min(...tb.map((r) => r[2]));
  check(least < -10 && Math.abs(tb.at(-1)![2]) < 0.01 && Math.abs(tb.at(-1)![1] - bottom) < 1, `5 past the end: the content ${(-least).toFixed(1)} pt past it, back at the end after`);

  // 6. At its top a pull down is the demo card's close (the app's hand-off), not the list's rubber band.
  if (!perf) {
    await until(async () => { const v = await a.ev<number>(`${S}.scrollTop`); await Bun.sleep(120); return v === (await a.ev<number>(`${S}.scrollTop`)); }, 8000);
    await a.ev(`${S}.scrollTop = 0`);
    await Bun.sleep(300);
    await drag(a, box.x, box.y - 250, 0, 220, { steps: 14, ms: 16 });
    check(await until(() => a.ev(`location.pathname.replace(/\\/$/, '') === '/demos/app'`), 4000), '6 a mouse pull down at the list\'s top closes the demo (the card\'s close keeps its hand-off)');
  }

  if (perf) for (const [what, end] of [['a drag up and its momentum', false], ['a drag up past the end, the rubber band and its bounce back', true]] as const) {
    // Frame pacing in the app's renderer during a drag and its motion, and the paints and layouts meanwhile.
    await until(async () => { const v = await a.ev<number>(`${S}.scrollTop`); await Bun.sleep(120); return v === (await a.ev<number>(`${S}.scrollTop`)); }, 8000);
    // At the top (a pull down there is the demo card's close, not the list's), or at the end for the rubber band.
    await a.ev(`${S}.scrollTop = ${end ? `${S}.scrollHeight` : 0}`);
    await Bun.sleep(400);
    await a.ev(`(() => { window.__f = []; window.__fon = true; const f = (t) => { __f.push(t); if (__fon) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    const events: any[] = [];
    const off = cdp.on((e) => { if (e.method === 'Tracing.dataCollected') events.push(...e.params.value); });
    const done = new Promise<void>((r) => { const o = cdp.on((e) => { if (e.method === 'Tracing.tracingComplete') { o(); r(); } }); });
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] }, transferMode: 'ReportEvents' }, a.sessionId).catch(() => cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' }));
    await drag(a, box.x, box.y, 0, -200, { steps: 24, ms: 8 });
    await Bun.sleep(2000);
    await cdp.send('Tracing.end', {}, a.sessionId).catch(() => cdp.send('Tracing.end'));
    await done; off();
    const f = await a.ev<number[]>(`(__fon = false, __f)`);
    const d = f.slice(1).map((t, i) => t - f[i]).filter((x) => x > 0);
    const med = [...d].sort((p, q) => p - q)[Math.floor(d.length / 2)];
    const dropped = d.filter((x) => x > med * 1.5).length;
    const paints = events.filter((e) => e.name === 'Paint').length, layouts = events.filter((e) => e.name === 'Layout').length;
    const styles = events.filter((e) => e.name === 'UpdateLayoutTree').length;
    if (process.env.MOUSE_SCROLL_TRACE_NAMES) { const h: Record<string, number> = {}; for (const e of events) h[e.name] = (h[e.name] ?? 0) + 1; console.log(Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 40)); }
    console.log(`perf (${what}): ${d.length} frames at ${(1000 / med).toFixed(0)} Hz (median ${med.toFixed(2)} ms), ${dropped} over 1.5x, longest ${Math.max(...d).toFixed(1)} ms; trace: ${events.length} events, ${paints} Paint, ${layouts} Layout, ${styles} style recalcs`);
    check(dropped === 0, `perf (${what}): no dropped frame (${dropped} of ${d.length})`);
  }
  await a.page.close();
}

kill();
if (fails.length) { console.error(`mouse-scroll: ${fails.length} failure(s)`); process.exit(1); }
console.log('mouse-scroll: all good');
process.exit(0);
