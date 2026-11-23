#!/usr/bin/env bun
// Writes .site/.env.local (gitignored: checked here with `git check-ignore`) with the PUBLIC settings the site's build
// reads for a localhost run against tools/local-env/api.ts (docs/local-env.md):
//   SITE_ACCOUNTS=1, EXPO_PUBLIC_WEBSITE_URL=http://localhost:<site port>
//   EXPO_PUBLIC_AMPLITUDE_API_KEY, EXPO_PUBLIC_SENTRY_DSN from the env file (public in the reference too: its browser
//   bundle carries them); tools/observability.ts writes them into the pages, and on localhost they never send.
// No server secret is ever written. Prints names only.
//   bun tools/local-env/site-env.ts [--site-port 4314] [--off]   (--off removes the file: the public build again)
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readEnvFile } from './env-file.ts';

const SITE = resolve(import.meta.dir, '../..');
const out = resolve(SITE, '.env.local');
if (process.argv.includes('--off')) {
  rmSync(out, { force: true });
  console.log('site-env: .env.local removed (accounts off, no analytics: the public build)');
  process.exit(0);
}
const ignored = spawnSync('git', ['check-ignore', '-q', out], { cwd: SITE });
if (ignored.status !== 0) throw new Error('site-env: .site/.env.local is not gitignored: refusing to write it');
const i = process.argv.indexOf('--site-port');
const port = i < 0 ? process.env.SITE_PORT ?? '4314' : process.argv[i + 1];
const file = readEnvFile();
const lines = ['SITE_ACCOUNTS=1', `EXPO_PUBLIC_WEBSITE_URL=http://localhost:${port}`];
for (const k of ['EXPO_PUBLIC_AMPLITUDE_API_KEY', 'EXPO_PUBLIC_SENTRY_DSN']) {
  const v = file?.get(k);
  if (v && !/[\s"'`$\\]/.test(v)) lines.push(`${k}=${v}`);
}
writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`site-env: ${existsSync(out) ? 'wrote' : 'failed'} .env.local: ${lines.map((l) => l.split('=')[0]).join(', ')}`);
