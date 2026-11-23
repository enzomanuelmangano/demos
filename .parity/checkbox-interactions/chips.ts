// Run: bun .parity/checkbox-interactions/chips.ts [url] (the web dev server on :5341).
// Measures checkbox-interactions' chips on the web dev server: every chip's box at rest, then for
// chip 3 while pressed, after release (checked), and after a second toggle; samples the chip's
// height every frame through each animation. Exit 1 on any height other than the expected one.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ = process.argv[2] ?? "http://127.0.0.1:5341/demo/checkbox-interactions";
const port = 9400 + Math.floor(Math.random() * 400);
const proc = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${port}`, "--user-data-dir=/tmp/chips-cdp-profile", "--window-size=420,912", "--force-device-scale-factor=3", "about:blank"], { stderr: "ignore", stdout: "ignore" });
let ws: WebSocket;
for (let i = 0; i < 50; i++) {
  try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const t = (await r.json()).find((x: any) => x.type === "page"); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break; } } catch {}
  await Bun.sleep(200);
}
await new Promise(r => ws.onopen = r);
let n = 0; const waits = new Map<number, (v: any) => void>();
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && waits.has(m.id)) { waits.get(m.id)!(m); waits.delete(m.id); } };
const send = (method: string, params: any = {}) => new Promise<any>(r => { const id = ++n; waits.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 912, deviceScaleFactor: 3, mobile: true });
await send("Page.navigate", { url: URL_ });
for (let i = 0; i < 100; i++) { if (await ev(`!!document.querySelector('[data-testid="cuisine-19"]')`)) break; await Bun.sleep(200); }
await Bun.sleep(1500);
const rects = `JSON.stringify([...Array(20).keys()].map(i => { const e = document.querySelector('[data-testid="cuisine-' + i + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return [i, e.textContent.trim(), +r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2), getComputedStyle(e).borderRadius]; }))`;
const rest = JSON.parse(await ev(rects));
console.log("rest:"); for (const r of rest) console.log("  ", JSON.stringify(r));
// Layout height (offsetHeight ignores transforms: the pressto scale), per frame.
const sample = (ms: number) => ev(`new Promise(res => { const e = document.querySelector('[data-testid="cuisine-3"]'); const out = []; const t0 = performance.now(); const f = () => { out.push([Math.round(performance.now() - t0), e.offsetHeight, +e.getBoundingClientRect().height.toFixed(2), getComputedStyle(e).borderRadius]); if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res(JSON.stringify(out)); }; f(); })`);
const r3 = rest[3];
const x = r3[2] + r3[4] / 2, y = r3[3] + r3[5] / 2;
const mouse = (type: string) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const bad: string[] = [];
const check = (label: string, s: any[]) => { const hs = new Set(s.map(v => v[1])); const rs = new Set(s.map(v => v[3])); console.log(label, "layout heights", [...hs], "radii", [...rs], "visual h min/max", Math.min(...s.map(v => v[2])), Math.max(...s.map(v => v[2]))); if (hs.size !== 1) bad.push(label + " height moved"); if (rs.size !== 1) bad.push(label + " radius moved"); };
await mouse("touchStart"); check("press-in", JSON.parse(await sample(400)));
await mouse("touchEnd"); check("release+check", JSON.parse(await sample(900)));
const checked = JSON.parse(await ev(rects));
console.log("checked chip:", JSON.stringify(checked[3]), "check:", await ev(`!!document.querySelector('[data-testid="cuisine-3-check"]')`));
await mouse("touchStart"); await Bun.sleep(80); await mouse("touchEnd"); check("uncheck", JSON.parse(await sample(900)));
const heights = new Set([...rest, ...checked].map(r => r[5]));
console.log("all chip heights:", [...heights]);
if (heights.size !== 1) bad.push("chips differ in height");
const rows = new Set(rest.map((r: any) => r[3])); console.log("rows:", rows.size, "max right:", Math.max(...rest.map((r: any) => r[2] + r[4])));
console.log(bad.length ? "FAIL " + bad.join("; ") : "OK");
proc.kill(); process.exit(bad.length ? 1 : 0);
