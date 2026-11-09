// Writes demos/index.contract: every demos/<slug>/<slug>.contract whose root component compiles
// alone (tools/check-demo.ts), registered by slug.
//
//   bun tools/gen-index.ts [--only slug,slug]   (default: every demo folder)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = resolve(import.meta.dir, '..');
const dirs = readdirSync(resolve(APP, 'demos'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
const rows = dirs.flatMap(slug => {
  const file = resolve(APP, `demos/${slug}/${slug}.contract`);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const name = text.match(/^component (\w+)/m)?.[1];
  if (!name) return [];
  const env = new RegExp(`component ${name}\\s*\\n\\s*props[\\s\\S]*?\\n\\s+env: DemoEnv`).test(text);
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
