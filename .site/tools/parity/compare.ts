#!/usr/bin/env bun
// Parity of the rebuild against the live site, page by page (docs/parity.md):
//   bun tools/parity/compare.ts <live dir> <local dir> [<route>...]
// Both dirs are shoot.ts outputs (screenshots, *.dom.json, metrics.json). For each route and width:
// - head: title, description, canonical, og:image, og:type, twitter:card, robots equal;
// - counts: links, images, videos, iframes, canvases, code blocks, JSON-LD equal; headings list equal;
// - height within 1% (the reference's own tolerance);
// - text boxes: every visible text of the live page found in the local one at the same place (±2 px) and size;
// - pixels: share of differing pixels (threshold 32/255, JPEG noise) over the first viewport and the full page.
// Writes <out>/compare.json and diff images <route>@<w>.diff.png beside the local shots.
import { existsSync, readFileSync } from 'node:fs';
import { launch, newPage } from './cdp.ts';
import { diffImages } from './diff.ts';
import { slugName } from './shoot.ts';

const [liveDir, localDir, ...only] = process.argv.slice(2);
const live: any[] = JSON.parse(readFileSync(`${liveDir}/metrics.json`, 'utf8'));
const local: any[] = JSON.parse(readFileSync(`${localDir}/metrics.json`, 'utf8'));
const HEAD = ['title', 'description', 'canonical', 'ogImage', 'ogType', 'twitterCard', 'robots'];
const COUNTS = ['links', 'images', 'videos', 'iframes', 'canvases', 'codeBlocks', 'jsonLd'];
const { cdp, kill } = await launch({ port: 9343 });
const page = await newPage(cdp, 1440);
const report: any[] = [];

type Box = { text: string; rect: number[]; s: any };
const texts = (file: string): Box[] => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []).filter((b: Box) => b.text);

for (const l of local) {
  const route = l.route;
  if (only.length && !only.includes(route)) continue;
  const ref = live.find((x) => x.route === route);
  if (!ref) { report.push({ route, missing: 'no live capture' }); continue; }
  for (const w of Object.keys(l).filter((k) => /^\d+$/.test(k))) {
    const a = ref[w], b = l[w], issues: string[] = [];
    for (const k of HEAD) if ((a[k] ?? null) !== (b[k] ?? null)) issues.push(`${k}: ${JSON.stringify(a[k])} ≠ ${JSON.stringify(b[k])}`);
    for (const k of COUNTS) if ((a[k] ?? 0) !== (b[k] ?? 0)) issues.push(`${k}: ${a[k]} ≠ ${b[k]}`);
    if (JSON.stringify(a.headings) !== JSON.stringify(b.headings)) issues.push(`headings: ${JSON.stringify(a.headings)} ≠ ${JSON.stringify(b.headings)}`);
    if (Math.abs(a.height - b.height) > a.height * 0.01) issues.push(`height: ${a.height} ≠ ${b.height}`);
    const name = `${slugName(route)}@${w}`;
    const lt = texts(`${liveDir}/${name}.dom.json`), bt = texts(`${localDir}/${name}.dom.json`);
    let placed = 0;
    const misplaced: string[] = [];
    for (const t of lt) {
      const dist = (x: Box) => Math.abs(x.rect[0] - t.rect[0]) + Math.abs(x.rect[1] - t.rect[1]);
      const m = bt.filter((x) => x.text === t.text).sort((p, q) => dist(p) - dist(q))[0];
      const ok = m && Math.abs(m.rect[0] - t.rect[0]) <= 2 && Math.abs(m.rect[1] - t.rect[1]) <= 2 && Math.abs(m.rect[2] - t.rect[2]) <= 2 && m.s.fontSize === t.s.fontSize && m.s.fontWeight === t.s.fontWeight;
      if (ok) placed++;
      else misplaced.push(`"${t.text.slice(0, 30)}" ${JSON.stringify(t.rect)} ${t.s.fontSize}/${t.s.fontWeight} → ${m ? JSON.stringify(m.rect) + ' ' + m.s.fontSize + '/' + m.s.fontWeight : 'missing'}`);
    }
    const full = await diffImages(page, `${liveDir}/${name}.jpg`, `${localDir}/${name}.jpg`, { diffOut: `${localDir}/${name}.diff.png` });
    report.push({ route, width: Number(w), pixels: Math.round(full.ratio * 10000) / 100, size: [full.a, full.b], texts: `${placed}/${lt.length}`, issues, misplaced: misplaced.slice(0, 12) });
  }
}
await Bun.write(`${localDir}/compare.json`, JSON.stringify(report, null, 2));
for (const r of report) console.log(`${r.route} @${r.width}: ${r.pixels}% px, texts ${r.texts}${r.issues?.length ? ', ' + r.issues.length + ' issues' : ''}`);
kill();
process.exit(0);
