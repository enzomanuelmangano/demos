#!/usr/bin/env bun
// The whole deploy build, run by Vercel's own Git integration (.site/vercel.json; docs/deploy.md). It does what
// .github/workflows/site-deploy.yml does, on Vercel's build machine, and leaves the Build Output API tree in
// .site/.vercel/output, which Vercel serves as is.
//
//   0. The toolchain, every build (the site's own web build compiles Exact's tools with Rust too: Exact ships no
//      prebuilt set): rustup and `exact setup --platform web`, installed into .vercel/cache, the directory Vercel
//      keeps between builds (RUSTUP_HOME, CARGO_HOME, PLAYWRIGHT_BROWSERS_PATH, and ~/.cache/exact linked there), so a
//      later build finds them. HOME itself stays (rustup refuses another one; bun reads its config there).
//   1. The Demos app's web artifact (/demos/app/), keyed by its inputs (tools/demos-web/build.ts --key-only): taken
//      from the cache when the key is there, else built (the wasm build, its target dir in the cache too) and kept.
//   2. The site: Exact at the site's seed, the content modules, the accounts' public settings from the project's
//      environment variables (written to the gitignored .env.local the build reads), `bun run build`.
//   3. Compose (tools/compose.ts): the site at /, the artifact at /demos/app/, routes, /api/* to LEGACY_API_ORIGIN.
//
// Environment (Vercel project settings, all public values; none is a secret): SITE_ACCOUNTS=1 with
// EXPO_PUBLIC_ACCESS_KEY, EXPO_PUBLIC_AMPLITUDE_API_KEY, EXPO_PUBLIC_SENTRY_DSN, optionally EXPO_PUBLIC_WEBSITE_URL,
// and LEGACY_API_ORIGIN (the old Next deployment that keeps /api/*). SKIP_HEAD_PARITY=1 skips the head comparison
// with the live site. VERCEL_ENV=production refuses a build without the accounts and the old API (the workflow's rule).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SITE = resolve(import.meta.dir, '..');
const ROOT = resolve(SITE, '..');
const CACHE = join(SITE, '.vercel/cache/reactiive-site');
const env = process.env;
// On Vercel, the toolchain's homes inside the kept cache (step 0); elsewhere (a developer's machine) its own.
if (env.VERCEL) {
  env.RUSTUP_HOME = join(CACHE, 'rustup');
  env.CARGO_HOME = join(CACHE, 'cargo');
  env.PLAYWRIGHT_BROWSERS_PATH = join(CACHE, 'ms-playwright');
  env.PATH = `${join(env.CARGO_HOME, 'bin')}:${env.PATH}`;
  // Exact's compiled tools live in ~/.cache/exact (scripts/tools.mjs cacheDir): a link into the cache.
  const link = join(env.HOME ?? '/root', '.cache/exact'), kept = join(CACHE, 'exact-tools');
  mkdirSync(kept, { recursive: true });
  mkdirSync(join(env.HOME ?? '/root', '.cache'), { recursive: true });
  if (!existsSync(link)) symlinkSync(kept, link);
} else env.PATH = `${join(env.HOME ?? '', '.cargo/bin')}:${env.PATH}`;
const t0 = Date.now();
const step = (what: string) => console.log(`\n▸ ${what} (+${Math.round((Date.now() - t0) / 1000)} s)`);
const run = (cmd: string, opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) => {
  console.log(`$ ${cmd}`);
  const r = spawnSync('bash', ['-c', cmd], { cwd: opts.cwd ?? SITE, stdio: 'inherit', env: { ...env, ...opts.env } });
  if (r.status !== 0) throw new Error(`failed (${r.status}): ${cmd}`);
};
const out = (cmd: string, cwd = SITE) => {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(`failed: ${cmd}\n${r.stderr}`);
  return r.stdout.trim();
};
// The Exact commit an app pins: exact.mjs's `const seed = ".../<40 hex>";`.
const seedOf = (file: string) => {
  const m = /^const seed = ".*\/([0-9a-f]{40})";$/m.exec(readFileSync(file, 'utf8'));
  if (!m) throw new Error(`no Exact seed in ${file}`);
  return m[1];
};
// expo/exact at a commit, once per build machine.
const exactAt = (sha: string) => {
  const dir = `/tmp/exact-${sha.slice(0, 12)}`;
  if (!existsSync(join(dir, 'scripts/exact.mjs'))) {
    rmSync(dir, { recursive: true, force: true });
    run(`git init -q ${dir} && cd ${dir} && git remote add origin https://github.com/expo/exact.git && git fetch -q --depth 1 origin ${sha} && git checkout -q FETCH_HEAD`);
  }
  // Its own dependencies (the web build's type check imports rolldown from them).
  if (!existsSync(join(dir, 'node_modules'))) run('bun install --frozen-lockfile', { cwd: dir });
  return dir;
};

// ---- the accounts and the old API go together (the workflow's rule) --------------------------------------------
const accounts = env.SITE_ACCOUNTS === '1', legacy = !!env.LEGACY_API_ORIGIN;
if (!(accounts && legacy)) {
  const msg = `SITE_ACCOUNTS is '${env.SITE_ACCOUNTS ?? 'unset'}' and LEGACY_API_ORIGIN is ${legacy ? 'set' : 'unset'}: production needs SITE_ACCOUNTS=1 and LEGACY_API_ORIGIN (with EXPO_PUBLIC_ACCESS_KEY), or readers lose their session at the cutover (docs/deploy.md)`;
  if (env.VERCEL_ENV === 'production') throw new Error(msg);
  console.warn(`warning: ${msg}`);
}

