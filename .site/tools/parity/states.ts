#!/usr/bin/env bun
// First-viewport screenshots of a page in a given interaction state, for the states a full-page shot cannot show:
//   bun tools/parity/states.ts <origin> <outDir> <state>[:<route>]... [--widths 1440,390] [--settle ms]
// States: `top` (the first viewport after the settle, no scroll-through), `menu` (the mobile menu opened by its
// button), `sim` (/demos scrolled to the Demos app's frame), `scrolled` (the page scrolled 30 px: the header's scrolled look). Writes <slug>.<state>@<w>.png and
// <slug>.<state>@<w>.dom.json (shoot.ts's box list), so compare-states or diff.ts can pair them with another origin.
import { launch, newPage } from './cdp.ts';
import { DOM_JS, slugName } from './shoot.ts';

const args = process.argv.slice(2);
const [origin, outDir] = args;
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const settleMs = Number(opt('--settle') ?? 3500);
const states = args.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));

const { cdp, kill } = await launch({ port: 9344 });
for (const spec of states) {
  const [state, route = '/'] = spec.split(':');
  for (const w of widths) {
    if (state === 'menu' && w >= 768) continue;
    const page = await newPage(cdp, w);
    await page.goto(origin + route);
    await Bun.sleep(settleMs);
    if (state === 'menu') {
      await page.eval(`document.querySelector('[aria-controls="mobile-menu"]').click()`);
      await Bun.sleep(800);
    } else if (state === 'sim') {
      // /demos: the Demos app's frame scrolled to just under the header (the page's scroller, as for `scrolled`).
      await page.eval(`(() => { const f = document.querySelector('iframe'); const y = f.getBoundingClientRect().top - (innerWidth < 768 ? 73 : 87) + 0; for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 30) { el.scrollTop += y; return; } } scrollBy(0, y); })()`);
      await Bun.sleep(1500);
    } else if (state === 'scrolled') {
      // The scroller is the document on the reference, a full-page scroll view on Exact: scroll whichever scrolls.
      await page.eval(`(() => { scrollTo(0, 30); for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 30) { el.scrollTop = 30; break; } } })()`);
      await Bun.sleep(800);
    }
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const name = `${slugName(route)}.${state}@${w}`;
    await Bun.write(`${outDir}/${name}.png`, Buffer.from(shot.data, 'base64'));
    await Bun.write(`${outDir}/${name}.dom.json`, JSON.stringify(await page.eval(DOM_JS)));
    await page.close();
    console.log('state', name);
  }
}
kill();
process.exit(0);
