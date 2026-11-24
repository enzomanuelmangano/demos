#!/usr/bin/env bun
// The gesture/UI demos' gallery, /_dev/interactive-ui (pages/dev-interactive-ui.contract), for development only: it is
// not a route of the site, so production pages carry none of it. This adds the route to a copy of app.contract for
// one build into dist/gallery (gitignored), puts app.contract back whatever happens, then serves that build.
//   bun components/interactive/gesture-kit/.tools/gallery.ts [--port 4313] [--no-serve]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = join(import.meta.dir, '../../../..');
const app = join(site, 'app.contract');
const original = readFileSync(app, 'utf8');
const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '4313';
const at = (s: string, anchor: string, add: string, after = true) => {
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`gallery: app.contract has no ${JSON.stringify(anchor.trim())}`);
  return after ? s.slice(0, i + anchor.length) + add + s.slice(i + anchor.length) : s.slice(0, i) + add + s.slice(i);
};
let patched = at(original, '\n// The faces', '\nuse DevInteractiveUi from "./pages/dev-interactive-ui.contract"', false);
patched = at(patched, '  notfound render=build', '  devInteractiveUi "/_dev/interactive-ui" render=build activate=idle\n', false);
patched = at(patched, '              else\n                head title="Page not found',
  '              else if e.name == "devInteractiveUi"\n                head title="Interactive demos: gesture and UI | Reactiive" robots="noindex, nofollow"\n' +
  '                  description="Development gallery of the gesture and UI article demos."\n                DevInteractiveUi()\n', false);
let status = 1;
try {
  writeFileSync(app, patched);
  status = spawnSync('bun', ['exact.mjs', 'web-build', '--out', 'dist/gallery'], { cwd: site, stdio: 'inherit' }).status ?? 1;
} finally {
  writeFileSync(app, original);
}
if (status !== 0) process.exit(status);
console.log(`gallery: dist/gallery built; http://127.0.0.1:${port}/_dev/interactive-ui`);
// A plain static server: `exact serve` would build the app again (app.contract is back, so without the gallery).
if (!process.argv.includes('--no-serve')) {
  const root = join(site, 'dist/gallery');
  Bun.serve({
    port: Number(port), hostname: '127.0.0.1',
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      for (const p of [path, join(path, 'index.html')]) {
        const f = Bun.file(join(root, p));
        if (p !== '/' && existsSync(join(root, p)) && statSync(join(root, p)).isFile()) return new Response(f);
      }
      return new Response(Bun.file(join(root, '404.html')), { status: 404, headers: { 'content-type': 'text/html' } });
    },
  });
}
