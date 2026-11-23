#!/usr/bin/env bun
// One-off import: the design tokens of the reference site (src/app/globals.css `@theme` and `:root`) into tokens.css,
// which `bun exact.mjs forma import css tokens.css` turns into app.forma. The reference checkout is only read.
//   bun tools/tokens-from-reference.ts <reactiive.io checkout>
// Only values, never Tailwind's machinery: animations (--animate-*) and the font stacks (set in app.contract's `font`
// declarations) are left out; the reference is dark only, so every colour is fixed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ref = resolve(process.argv[2] ?? '../../reactiive.io');
const css = readFileSync(join(ref, 'src/app/globals.css'), 'utf8');
const sha = spawnSync('git', ['-C', ref, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const block = (start: string) => { const i = css.indexOf(start); let depth = 0, j = i; for (; j < css.length; j++) { if (css[j] === '{') depth++; if (css[j] === '}' && --depth === 0) break; } return css.slice(css.indexOf('{', i) + 1, j); };
const decls = (text: string) => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.replace(/\s+/g, ' ').trim()]);
const keep = ([k]: string[]) => !k.startsWith('--animate-') && !k.startsWith('--font-');
const tokens = [...decls(block('@theme {')), ...decls(block(':root {'))].filter(keep);
writeFileSync(resolve(import.meta.dir, '../tokens.css'), `/* The reference site's design tokens (reactiive.io ${sha}, src/app/globals.css \`@theme\` and \`:root\`), imported by
   tools/tokens-from-reference.ts; \`bun exact.mjs forma import css tokens.css\` writes them into app.forma.
   Dark only, as the reference. Names kept, so a row reads var(--color-text-secondary) as the reference's classes do. */
:root {
${tokens.map(([k, v]) => `  ${k}: ${v};`).join('\n')}
}
`);
console.log(`tokens.css: ${tokens.length} tokens from ${sha}`);
