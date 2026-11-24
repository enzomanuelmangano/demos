#!/usr/bin/env bun
// The card cascade, frame by frame (docs/parity.md, "motion"): ArticleList's motion-card-in and RevealOnScroll on two
// origins. A recorder installed before the page's own scripts samples every card on every animation frame from the
// navigation's start: its opacity and transform, its animation's play state, delay, duration and easing
// (getAnimations()), and the scroll offset. After the first screen settles, the page is scrolled at a steady speed
// to its end. Per card (matched by its link): when it starts to show (opacity > 0.01), when it is done, the scroll
// offset at its start, its delay, and whether it ever showed its final state before its entrance (a flash) or hid
// again once shown (a restart).
//   bun tools/parity/reveal.ts <live origin> <local origin> <route>... [--widths 1440,390] [--speed 1200] [--out f]
import { launch, newPage } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [live, local] = args;
const routes = args.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const speed = Number(opt('--speed') ?? 1200); // px per second
const out = opt('--out') ?? '/tmp/site-reveal.json';

const RECORDER = `(() => {
  const rec = window.__reveal = { frames: 0, cards: {}, order: [] };
  const cards = () => [...document.querySelectorAll('.motion-card-in, [data-motion~="card-in"]')];
  const tick = () => {
    rec.frames++;
    const t = performance.now(), y = window.scrollY;
    for (const el of cards()) {
      const a = el.querySelector('a[href]') || el.closest('a[href]') || el;
      const key = a.getAttribute('href') || '';
      let c = rec.cards[key];
      if (!c) { c = rec.cards[key] = { key, seen: t, first: -1, done: -1, y: -1, flash: false, maxBefore: 0, anim: null, paused: false, top: -1 }; rec.order.push(key); }
      const s = getComputedStyle(el), o = Number(s.opacity);
      const an = el.getAnimations().find((x) => x.animationName === 'motion-card-in');
      if (an) {
        const tm = an.effect.getTiming();
        if (!c.anim) c.anim = { delay: tm.delay, duration: tm.duration, easing: an.effect.getKeyframes()[0]?.easing + ' / ' + getComputedStyle(el).animationTimingFunction, fill: tm.fill };
        else c.anim.delay = tm.delay;
        if (an.playState === 'paused') c.paused = true;
      }
      if (c.first < 0) {
        if (o > 0.01) { c.first = t; c.y = y; c.top = el.getBoundingClientRect().top; c.started = an ? an.startTime : null; }
        c.maxBefore = Math.max(c.maxBefore, o);
      }
      if (c.first >= 0 && c.done < 0 && o >= 0.999 && (!an || an.playState === 'finished')) c.done = t;
      if (c.first < 0 && !an && o >= 0.999) c.flash = true; // drawn finished with no entrance pending
      if (c.done >= 0 && o < 0.9) c.restart = true; // shown, then hidden again (a node redrawn, an entrance replayed)
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const SCROLL = (pxs: number) => `new Promise((res) => {
  const start = performance.now(), y0 = scrollY, max = document.documentElement.scrollHeight - innerHeight;
  const step = () => { const y = Math.min(max, y0 + (performance.now() - start) * ${pxs} / 1000); scrollTo(0, y); if (y < max) requestAnimationFrame(step); else setTimeout(res, 1500); };
  requestAnimationFrame(step);
})`;

const { cdp, kill } = await launch({ port: 9360 });
const result: any = {};
for (const route of routes) for (const width of widths) {
  const runs: any = {};
  for (const [name, origin] of [['live', live], ['local', local]] as const) {
    const page = await newPage(cdp, width);
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
    await page.goto(origin + route);
    await Bun.sleep(2500);
    const scrollAt = await page.eval('performance.now()');
    await page.eval(SCROLL(speed));
    const r = await page.eval('JSON.stringify(window.__reveal)');
    runs[name] = { scrollAt, ...JSON.parse(r) };
    await page.close();
  }
  result[`${route}@${width}`] = runs;
  const L = runs.live, X = runs.local;
  console.log(`\n${route} @ ${width}: scroll from ${L.scrollAt.toFixed(0)} / ${X.scrollAt.toFixed(0)} ms at ${speed} px/s; frames ${L.frames} / ${X.frames}`);
  console.log('card'.padEnd(44), 'live: first  done  y     delay paused flash'.padEnd(46), '| local: first  done  y     delay paused flash');
  const fmt = (c: any) => c ? `${String(Math.round(c.first)).padStart(6)} ${String(Math.round(c.done)).padStart(5)} ${String(Math.round(c.y)).padStart(5)} ${String(c.anim?.delay ?? '-').padStart(5)} ${c.paused ? 'yes' : 'no '}    ${c.flash ? 'FLASH' : ''}${c.restart ? 'RESTART' : ''}` : '(none)';
  for (const key of L.order.concat(X.order.filter((k: string) => !L.order.includes(k)))) {
    const a = L.cards[key], b = X.cards[key];
    // Relative to the scroll's start for cards revealed by the scroll: the pages load at different speeds.
    console.log(key.slice(0, 43).padEnd(44), fmt(a).padEnd(46), '|', fmt(b));
  }
}
await Bun.write(out, JSON.stringify(result, null, 1));
kill();
