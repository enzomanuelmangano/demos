// Compiles one demo on its own, before it is registered: a scratch root beside app.contract
// that uses the demo's component, so its `../env.contract` imports resolve.
//
//   bun tools/check-demo.ts <slug>      (prints the compiler's JSON; [] = no errors)
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const slug = process.argv[2];
if (!slug) throw new Error('usage: bun tools/check-demo.ts <slug>');
const APP = resolve(import.meta.dir, '..');
const file = resolve(APP, `demos/${slug}/${slug}.contract`);
if (!existsSync(file)) throw new Error(`no ${file}`);
const name = readFileSync(file, 'utf8').match(/^component (\w+)/m)?.[1];
if (!name) throw new Error(`${file}: no component`);
const takesEnv = new RegExp(`component ${name}\\s*\\n\\s*props[\\s\\S]*?\\n\\s+env: DemoEnv`).test(readFileSync(file, 'utf8'));
const scratch = resolve(APP, `_check_${slug.replaceAll('-', '_')}.contract`);
writeFileSync(scratch, `use ${name} from "./demos/${slug}/${slug}.contract"
use DemoEnv from "./demos/env.contract"

component Check
  view
    column position="absolute" inset=0
      ${name}(${takesEnv ? 'env=DemoEnv(width=420, height=912, safeTop=68, epoch=1794268800000, utcOffset=60, seed=1, reducedMotion=false)' : ''})
`);
try {
  const r = spawnSync(process.execPath, ['exact.mjs', 'contract', 'build', scratch, '--json', '--errors-only'], { cwd: APP, encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr.split('\n').filter(l => !l.includes('.d.ts')).join('\n'));
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(scratch, { force: true });
  rmSync(scratch.replace(/\.contract$/, '.contract.d.ts'), { force: true });
}