// ---- 0. the toolchain --------------------------------------------------------------------------------------------
if (spawnSync('bash', ['-c', 'command -v cargo'], { env }).status !== 0) {
  step('rustup (first build: cached for the next ones)');
  run(`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path`);
}
const exact = exactAt(seedOf(join(ROOT, 'exact.mjs')));
// The root Cargo.toml names the vendored crates under .exact/checkout; setup reads it, so the link comes first.
mkdirSync(join(ROOT, '.exact'), { recursive: true });
run(`ln -sfn ${exact} ${join(ROOT, '.exact/checkout')}`);
step('exact setup --platform web');
run(`bun ${exact}/scripts/exact.mjs setup --platform web`, { cwd: ROOT });

// ---- 1. the Demos app's web artifact -----------------------------------------------------------------------------
step('the demos artifact');
const key = out('bun tools/demos-web/build.ts --key-only').split('\n').pop()!;
const artifact = join(SITE, '.out/demos-web', key);
const cached = join(CACHE, 'demos-web', key);
if (existsSync(join(cached, 'dist'))) {
  console.log(`cache hit: ${key}`);
  mkdirSync(join(SITE, '.out/demos-web'), { recursive: true });
  cpSync(cached, artifact, { recursive: true });
} else {
  console.log(`cache miss: ${key}: building the Demos app's web (Rust to wasm; the first build takes a while)`);
  // Vercel's image (Amazon Linux 2023) lacks the system libraries Chrome needs, and the demos' web build starts
  // Chrome on Linux to read the native modules' factory roster (tools/demos-web/build.ts). dnf, as the build's root;
  // only here, where Chrome runs. A failure is shown (pipefail), not fatal: the roster's own error then says more.
  if (env.VERCEL && spawnSync('bash', ['-c', 'command -v dnf'], { env }).status === 0) {
    step('Chrome\'s system libraries (dnf)');
    run('set -o pipefail; dnf install -y -q nss nspr atk at-spi2-atk at-spi2-core cups-libs libdrm libxkbcommon libXcomposite libXdamage libXrandr libXfixes libXext libX11 libxcb mesa-libgbm pango cairo alsa-lib expat dbus-libs libxshmfence 2>&1 | tail -5 || echo "warning: dnf could not install every Chrome library"');
  }
  step('the demos web build');
  run('bun .site/tools/demos-web/build.ts', { cwd: ROOT, env: { EXACT: exact, CARGO_TARGET_DIR: join(CACHE, 'demos-web-target'), DEMOS_WEB_SCRATCH: '/tmp/demos-web-src' } });
  if (!existsSync(join(artifact, 'dist'))) throw new Error(`the demos build left no ${artifact}/dist`);
  // One artifact in the cache: the newest.
  rmSync(join(CACHE, 'demos-web'), { recursive: true, force: true });
  mkdirSync(join(CACHE, 'demos-web'), { recursive: true });
  cpSync(artifact, cached, { recursive: true });
}

// ---- 2. the site -------------------------------------------------------------------------------------------------
step('the site');
const siteExact = exactAt(seedOf(join(SITE, 'exact.mjs')));
run('bun tools/gen-content.ts');
if (accounts) {
  if (!env.EXPO_PUBLIC_ACCESS_KEY) throw new Error('SITE_ACCOUNTS=1 needs EXPO_PUBLIC_ACCESS_KEY (docs/storage.md)');
  const lines = ['SITE_ACCOUNTS=1', `EXPO_PUBLIC_WEBSITE_URL=${env.EXPO_PUBLIC_WEBSITE_URL || 'https://reactiive.io'}`];
  if (env.EXPO_PUBLIC_AMPLITUDE_API_KEY) lines.push(`EXPO_PUBLIC_AMPLITUDE_API_KEY=${env.EXPO_PUBLIC_AMPLITUDE_API_KEY}`);
  if (env.EXPO_PUBLIC_SENTRY_DSN) lines.push(`EXPO_PUBLIC_SENTRY_DSN=${env.EXPO_PUBLIC_SENTRY_DSN}`);
  lines.push(`EXPO_PUBLIC_ACCESS_KEY=${env.EXPO_PUBLIC_ACCESS_KEY}`);
  writeFileSync(join(SITE, '.env.local'), lines.join('\n') + '\n', { mode: 0o600 });
  run('bun tools/storage-bridge.ts --check-key');
}
run('bun run build', { env: { EXACT: siteExact, SITE_ORIGIN: env.SITE_ORIGIN || 'https://reactiive.io' } });
// Parity with the old Next site, at its own production URL (LEGACY_API_ORIGIN): since the cutover (2026-11-27)
// reactiive.io is this site, so comparing with it would compare a build with the one before it.
if (env.SKIP_HEAD_PARITY !== '1') { step('head parity with the old site'); run(`bun tools/parity/head-diff.ts --ours dist --live ${env.LEGACY_API_ORIGIN || 'https://reactiive-io-reactiive.vercel.app'}`); }

// ---- 3. compose ----------------------------------------------------------------------------------------------------
step('compose');
run('bun tools/compose.ts', { env: { SITE_ORIGIN: env.SITE_ORIGIN || 'https://reactiive.io' } });
console.log(`cache: ${out(`du -sh ${CACHE} 2>/dev/null | cut -f1`)} in .vercel/cache (kept between builds)`);
console.log(`\nvercel-build: .vercel/output ready (${readdirSync(join(SITE, '.vercel/output/static')).length} entries at the root) in ${Math.round((Date.now() - t0) / 1000)} s`);
