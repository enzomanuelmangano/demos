// A minimal Chrome DevTools Protocol client for the web performance runs (tools/web-perf.md).
// Launches its own Chrome (headless, real GPU, no vsync / frame-rate cap) with a private profile.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Event = { method: string; params: any; sessionId?: string };

export class Cdp {
  ws!: WebSocket;
  id = 0;
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; method: string }>();
  listeners: ((e: Event) => void)[] = [];
  static async connect(url: string) {
    const c = new Cdp();
    c.ws = new WebSocket(url);
    await new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = rej; });
    c.ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.id !== undefined) {
        const p = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (!p) return;
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result);
      } else for (const l of c.listeners) l(msg);
    };
    return c;
  }
  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
  on(fn: (e: Event) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  waitFor(pred: (e: Event) => boolean, ms = 60000): Promise<Event> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error("timeout waiting for event")); }, ms);
      const off = this.on((e) => { if (pred(e)) { clearTimeout(t); off(); resolve(e); } });
    });
  }
}

/** A page session: a fresh browser context (cold cache, no storage) with one target. */
export class Page {
  constructor(public cdp: Cdp, public sessionId: string, public targetId: string, public contextId: string) {}
  send(method: string, params: any = {}) { return this.cdp.send(method, params, this.sessionId); }
  on(fn: (e: Event) => void) { return this.cdp.on((e) => { if (e.sessionId === this.sessionId) fn(e); }); }
  async eval<T = any>(expression: string, awaitPromise = true): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  async close() {
    await this.cdp.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
    await this.cdp.send("Target.disposeBrowserContext", { browserContextId: this.contextId }).catch(() => {});
  }
}

export async function launch({ port = 9333, headless = true, extra = [] as string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "perf-chrome-"));
  const args = [
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
    ...(headless ? ["--headless=new"] : []),
    "--enable-unsafe-webgpu", "--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist",
    "--disable-gpu-vsync", "--disable-frame-rate-limit",
    "--enable-features=WebGPUDeveloperFeatures", "--enable-dawn-features=allow_unsafe_apis",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--window-size=1440,900", ...extra, "about:blank",
  ];
  const proc: ChildProcess = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr!.on("data", (d) => { stderr += d; if (stderr.length > 1e6) stderr = stderr.slice(-5e5); });
  let ver: any;
  for (let i = 0; i < 100; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await Bun.sleep(100); }
  }
  if (!ver) throw new Error("chrome did not start");
  const cdp = await Cdp.connect(ver.webSocketDebuggerUrl);
  const kill = () => { try { proc.kill("SIGKILL"); } catch {} ; try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  process.on("exit", kill);
  return { cdp, proc, kill, stderr: () => stderr };
}

export async function newPage(cdp: Cdp, { width = 1440, height = 900, mobile = false, dpr = 1 } = {}) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId, width, height });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = new Page(cdp, sessionId, targetId, browserContextId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0 });
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) {
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  }
  return page;
}

export const NETWORK = {
  cable: { offline: false, latency: 5, downloadThroughput: (100e6) / 8, uploadThroughput: (20e6) / 8 },
  // Chrome DevTools' presets: "Fast 4G" (9 Mbps / 1.5 Mbps, 60 ms RTT x 2.75 = 165 ms) and "Fast 3G" (1.6 Mbps, 562.5 ms).
  "4g": { offline: false, latency: 165, downloadThroughput: (9e6) / 8, uploadThroughput: (1.5e6) / 8 },
  "fast3g": { offline: false, latency: 562.5, downloadThroughput: (1.6e6 * 0.9) / 8, uploadThroughput: (750e3 * 0.9) / 8 },
} as const;

export function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}
