#!/usr/bin/env bun
// Writes web/head.css into app.json's host.web.head as the script that adds it (the head takes no style tag), and
// checks that the copy there is current (`--check`, for CI). Run after editing web/head.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = join(import.meta.dir, '..');
const css = readFileSync(join(site, 'web/head.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.trim()).filter(Boolean).join('');
const text = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();`;
const path = join(site, 'app.json');
const app = JSON.parse(readFileSync(path, 'utf8'));
const head: any[] = app.host.web.head;
const i = head.findIndex((h) => h.script?.text?.includes("document.createElement('style')"));
if (i < 0) throw new Error('head: no style script in app.json host.web.head');
if (process.argv.includes('--check')) {
  if (head[i].script.text !== text) { console.error('head: app.json is stale: run bun tools/head.ts'); process.exit(1); }
  process.exit(0);
}
head[i] = { script: { text } };
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');
console.log(`head: ${css.length} bytes of CSS in app.json`);
