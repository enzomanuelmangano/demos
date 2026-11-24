#!/usr/bin/env bun
// Screenshots and structure of pages, the live sweep's way (1440x900 desktop, 390x844 touch; 3.5 s settle (--settle), one
// scroll-through so reveal-on-scroll content fires, back to the top; full page, JPEG q70, capped at 16,000 px):
//   bun tools/parity/shoot.ts <origin> <outDir> <route>... [--routes routes.json] [--widths 1440,390]
// Writes <slug>@<w>.jpg (slug: "/" → home, "/a/b" → a__b), <slug>@<w>.dom.json (every visible box: tag, own text,
// rect and the computed styles parity depends on) and metrics.json (the live sweep's fields).
import { readFileSync } from 'node:fs';
import { launch, newPage } from './cdp.ts';

const args = process.argv.slice(2);
const [origin, outDir] = args;
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const routes = args.slice(2).filter((a, i) => !a.startsWith('--') && !(i > 0 && args.slice(2)[i - 1].startsWith('--')));
if (opt('--routes')) routes.push(...JSON.parse(readFileSync(opt('--routes')!, 'utf8')));
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
export const slugName = (r: string) => (r === '/' ? 'home' : r.slice(1).replace(/\//g, '__'));

export const METRICS_JS = `(() => {
  const q = (s) => document.querySelector(s);
  const meta = (n) => (q('meta[name="'+n+'"]') || q('meta[property="'+n+'"]'))?.content ?? null;
  return {
    title: document.title, description: meta('description'), canonical: q('link[rel="canonical"]')?.href ?? null,
    ogImage: meta('og:image'), ogType: meta('og:type'), twitterCard: meta('twitter:card'), robots: meta('robots'),
    height: document.documentElement.scrollHeight,
    links: document.querySelectorAll('a[href]').length, images: document.querySelectorAll('img').length,
    videos: document.querySelectorAll('video').length, canvases: document.querySelectorAll('canvas').length,
    iframes: document.querySelectorAll('iframe').length,
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ':' + h.textContent.trim().slice(0,60)).slice(0,40),
    codeBlocks: document.querySelectorAll('pre').length,
    jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
  };
})()`;

export const DOM_JS = `(() => {
  const keys = ['display','position','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderTopWidth','borderTopColor','borderBottomWidth','borderBottomColor','borderRadius','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','textDecorationLine','opacity','boxShadow','maxWidth','textTransform','textAlign'];
  const out = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    const own = nodes.map(n => n.textContent).join('').replace(/\\s+/g, ' ').trim();
    // A text's box is its glyphs' (a Range over its own text), so a word in a padded link and the same word in a
    // span inside it, or in a display: contents span, compare alike.
    let r = el.getBoundingClientRect();
    if (own) { const range = document.createRange(); range.setStartBefore(nodes[0]); range.setEndAfter(nodes[nodes.length - 1]); r = range.getBoundingClientRect(); }
    if (r.width > 0 && r.height > 0) {
      const s = {}; for (const k of keys) s[k] = cs[k];
      out.push({ depth, tag: el.tagName.toLowerCase(), text: own.slice(0, 80), rect: [r.x, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10), href: el.getAttribute('href') ?? undefined, s });
    }
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return out;
})()`;

// --settle <ms> (default 3500): a page whose runtime starts later than that (live's RevealOnScroll hydrates after a
// cold load's 3.5 s on the series pages) needs longer, or its paused entrances are shot unplayed.
export async function settle(page: any) {
  await Bun.sleep(Number(opt('--settle') ?? 3500));
  // --scroll <step px>,<ms> (default 600,60): live's RevealOnScroll misses cards passed at 600 px per 60 ms (they stay
  // paused, unplayed, in the shot); 300,150 reveals them as a reader's scroll does.
  const [step, ms] = (opt('--scroll') ?? '600,60').split(',').map(Number);
  await page.eval(`(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=${step}){scrollTo(0,y);await new Promise(r=>setTimeout(r,${ms}))}scrollTo(0,0)})()`);
  // A page whose demos are far down starts its runtime when the reader pauses near one (web/reveal.js); the scroll
  // above never pauses, so the shot (the whole page, every demo drawn, as a reader who reached them sees it) starts it.
  await page.eval(`self.exact && self.exact.startNow && self.exact.startNow()`);
  await Bun.sleep(1200);
}

if (import.meta.main) {
  const { cdp, kill } = await launch({ port: 9342 });
  const metrics: any[] = [];
  for (const route of routes) {
    const entry: any = { route };
    for (const w of widths) {
      const page = await newPage(cdp, w);
      let status = 0;
      page.on((e) => { if (e.method === 'Network.responseReceived' && e.params.type === 'Document' && !status) status = e.params.response.status; });
      await page.goto(origin + route);
      await settle(page);
      const m = await page.eval(METRICS_JS);
      const h = Math.min(m.height, 16000);
      // A full-page capture draws beyond the window, where `content-visibility: auto` skips a box's contents (the code
      // blocks', web/content.css): show them all for the shot, as a reader scrolling there sees them.
      await page.eval(`document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '*{content-visibility:visible !important}' })); document.body.offsetHeight`);
      await Bun.sleep(100);
      const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
      await Bun.write(`${outDir}/${slugName(route)}@${w}.jpg`, Buffer.from(shot.data, 'base64'));
      await Bun.write(`${outDir}/${slugName(route)}@${w}.dom.json`, JSON.stringify(await page.eval(DOM_JS)));
      entry[w] = { ...m, httpStatus: status };
      await page.close();
    }
    metrics.push(entry);
    console.log('shot', route);
  }
  await Bun.write(`${outDir}/metrics.json`, JSON.stringify(metrics, null, 2));
  kill();
  process.exit(0);
}
