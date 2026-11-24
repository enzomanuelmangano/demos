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
  // ExpandableMiniPlayer, `notion-qrcode` NotionQrCode), never whichever helper the file declares
  // first (MpArt, TtsPhoto). None named so is an error, not a guess.
  const names = [...text.matchAll(/^component (\w+)/gm)].map(m => m[1]);
  const name = names.find(n => n.toLowerCase() === slug.replace(/-/g, '').toLowerCase());
  if (!name) fail(slug, `no component named after the slug (expected ${slug.replace(/-/g, '')}, any case; found ${names.join(', ') || 'none'})`);
  const env = takesEnv(slug, name, text);
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

function fail(slug: string, why: string): never {
  console.error(`gen-index: demos/${slug}/${slug}.contract: ${why}`);
  process.exit(1);
}

function indent(line: string) { return line.length - line.trimStart().length; }
function quiet(line: string) { return line.trim() === '' || line.trimStart().startsWith('//'); }

// Whether the component's `props` block declares `env: DemoEnv`, read by indentation: the component
// is its header and every line after it up to the next code line at column 0 (blank lines and
// comments, at any column, belong to it); its props are the code lines indented deeper than `props`
// up to the next code line that is not. Checked against a plain search of the component's text, so
// a layout this does not understand fails instead of silently dropping (or adding) `env=env`.
function takesEnv(slug: string, name: string, text: string): boolean {
  const lines = text.split('\n');
  const at = lines.findIndex(l => new RegExp(`^component ${name}\\b`).test(l));
  let end = at + 1;
  while (end < lines.length && (quiet(lines[end]) || indent(lines[end]) > 0)) end++;
  const body = lines.slice(at + 1, end);
  let parsed = false;
  const p = body.findIndex(l => !quiet(l) && l.trim() === 'props');
  if (p >= 0) {
    const depth = indent(body[p]);
    for (const line of body.slice(p + 1)) {
      if (quiet(line)) continue;
      if (indent(line) <= depth) break;
      if (/^env\s*:\s*DemoEnv\b/.test(line.trim())) parsed = true;
    }
  }
  const mentioned = body.some(l => !quiet(l) && /\benv\s*:\s*DemoEnv\b/.test(l));
  if (parsed !== mentioned) {
    fail(slug, `component ${name}: ${mentioned ? '`env: DemoEnv` appears outside its props block' : 'props declare env but the plain search missed it'}; fix the file or this parser`);
  }
  return parsed;
}
