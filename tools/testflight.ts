#!/usr/bin/env bun
// A TestFlight build of the Demos app, on the store app the React Native app shipped as (com.reactiive.app,
// App Store Connect app 6670311735, team W3N4N47454; .legacy/eas.json submit.production):
//   1. the icon is the committed assets/icon.png (the spiral with the number of demos: tools/app-icon.ts, run when
//      the number changes; this refuses an icon older than demos.contract's count);
//   2. an App Store archive (`exact.mjs ios --device --archive`) with app.json's `app.id` set to com.reactiive.app for the
//      build only (put back after: development builds keep com.reactiive.demos.exact), the version from package.json
//      (EXACT_VERSION) and the build number (EXACT_BUILD_NUMBER);
//   3. the upload with `eas submit` (the App Store Connect key EAS keeps for the project), from a scratch EAS project
//      with the RN app's project id, so nothing of .legacy is installed.
// Signing is the caller's: EXACT_IDENTITY (the distribution identity's SHA-1, in a keychain codesign can read) and
// EXACT_PROFILE (the App Store profile for com.reactiive.app), e.g. the ones EAS keeps for the project. No credential
// is written into the repository.
//   EXACT_IDENTITY=… EXACT_PROFILE=… bun tools/testflight.ts [--build-number <n>]   (default: EAS's last + 1)
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const STORE_ID = 'com.reactiive.app';
const root = join(import.meta.dir, '..');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const run = (cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) => {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? root, stdio: 'inherit', env: { ...process.env, ...opts.env } });
  if (r.status !== 0) throw new Error(`testflight: ${cmd} ${args.join(' ')} failed (${r.status})`);
};
const out = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`testflight: ${cmd} ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout + r.stderr;
};

for (const v of ['EXACT_IDENTITY', 'EXACT_PROFILE']) if (!process.env[v]) throw new Error(`testflight: ${v} is not set (see the header)`);
if (!existsSync(process.env.EXACT_PROFILE!)) throw new Error('testflight: EXACT_PROFILE names no file');
// The icon names the demos' count (tools/app-icon.ts): a count it does not show is refused, not shipped.
const count = (readFileSync(join(root, 'demos.contract'), 'utf8').match(/\bDemo\(slug=/g) ?? []).length;
const stamp = join(root, 'tools', 'app-icon.count');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== String(count)) throw new Error(`testflight: assets/icon.png is not for ${count} demos: run bun tools/app-icon.ts`);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('testflight: package.json has no version');

// The scratch EAS project: the RN app's project, its App Store Connect app, nothing installed.
const eas = mkdtempSync(join(tmpdir(), 'demos-eas-'));
const legacyEas = JSON.parse(readFileSync(join(root, '.legacy/eas.json'), 'utf8'));
writeFileSync(join(eas, 'package.json'), JSON.stringify({ name: 'demos-submit', version, private: true }));
writeFileSync(join(eas, 'app.json'), JSON.stringify({ expo: { name: 'Demos', slug: 'thank-you', owner: 'reactiive', version,
  ios: { bundleIdentifier: STORE_ID, appleTeamId: 'W3N4N47454' }, extra: { eas: { projectId: 'eb1bbf17-5fb9-4743-bccf-3fbcbc95176a' } } } }));
writeFileSync(join(eas, 'eas.json'), JSON.stringify({ cli: legacyEas.cli, build: { production: { ios: { autoIncrement: 'buildNumber' } } },
  submit: { production: legacyEas.submit.production } }));
spawnSync('git', ['init', '-q'], { cwd: eas });
const EAS = ['-y', 'eas-cli@latest'];

const appJson = join(root, 'app.json');
const original = readFileSync(appJson, 'utf8');
const ipa = join(root, 'target', `Demos-${version}.ipa`);
try {
  let build = arg('--build-number');
  if (!build) {
    const m = /buildNumber - (\d+)/.exec(out('npx', [...EAS, 'build:version:get', '-p', 'ios', '--profile', 'production', '--non-interactive'], eas));
    if (!m) throw new Error('testflight: EAS gave no build number; pass --build-number');
    build = String(Number(m[1]) + 1);
  }
  console.log(`testflight: Demos ${version} (${build}) as ${STORE_ID}`);
  // The bundle id is app.json's `app.id` (the top-level `id` is the web manifest's, not the bundle's).
  const app = JSON.parse(original);
  app.app = { ...app.app, id: STORE_ID };
  writeFileSync(appJson, JSON.stringify(app, null, 2) + '\n');
  run('bun', ['exact.mjs', 'ios', '--device', '--archive', ipa], { env: { EXACT_VERSION: version, EXACT_BUILD_NUMBER: build, EXACT_NON_EXEMPT_ENCRYPTION: 'false' } });
  writeFileSync(appJson, original);
  // The archive must be the store's app: a bundle id the profile does not cover is refused by Apple after upload.
  const scratchIpa = mkdtempSync(join(tmpdir(), 'demos-ipa-'));
  run('unzip', ['-q', ipa, 'Payload/*.app/Info.plist', '-d', scratchIpa]);
  const plist = spawnSync('/bin/sh', ['-c', `/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${scratchIpa}"/Payload/*.app/Info.plist`], { encoding: 'utf8' }).stdout.trim();
  rmSync(scratchIpa, { recursive: true, force: true });
  if (plist !== STORE_ID) throw new Error(`testflight: the archive's bundle id is ${plist}, not ${STORE_ID}: not submitted`);
  run('npx', [...EAS, 'submit', '-p', 'ios', '--path', ipa, '--profile', 'production', '--non-interactive'], { cwd: eas });
  console.log(`testflight: Demos ${version} (${build}) submitted. EAS's counter is not moved: pass --build-number ${Number(build) + 1} next time, or set it with eas build:version:set.`);
} finally {
  writeFileSync(appJson, original);
  rmSync(eas, { recursive: true, force: true });
}
