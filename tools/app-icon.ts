#!/usr/bin/env bun
// The app's icon, as the React Native app's EAS pre-install made it (.legacy/package.json eas-build-pre-install):
// a spiral drawn by headless Skia, a new one each run (spiral-quality.ts keeps only good ones), with the number of
// demos in SF Pro Rounded over it. The generator stays in .legacy/scripts/generate-app-icon (a dot-folder, so the
// app's build never captures it); it runs in a scratch copy, and only its icon.png becomes assets/icon.png (app.json
// `icons`). Run before a TestFlight build:
//   bun tools/app-icon.ts            (the count of demos.contract's Demo entries)
//   bun tools/app-icon.ts --value=:) (any text)
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(import.meta.dir, '..');
const given = process.argv.find((a) => a.startsWith('--value='))?.slice('--value='.length);
const count = (readFileSync(join(root, 'demos.contract'), 'utf8').match(/\bDemo\(slug=/g) ?? []).length;
if (!given && count === 0) throw new Error('app-icon: no Demo( entries in demos.contract');
const value = given ?? String(count);
// The generator writes ../../assets/<name>.png from its own folder: a scratch tree with that shape.
const scratch = mkdtempSync(join(tmpdir(), 'app-icon-'));
const dir = join(scratch, 'scripts', 'generate-app-icon');
try {
  cpSync(join(root, '.legacy/scripts/generate-app-icon'), dir, { recursive: true, filter: (p) => !p.includes('node_modules') && !p.includes('/build') });
  cpSync(join(root, '.legacy/assets'), join(scratch, 'assets'), { recursive: true, filter: (p) => !p.includes('app-icons') });
  const run = (cmd: string, args: string[]) => {
    const r = spawnSync(cmd, args, { cwd: dir, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`app-icon: ${cmd} ${args.join(' ')} failed`);
  };
  run('bun', ['install', '--frozen-lockfile']);
  run('bun', ['run', 'build']);
  run('node', ['build/scripts/icons-set.js', `--value=${value}`]);
  copyFileSync(join(scratch, 'assets', 'icon.png'), join(root, 'assets', 'icon.png'));
  console.log(`app-icon: assets/icon.png with "${value}"`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
