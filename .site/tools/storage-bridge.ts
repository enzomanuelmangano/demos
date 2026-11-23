#!/usr/bin/env bun
// Writes web/storage.js (the old site's storage, kept: docs/storage.md) as the FIRST script of every built page's head,
// so it runs before anything of the runtime reads its persisted state. Only in a build with the accounts on
// (SITE_ACCOUNTS=1); then the reference's public obfuscation key EXPO_PUBLIC_ACCESS_KEY is required (the reference ships
// it in its browser bundle; here it reaches the page the same way, and never git: env or the gitignored .env.local).
// Without the accounts nothing is written: the public build stays byte-identical. Run after tools/observability.ts:
//   bun tools/storage-bridge.ts [dist]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SITE = resolve(import.meta.dir, '..');
const dist = resolve(SITE, process.argv[2] ?? 'dist');
const fromEnvLocal = (name: string) => {
  const p = join(SITE, '.env.local');
  if (!existsSync(p)) return '';
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(p, 'utf8'));
  return m ? m[1].trim() : '';
};
const setting = (name: string) => process.env[name] ?? fromEnvLocal(name);
if (setting('SITE_ACCOUNTS') !== '1') {
  console.log('storage-bridge: accounts off: nothing written');
  process.exit(0);
}
const KEY = setting('EXPO_PUBLIC_ACCESS_KEY');
if (!KEY) throw new Error('storage-bridge: SITE_ACCOUNTS=1 needs EXPO_PUBLIC_ACCESS_KEY (the reference\'s token key): without it every signed-in reader of the old site would be signed out (docs/storage.md)');
if (!/^[\x20-\x7e]+$/.test(KEY) || /['\\<]/.test(KEY)) throw new Error('storage-bridge: EXPO_PUBLIC_ACCESS_KEY is not plain printable ASCII');

const MARK = 'data-reactiive-storage';
const source = readFileSync(join(SITE, 'web/storage.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//')).join('\n');
if (!source.includes('__REACTIIVE_ACCESS_KEY__')) throw new Error('storage-bridge: web/storage.js lost its key placeholder');
const tag = `<script ${MARK}>${source.replace('__REACTIIVE_ACCESS_KEY__', KEY)}</script>`;

let pages = 0;
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    let html = readFileSync(p, 'utf8');
    if (html.includes(MARK)) html = html.replace(new RegExp(`<script ${MARK}>[\\s\\S]*?</script>`), '');
    // Exact writes no <head> tag: the head is what precedes the page's markup, opened by <meta charset> (first, so
    // the parser keeps the encoding); the script goes right after it, before Exact's own scripts.
    const m = /<meta charset=[^>]*>/i.exec(html);
    if (!m) { console.warn(`storage-bridge: no <meta charset> in ${p}: skipped`); continue; }
    const end = m.index + m[0].length;
    writeFileSync(p, html.slice(0, end) + tag + html.slice(end));
    pages++;
  }
};
walk(dist);
console.log(`storage-bridge: the storage script first in ${pages} pages' heads (${tag.length} bytes)`);
