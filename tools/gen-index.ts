// Writes demos/index.contract: the demos tools/ported.txt lists (one slug a line: those
// integrated and checked on the simulator), each registered by slug.
//
//   bun tools/gen-index.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = resolve(import.meta.dir, '..');
const dirs = readFileSync(resolve(APP, 'tools/ported.txt'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean).sort();
const rows = dirs.flatMap(slug => {
  const file = resolve(APP, `demos/${slug}/${slug}.contract`);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  // The demo's entry component: the one named after the slug (`expandable-mini-player` is
  // ExpandableMiniPlayer, `notion-qrcode` NotionQrCode), not whichever helper a file declares first
  // (MpArt, TtsPhoto); the first component only when none is.
  const names = [...text.matchAll(/^component (\w+)/gm)].map(m => m[1]);
  const name = names.find(n => n.toLowerCase() === slug.replace(/-/g, '').toLowerCase()) ?? names[0];
  if (!name) return [];
  // Whether its props take `env: DemoEnv` (an `inject` block may come before `props`).
  const body = text.slice(text.search(new RegExp(`^component ${name}\\b`, 'm'))).split(/\n(?=\S)/)[0];
  const env = /^\s+props\s*\n(?:\s{4,}.*\n)*?\s{4,}env: DemoEnv\b/m.test(body);
  return [{ slug, name, env }];
});
writeFileSync(resolve(APP, 'demos/index.contract'), `// The demos ported to Exact, by slug. Each lives in demos/<slug>/. Written by tools/gen-index.ts.
use DemoEnv from "./env.contract"
${rows.map(r => `use ${r.name} from "./${r.slug}/${r.slug}.contract"`).join('\n')}

component PortedDemo
  props
    slug: string
    env: DemoEnv
  view
    column position="absolute" inset=0
${rows.map(r => `      if slug == "${r.slug}"\n        ${r.name}(${r.env ? 'env=env' : ''})`).join('\n')}
`);
console.log(`${rows.length} demos registered`);
