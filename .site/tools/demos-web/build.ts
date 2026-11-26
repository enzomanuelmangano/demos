#!/usr/bin/env bun
// The Demos app's own web build, mounted at /demos/app/ of the site and shown in the /demos page (docs/decisions.md D10).
//
//   bun tools/demos-web/build.ts [--rev <git-rev>] [--key-only] [--force]
//
// 1. key = sha256 over the demos app's inputs at <rev> (default HEAD): every tracked path of the repo root but the
//    deny-list (.site .legacy .parity .github and *.md), which keeps app.forma and .cargo/, plus the demos' Exact seed
//    and this file's overlay version. A site-only change keeps the key; any demos change makes a new one.
// 2. Cache hit (.site/.out/demos-web/<key>/dist with a demos-web.json): nothing to do.
// 3. Miss: `git archive <rev>` into a scratch directory (the repo's own tree is never touched), the CI-only manifest
//    overlay host.web.base = "/demos/app/" applied there, `bun install --frozen-lockfile`, then
//    `bun exact.mjs web-build --out dist --render js`. Exact refuses a non-root base for the wasm target, bakes, the Rust
//    renderer, --plan and auth, so this never passes --wasm or --plan and pins --render js.
//    The scratch tree has no assets/audio/ (gitignored: the audio-player demo's copyrighted track) and no assets/atlas/
//    (gitignored: native macOS desk-mode tiles; the web shows the framed phone shell), so the published build carries
//    neither: the audio player plays its silent nominal 3:00 (demos/audio-player/audio-player.contract, line 10).
//
// Env: DEMOS_WEB_SCRATCH (default $TMPDIR/reactiive-demos-web-src, wiped per build), EXACT (an Exact checkout at the demos' seed; default ~/.exact/exact2/<seed>), CARGO_TARGET_DIR (kept between
// builds; default <scratch>/target), DEMOS_WEB_CACHE (default .site/.out/demos-web).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

export const OVERLAY_VERSION = 2;
export const BASE = '/demos/app/';
/** Top-level paths that are not the demos app's inputs. */
export const DENY_TOP = ['.site', '.legacy', '.parity', '.github'];

const site = resolve(import.meta.dir, '../..');
const repo = resolve(site, '..');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const git = (...args: string[]) => {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

export function isInput(path: string) {
  const top = path.split('/')[0];
  return !DENY_TOP.includes(top) && !path.endsWith('.md');
}

/** The demos' Exact checkout sha, from the root exact.mjs seed line at <rev>. */
export function seedAt(rev: string) {
  const m = /const seed = "[^"]*\/([0-9a-f]{40})"/.exec(git('show', `${rev}:exact.mjs`));
  if (!m) throw new Error('exact.mjs: no seed sha');
  return m[1];
}

export function keyAt(rev: string) {
  const tree = git('ls-tree', '-r', '--full-tree', rev).split('\n').filter(Boolean)
    .filter((line) => isInput(line.slice(line.indexOf('\t') + 1)));
  const h = createHash('sha256');
  h.update(`demos-web v${OVERLAY_VERSION} base ${BASE} seed ${seedAt(rev)}\n`);
  for (const line of tree) h.update(line + '\n');
  return { key: h.digest('hex').slice(0, 32), paths: tree.length };
}

function treeDigest(dir: string) {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(dir);
  files.sort();
  const h = createHash('sha256');
  let bytes = 0;
  for (const f of files) { const b = readFileSync(f); bytes += b.length; h.update(`${relative(dir, f)}\0${createHash('sha256').update(b).digest('hex')}\n`); }
  return { sha256: h.digest('hex'), files: files.length, bytes };
}

