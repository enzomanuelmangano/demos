// `bun exact.mjs phone [<udid|name>] [--run] [--url <dev server>] [--release]`: a development build signed for a phone on this Mac
// (the Apple Development identity and a provisioning profile covering the phone and the bundle
// id, chosen by host/apple/build.mjs), installed with devicectl. `share` cannot build this app:
// a production build with a Swift package (@exact/motion) and the app's own native tags fails to
// qualify its module roster before expo/exact#30 was fixed (exact2 730abad1); this stays the cable route.
// The phone: connected (cable or network), unlocked, paired, Developer Mode on.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const run = args.includes('--run');
// --release: the production build (release Rust, whole-module Swift, production trust, no dev
// server or frame-health instrumentation), signed for the phone the same way.
const release = args.includes('--release');
// --url <http://<mac LAN ip>:<port>>: the development build connects to that dev server (a
// `bun exact.mjs web --lan` loop), so saved .contract / app.ts edits reach the phone live.
const ui = args.indexOf('--url'), url = ui >= 0 ? args[ui + 1] : null;
const phone = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url') ?? process.env.EXACT_PHONE;
// The phone's feedback sheet (modules/apple/Feedback.swift) posts to this Mac's feedback server
// (exact/parity-tools/feedback/server.ts): its LAN addresses and .local name, baked in the bundle.
const lan = Object.entries(networkInterfaces()).sort(([a], [b]) => (/^en\d/.test(b) ? 1 : 0) - (/^en\d/.test(a) ? 1 : 0))
  .flatMap(([, is]) => is).filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
let local = ''; try { local = execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' }).trim(); } catch {}
const hostDir = resolve(import.meta.dirname, '../feedback-host');
mkdirSync(hostDir, { recursive: true });
writeFileSync(resolve(hostDir, 'mac.json'), JSON.stringify({ hosts: [...lan, ...(local ? [`${local}.local`] : [])], port: +(process.env.FEEDBACK_PORT ?? 5350) }) + '\n');

const exact2 = process.env.EXACT2;
if (!exact2) throw new Error('phone: run it as `bun exact.mjs phone` (EXACT2 names the exact2 checkout)');
const r = spawnSync(process.execPath, [resolve(exact2, 'host/apple/build.mjs'), '--device', 'demos-apple',
  ...(phone ? ['--phone', phone] : []), ...(url ? ['--url', url] : []), ...(run ? ['--run'] : []), ...(release ? ['--release'] : [])], {
  cwd: exact2, stdio: 'inherit', env: { ...process.env, EXACT_APP_DIR: process.cwd() },
});
// A development client only follows a dev server its opening link admits (build.mjs
// developmentAdmission: `<scheme>://open?url=<page>&token=<this build's token>`, kept in the
// bundle's receipt.json). `--run` alone launches the app on its embedded plan, so open the link:
// the phone then connects to `url` and takes every edit live.
if (r.status === 0 && run && url && phone) {
  try {
    const { readdirSync, readFileSync, existsSync, statSync } = await import('node:fs');
    const clients = resolve(process.cwd(), 'target/clients');
    const receipt = readdirSync(clients).flatMap((d) => readdirSync(resolve(clients, d)).map((b) =>
      resolve(clients, d, b, 'ios/aarch64-apple-ios/embedded/development/standalone/Demos.app/receipt.json')))
      .filter((f) => existsSync(f))
      // The newest receipt is this build's: each build re-tokens its admission.
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    const dev = receipt && JSON.parse(readFileSync(receipt, 'utf8')).development;
    if (dev?.scheme && dev?.token) {
      const page = new URL('/', url).href;
      const link = `${dev.scheme}://open?url=${encodeURIComponent(page)}&token=${dev.token}`;
      const bundle = JSON.parse(readFileSync(resolve(process.cwd(), 'app.json'), 'utf8')).app?.id ?? 'com.reactiive.demos.exact';
      spawnSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', phone, '--payload-url', link, bundle], { stdio: 'inherit' });
      console.log(`phone: opened the dev link, live from ${page}`);
    }
  } catch (e) { console.error(`phone: could not open the dev link (${e.message}); open the app from the dev server's page`); }
}
process.exit(r.status ?? 1);
