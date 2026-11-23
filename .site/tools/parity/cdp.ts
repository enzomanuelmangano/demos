// A minimal Chrome DevTools Protocol client for the parity and isolation checks: its own headless Chrome (real GPU,
// WebGPU on, so the Demos app's GPU surfaces draw) with a private, throwaway profile. CHROME overrides the binary.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
}

export class Page {
  constructor(public cdp: Cdp, public sessionId: string, public targetId: string, public contextId: string) {}
  send(method: string, params: any = {}) { return this.cdp.send(method, params, this.sessionId); }
  on(fn: (e: Event) => void) { return this.cdp.on((e) => { if (e.sessionId === this.sessionId) fn(e); }); }
  async eval<T = any>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  /** Navigates and resolves at the load event (or after `ms`). */
  async goto(url: string, ms = 30000) {
    const loaded = new Promise<void>((r) => { const off = this.on((e) => { if (e.method === 'Page.loadEventFired') { off(); r(); } }); });
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, Bun.sleep(ms)]);
  }
  async close() {
    await this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await this.cdp.send('Target.disposeBrowserContext', { browserContextId: this.contextId }).catch(() => {});
  }
}

export async function launch({ port = 9340 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'site-chrome-'));
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--headless=new',
    '--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--hide-scrollbars',
    '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  let ver: any;
  for (let i = 0; i < 100 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await Bun.sleep(100); } }
  if (!ver) throw new Error('chrome did not start');
  const cdp = await Cdp.connect(ver.webSocketDebuggerUrl);
  const kill = () => { try { proc.kill('SIGKILL'); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  process.on('exit', kill);
  return { cdp, kill };
}

/** A fresh browser context (cold cache, no storage) with one page at the live sweep's viewports. */
export async function newPage(cdp: Cdp, width: number) {
  const mobile = width < 800, height = mobile ? 844 : 900;
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, width, height });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(cdp, sessionId, targetId, browserContextId);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return page;
}