if (import.meta.main) {
  const rev = git('rev-parse', arg('--rev') ?? 'HEAD').trim();
  const { key, paths } = keyAt(rev);
  if (process.argv.includes('--key-only')) { console.log(key); process.exit(0); }
  const cache = resolve(process.env.DEMOS_WEB_CACHE ?? join(site, '.out/demos-web'));
  const out = join(cache, key);
  if (existsSync(join(out, 'demos-web.json')) && !process.argv.includes('--force')) {
    console.log(`demos-web: cached ${key} (${out})`);
    process.exit(0);
  }
  const seed = seedAt(rev);
  const exact = resolve(process.env.EXACT ?? join(homedir(), '.exact/exact2', seed));
  if (!existsSync(join(exact, 'scripts/app-cli.mjs'))) throw new Error(`no Exact checkout at ${exact}: set EXACT to expo/exact at ${seed}`);
  // One fixed scratch path: Exact ties a CARGO_TARGET_DIR's crates to the app directory that built them.
  const scratch = resolve(process.env.DEMOS_WEB_SCRATCH ?? join(tmpdir(), 'reactiive-demos-web-src'));
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const run = (cmd: string, args: string[], env: Record<string, string> = {}) => {
    console.log(`demos-web: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: scratch, stdio: 'inherit', env: { ...process.env, EXACT: exact, ...env } });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  };
  const started = Date.now();
  try {
    // Only the inputs reach the scratch tree: the site, .legacy, .parity, .github and the docs are not even there.
    const pathspec = [...DENY_TOP.map((p) => `':(exclude)${p}'`), `':(exclude,glob)**/*.md'`].join(' ');
    run('sh', ['-c', `git -C "${repo}" archive ${rev} -- . ${pathspec} | tar -x -C "${scratch}"`]);
    for (const p of DENY_TOP) if (existsSync(join(scratch, p))) throw new Error(`${p} reached the scratch tree`);
    for (const gone of ['assets/audio', 'assets/atlas']) if (existsSync(join(scratch, gone))) throw new Error(`${gone} is in git at ${rev}: it must never be published`);
    const manifest = JSON.parse(readFileSync(join(scratch, 'app.json'), 'utf8'));
    manifest.host = { ...manifest.host, web: { ...manifest.host?.web, base: BASE } };
    writeFileSync(join(scratch, 'app.json'), JSON.stringify(manifest, null, 2) + '\n');
    run('bun', ['exact.mjs', '--help'], {}); // makes .exact/checkout, which package.json's file: dependency reads
    run('bun', ['install', '--frozen-lockfile']);
    // On Linux the web build reads the native modules' factory roster in Chrome (Exact d885904c host/web-js/module.mjs,
    // Bun.WebView with Playwright's build). A CI runner (Ubuntu's AppArmor refuses Chrome's sandbox) and Vercel's
    // build (root) both need it unsandboxed: a wrapper, as Exact's CHROME, adds --no-sandbox. macOS uses WebKit.
    const chrome: Record<string, string> = {};
    if (process.platform === 'linux' && !process.env.CHROME) {
      const real = spawnSync('bun', ['-e', `console.log(require(${JSON.stringify(join(exact, 'node_modules/playwright-core'))}).chromium.executablePath())`], { encoding: 'utf8' }).stdout.trim();
      if (real) {
        const wrapper = join(scratch, 'chrome-no-sandbox');
        writeFileSync(wrapper, `#!/bin/sh\nexec ${JSON.stringify(real)} --no-sandbox --disable-dev-shm-usage "$@"\n`, { mode: 0o755 });
        chrome.CHROME = wrapper;
      }
    }
    run('bun', ['exact.mjs', 'web-build', '--out', 'dist', '--render', 'js'], { CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? join(scratch, 'target'), ...chrome });
    const dist = join(scratch, 'dist');
    const routes = JSON.parse(readFileSync(join(dist, 'routes.json'), 'utf8'));
    if (routes.base !== BASE) throw new Error(`routes.json base ${routes.base}, expected ${BASE}`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    cpSync(dist, join(out, 'dist'), { recursive: true });
    const digest = treeDigest(join(out, 'dist'));
    // demos.contract's blob: tools/compose.ts reads the app's slugs at HEAD for an artifact from a commit it lacks only if
    // this matches HEAD's.
    const contract = git('rev-parse', `${rev}:demos.contract`).trim();
    const record = { key, rev, seed, contract, base: BASE, inputs: paths, overlay: OVERLAY_VERSION, builtAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), dist: digest };
    writeFileSync(join(out, 'demos-web.json'), JSON.stringify(record, null, 2) + '\n');
    console.log(`demos-web: built ${key}: ${digest.files} files, ${(digest.bytes / 2 ** 20).toFixed(1)} MiB, sha256 ${digest.sha256.slice(0, 16)}… in ${record.seconds}s`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
