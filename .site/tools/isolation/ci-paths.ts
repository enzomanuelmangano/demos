#!/usr/bin/env bun
// Which workflows a change triggers, by GitHub's own `paths` rules (patterns in order, the last match wins, `!` negates;
// `*` stops at `/`, `**` does not), evaluated over the repo's workflow files (docs/isolation.md, proof 4).
//   bun tools/isolation/ci-paths.ts            the scenario table
//   bun tools/isolation/ci-paths.ts <file>...  the workflows those changed files trigger
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const workflows = resolve(import.meta.dir, '../../../.github/workflows');
type Filter = { event: string; paths?: string[]; ignore?: string[] };
const filters = new Map<string, Filter[]>();
for (const f of readdirSync(workflows).filter((n) => /\.ya?ml$/.test(n))) {
  const on = (Bun as any).YAML.parse(readFileSync(join(workflows, f), 'utf8')).on ?? {};
  const list: Filter[] = [];
  for (const event of ['push', 'pull_request']) if (event in on) list.push({ event, paths: on[event]?.paths, ignore: on[event]?.['paths-ignore'] });
  filters.set(f, list);
}
const matches = (file: string, patterns: string[]) => {
  let hit = false;
  for (const p of patterns) {
    const neg = p.startsWith('!'), glob = new Bun.Glob(neg ? p.slice(1) : p);
    if (glob.match(file)) hit = !neg;
  }
  return hit;
};
export function triggered(files: string[], event = 'pull_request') {
  const out: string[] = [];
  for (const [wf, list] of filters) for (const f of list) {
    if (f.event !== event) continue;
    const on = f.paths ? files.some((x) => matches(x, f.paths!)) : f.ignore ? files.some((x) => !matches(x, f.ignore!)) : true;
    if (on) out.push(wf);
  }
  return out.sort();
}
const args = process.argv.slice(2);
if (args.length) console.log(triggered(args).join('\n') || '(none)');
else {
  const scenarios: [string, string[]][] = [
    ['site only', ['.site/app.contract', '.site/tools/compose.ts', '.site/docs/progress.md', '.site/.content/articles/metaball/index.mdx']],
    ['demos app only', ['app.contract', 'demos/chessboard/chessboard.contract', 'gpu/src/lib.rs', 'app.forma', '.cargo/config.toml']],
    ['legacy only', ['.legacy/src/App.tsx']],
    ['parity tooling only', ['.parity/README.md']],
  ];
  console.log('| change | pull_request triggers | push triggers |\n|---|---|---|');
  for (const [name, files] of scenarios) console.log(`| ${name} | ${triggered(files).join(', ') || 'none'} | ${triggered(files, 'push').join(', ') || 'none'} |`);
}
