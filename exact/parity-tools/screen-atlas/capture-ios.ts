// RN and Exact on this tool's own simulator, "Demos Atlas (Air)" (iPhone Air, iOS 27.1): each demo opened
// by its deep link after a terminate, captured once it settles.
//   bun capture-ios.ts [--setup] [--only rn|exact] [--settle 1500] [--rn-boot 3000] [slug…]
// --setup creates/boots the simulator and installs both apps: Exact with `bun exact.mjs ios --sim`
// (refused while another `exact.mjs ios` runs), RN straight from sim A6FA87DD's installed bundle (read only).
// RN is the Metro-backed dev build: Metro must be serving on 8082.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { DEMOS, OUT, demos } from "./lib";

const NAME = "Demos Atlas (Air)";
const RN_SOURCE_SIM = "A6FA87DD-D580-4614-9657-2E63E0323231";
const RN_ID = "com.reactiive.app", EXACT_ID = "com.reactiive.demos.exact";
const RN_DEV = "exp+thank-you://expo-development-client/?url=" + encodeURIComponent("http://localhost:8082");
const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const settle = +opt("--settle", process.env.SETTLE ?? "1500"), rnBoot = +opt("--rn-boot", "3000");
const only = opt("--only", "");
const setup = argv.includes("--setup");
const slugs = argv.filter((a) => !a.startsWith("--"));

async function sim(): Promise<string> {
  const list = JSON.parse(await $`xcrun simctl list devices -j`.text()).devices as Record<string, any[]>;
  for (const ds of Object.values(list)) for (const d of ds) if (d.name === NAME) return d.udid;
  if (!setup) throw new Error(`no "${NAME}" simulator: run with --setup`);
  const rt = (await $`xcrun simctl list runtimes`.text()).match(/com\.apple\.CoreSimulator\.SimRuntime\.iOS-27-\d+/g)!.pop()!;
  return (await $`xcrun simctl create ${NAME} com.apple.CoreSimulator.SimDeviceType.iPhone-Air ${rt}`.text()).trim();
}
const installed = async (udid: string, id: string) => (await $`xcrun simctl get_app_container ${udid} ${id}`.nothrow().quiet()).exitCode === 0;

const udid = await sim();
await $`xcrun simctl boot ${udid}`.nothrow().quiet();
await $`xcrun simctl bootstatus ${udid}`.quiet();
await $`xcrun simctl status_bar ${udid} override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100`.nothrow().quiet();
await $`xcrun simctl ui ${udid} appearance dark`.nothrow().quiet();
if (setup) {
  if (!(await installed(udid, RN_ID))) {
    const app = (await $`xcrun simctl get_app_container ${RN_SOURCE_SIM} ${RN_ID} app`.text()).trim();
    await $`xcrun simctl install ${udid} ${app}`;
  }
  if (!(await installed(udid, EXACT_ID))) {
    if ((await $`pgrep -f "exact.mjs ios"`.nothrow().quiet()).exitCode === 0) throw new Error("another `exact.mjs ios` build is running: retry when it ends");
    await $`bun exact.mjs ios --sim ${udid}`.cwd(DEMOS);
  }
  // First RN launch: load the bundle from Metro once so later cold launches have it cached.
  await $`xcrun simctl openurl ${udid} ${RN_DEV}`.nothrow();
  await Bun.sleep(20000);
}
console.log(`simulator ${NAME} ${udid}`);

async function capture(id: string, url: string, file: string, boot: number) {
  await $`xcrun simctl terminate ${udid} ${id}`.nothrow().quiet();
  await Bun.sleep(300);
  if (id === RN_ID) { // the dev client cold-starts into its bundle, then routes the demo link
    await $`xcrun simctl openurl ${udid} ${RN_DEV}`.nothrow().quiet();
    await Bun.sleep(boot);
  }
  await $`xcrun simctl openurl ${udid} ${url}`.nothrow().quiet();
  await Bun.sleep(settle);
  await $`xcrun simctl io ${udid} screenshot --type=png ${file}`.quiet();
}

const list = demos().filter((d) => !slugs.length || slugs.includes(d.slug));
const t0 = Date.now();
for (const [i, d] of list.entries()) {
  mkdirSync(join(OUT, d.slug), { recursive: true });
  if (only !== "exact") await capture(RN_ID, `demos://animations/${d.slug}`, join(OUT, d.slug, "rn-ios.png"), rnBoot);
  if (only !== "rn") await capture(EXACT_ID, `demos-exact://demo/${d.slug}`, join(OUT, d.slug, "exact-ios.png"), 0);
  console.log(`[${i + 1}/${list.length}] ${d.slug}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await $`xcrun simctl terminate ${udid} ${RN_ID}`.nothrow().quiet();
await $`xcrun simctl terminate ${udid} ${EXACT_ID}`.nothrow().quiet();
