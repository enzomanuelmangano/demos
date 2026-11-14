// `bun exact.mjs phone [<udid|name>] [--run] [--release]`: a development build signed for a phone on this Mac
// (the Apple Development identity and a provisioning profile covering the phone and the bundle
// id, chosen by host/apple/build.mjs), installed with devicectl. `share` cannot build this app:
// a production build with a Swift package (@exact/motion) and the app's own native tags fails to
// qualify its module roster before expo/exact#30 was fixed (exact2 730abad1); this stays the cable route.
// The phone: connected (cable or network), unlocked, paired, Developer Mode on.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const run = args.includes('--run');
// --release: the production build (release Rust, whole-module Swift, production trust, no dev
// server or frame-health instrumentation), signed for the phone the same way.
const release = args.includes('--release');
const phone = args.find(a => !a.startsWith('--')) ?? process.env.EXACT_PHONE;
const exact2 = process.env.EXACT2;
if (!exact2) throw new Error('phone: run it as `bun exact.mjs phone` (EXACT2 names the exact2 checkout)');
const r = spawnSync(process.execPath, [resolve(exact2, 'host/apple/build.mjs'), '--device', 'demos-apple',
  ...(phone ? ['--phone', phone] : []), ...(run ? ['--run'] : []), ...(release ? ['--release'] : [])], {
  cwd: exact2, stdio: 'inherit', env: { ...process.env, EXACT_APP_DIR: process.cwd() },
});
process.exit(r.status ?? 1);
