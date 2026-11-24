#!/usr/bin/env bun
// The canvas demos' gallery, /_dev/interactive (pages/dev-interactive.contract), for development only: it is not a
// route of the site, so production pages carry none of it. As gesture-kit/.tools/gallery.ts: the route goes into a
// copy of app.contract for one build into dist/gallery-canvas (gitignored), app.contract is put back whatever
// happens, then that build is served.
//   bun components/interactive/_canvas/.tools/gallery.ts [--port 4312] [--no-serve]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = join(import.meta.dir, '../../../..');
const app = join(site, 'app.contract');
const original = readFileSync(app, 'utf8');
const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '4312';
const out = 'dist/gallery-canvas';
const at = (s: string, anchor: string, add: string) => {
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`gallery: app.contract has no ${JSON.stringify(anchor.trim())}`);
  return s.slice(0, i) + add + s.slice(i);
};
let patched = at(original, '\n// The faces', '\nuse DevInteractive from "./pages/dev-interactive.contract"');
patched = at(patched, '  notfound render=build', '  devInteractive "/_dev/interactive" render=build activate=idle\n');
patched = at(patched, '              else\n                head title="Page not found',
  '              else if e.name == "devInteractive"\n                head title="Interactive demos: canvas | Reactiive" robots="noindex, nofollow"\n' +
  '                  description="Development gallery of the canvas article demos."\n                DevInteractive()\n');
let status = 1;
try {
  writeFileSync(app, patched);
  status = spawnSync('bun', ['exact.mjs', 'web-build', '--out', out], { cwd: site, stdio: 'inherit' }).status ?? 1;
} finally {
  writeFileSync(app, original);
}
if (status !== 0) process.exit(status);
console.log(`gallery: ${out} built; http://127.0.0.1:${port}/_dev/interactive`);
// A plain static server: `exact serve` would build the app again (app.contract is back, so without the gallery).
if (!process.argv.includes('--no-serve')) {
  const root = join(site, out);
  Bun.serve({
    port: Number(port), hostname: '127.0.0.1',
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      for (const p of [path, join(path, 'index.html')]) {
        if (p !== '/' && existsSync(join(root, p)) && statSync(join(root, p)).isFile()) return new Response(Bun.file(join(root, p)));
      }
      return new Response(Bun.file(join(root, '404.html')), { status: 404, headers: { 'content-type': 'text/html' } });
    },
  });
}
