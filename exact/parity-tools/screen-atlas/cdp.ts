// A minimal Chrome DevTools Protocol client: headless Chrome, one page per target.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch(port = 9400 + Math.floor(Math.random() * 400)) {
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "atlas-chrome-"))}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    "--enable-unsafe-webgpu", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--enable-features=Vulkan,WebGPU", "--ignore-gpu-blocklist", "--force-color-profile=srgb",
  ], { stdio: "ignore" });
  let ver: any;
  for (let i = 0; i < 100 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await Bun.sleep(100); }
  }
  if (!ver) throw new Error("chrome did not start");
  const browser = await connect(ver.webSocketDebuggerUrl);
  return {
    async page(w: number, h: number, dpr: number) {
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true, background: false });
      const p = await connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
      await p.send("Page.enable"); await p.send("Runtime.enable"); await p.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await p.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
      await p.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      return Object.assign(p, {
        close: () => browser.send("Target.closeTarget", { targetId }).catch(() => {}),
        eval: async (expr: string) => (await p.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value,
        shot: async () => Buffer.from((await p.send("Page.captureScreenshot", { format: "png" })).data, "base64"),
        goto: (url: string) => p.send("Page.navigate", { url }),
      });
    },
    close: () => { proc.kill(); },
  };
}

async function connect(url: string) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const wait = new Map<number, [Function, Function]>();
  const logs: string[] = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id && wait.has(msg.id)) { const [r, j] = wait.get(msg.id)!; wait.delete(msg.id); msg.error ? j(new Error(msg.error.message)) : r(msg.result); }
    else if (msg.method === "Runtime.exceptionThrown") logs.push("exception: " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).split("\n")[0]);
    else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning"))
      logs.push(msg.params.type + ": " + msg.params.args.map((a: any) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  };
  return {
    logs,
    send: (method: string, params: any = {}): Promise<any> =>
      new Promise((r, j) => { const i = ++id; wait.set(i, [r, j]); ws.send(JSON.stringify({ id: i, method, params })); }),
  };
}
