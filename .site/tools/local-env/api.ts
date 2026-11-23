#!/usr/bin/env bun
// The reference's Next API on localhost, as the site's local backend (docs/local-env.md, decisions.md D15).
//
//   bun tools/local-env/api.ts [--port 3000] [--site-port 4314] [--telegram]
//
// It runs from a COPY of the reference (`git archive HEAD`, never a worktree: the reference clone is read-only) at
// REACTIIVE_API_DIR (default <reactiive>/reactiive-api-local), made on first use. The env file's values go to the Next
// process's environment only (no .env file is written anywhere), filtered to the reference's own names, with these
// local overrides because the file is the PRODUCTION env:
//   - EXPO_PUBLIC_WEBSITE_URL = the local site (the OAuth redirect_uri and the post-sign-in redirect)
//   - Sentry off (no DSN, no auth token): local errors never reach the production project
//   - Telegram and Beehiiv keys replaced by an inert word: no message is sent, no address subscribed
//     (--telegram keeps the real Telegram keys, for one deliberate test message)
//   - Lemon Squeezy dropped: payments are not ported (docs/stubs.md), nothing here may create a checkout
// It prints key NAMES, never values.
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ENV_FILE, REFERENCE_KEYS, isProduction, readEnvFile } from './env-file.ts';

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const port = arg('--port', '3000');
const sitePort = arg('--site-port', process.env.SITE_PORT ?? '4314');
const telegram = process.argv.includes('--telegram');
const SITE = resolve(import.meta.dir, '../..');
const REFERENCE = resolve(process.env.REACTIIVE_REFERENCE ?? resolve(SITE, '../../reactiive.io'));
const DIR = resolve(process.env.REACTIIVE_API_DIR ?? resolve(SITE, '../../reactiive-api-local'));
const INERT = 'disabled-on-localhost';

if (!existsSync(resolve(DIR, 'package.json'))) {
  console.log(`api: copying the reference (git archive HEAD) into ${DIR}`);
  mkdirSync(DIR, { recursive: true });
  const tar = spawnSync('sh', ['-c', `git -C "${REFERENCE}" archive HEAD | tar -x -C "${DIR}"`], { stdio: 'inherit' });
  if (tar.status !== 0) process.exit(1);
}
if (!existsSync(resolve(DIR, 'node_modules'))) spawnSync('bun', ['install'], { cwd: DIR, stdio: 'inherit' });
spawnSync('bun', ['run', 'content:build'], { cwd: DIR, stdio: 'ignore' }); // the reference's predev step
// Next would load these over nothing we pass; the copy must have none.
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) if (existsSync(resolve(DIR, f))) throw new Error(`api: ${DIR}/${f} exists: remove it (values reach Next only through this launcher)`);

const file = readEnvFile();
const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !REFERENCE_KEYS.includes(k as never)) env[k] = v;
if (!file) console.log(`api: no env file at ${ENV_FILE}: every env-dependent route answers as the reference does without it`);
else {
  for (const k of REFERENCE_KEYS) { const v = file.get(k); if (v) env[k] = v; }
  console.log(`api: env file read (${isProduction(file) ? 'PRODUCTION' : 'non-production'} values): ${REFERENCE_KEYS.filter((k) => file.get(k)).length} reference keys`);
}
env.EXPO_PUBLIC_WEBSITE_URL = `http://localhost:${sitePort}`;
for (const k of ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) delete env[k];
for (const k of Object.keys(env)) if (k.startsWith('LEMON_SQUEEZY_')) delete env[k];
if (env.BEEHIIV_API_KEY) env.BEEHIIV_API_KEY = INERT;
if (!telegram && env.TELEGRAM_BOT_TOKEN) env.TELEGRAM_BOT_TOKEN = INERT;
env.NEXT_TELEMETRY_DISABLED = '1';
console.log(`api: overrides: EXPO_PUBLIC_WEBSITE_URL=http://localhost:${sitePort}, Sentry off, Lemon Squeezy dropped, Beehiiv inert, Telegram ${telegram ? 'LIVE' : 'inert'}`);
console.log(`api: http://localhost:${port} (from ${DIR})`);

const child = spawn('bunx', ['next', 'dev', '--turbopack', '-p', port], { cwd: DIR, env, stdio: 'inherit' });
for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, () => child.kill(s));
child.on('exit', (code) => process.exit(code ?? 0));
