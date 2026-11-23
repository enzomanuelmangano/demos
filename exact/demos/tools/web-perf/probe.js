// Injected before the page's own scripts (Page.addScriptToEvaluateOnNewDocument) by tools/web-perf/*.ts.
// Records, in window.__perf: rAF frame times, long tasks, paints, WebAssembly compile/instantiate spans,
// WebGPU resource bytes (textures, buffers), pipeline/shader-module creation (count, sync time), and,
// when the adapter offers 'timestamp-query', GPU time per submitted command encoder.
(() => {
  const P = (window.__perf = {
    t0: performance.timeOrigin, frames: [], recording: false, longtasks: [], paints: [], wasm: [],
    gpu: { textures: 0, textureBytes: 0, buffers: 0, bufferBytes: 0, pipelines: 0, asyncPipelines: 0, pipelineMs: 0, shaderModules: 0, shaderMs: 0, bindGroups: 0, submits: 0, writeTextureBytes: 0, writeBufferBytes: 0, copyExternal: 0 },
    gpuPass: [], marks: {},
  });
  const now = () => performance.now();
  // Frames: one timestamp per animation frame, only while recording (start/stop by the driver).
  const loop = (t) => { if (P.recording) P.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  P.loaf = []; P.mutations = 0; P.styleMutations = 0;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
    // Long animation frames (> 50 ms): where the frame went (script by source/function, forced layout, render).
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.loaf.push({ start: e.startTime, dur: e.duration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, blocking: e.blockingDuration, scripts: e.scripts.map((s) => ({ inv: s.invoker, src: (s.sourceURL || '').replace(/^.*\//, ''), fn: s.sourceFunctionName, dur: s.duration, forced: s.forcedStyleAndLayoutDuration })) }); }).observe({ type: 'long-animation-frame', buffered: true });
    // DOM writes while recording (each Contract commit is one or more): a proxy for commits per frame.
    const mo = new MutationObserver((recs) => { if (!P.recording) return; P.mutations += recs.length; for (const r of recs) if (r.type === 'attributes' && r.attributeName === 'style') P.styleMutations++; });
    const startMo = () => mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    if (document.documentElement) startMo(); else document.addEventListener('readystatechange', startMo, { once: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.paints.push([e.name, e.startTime]); }).observe({ type: 'paint', buffered: true });
  } catch {}
  // The launcher's first full frame: the first page's icons decoded and laid out.
  const watch = () => {
    if (!P.marks.launcherDom && document.body && /Sculptures/.test(document.body.innerText || '')) P.marks.launcherDom = now();
    const icons = [...document.querySelectorAll('img[src*="app-icons/"]')].slice(0, 24);
    if (!P.marks.launcherIcons && icons.length >= 24 && icons.every((i) => i.complete && i.naturalWidth > 0)) P.marks.launcherIcons = now();
    if (!P.marks.launcherIcons) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  // WebAssembly: which module, how long compile + instantiate took, streaming or not, its memory.
  const W = WebAssembly;
  const wrap = (name) => {
    const orig = W[name];
    if (!orig) return;
    W[name] = function (src, imports) {
      const s = now(), rec = { name, start: s };
      P.wasm.push(rec);
      Promise.resolve(src).then((r) => { if (r && r.url) rec.url = r.url; }, () => {});
      const out = orig.apply(this, arguments);
      Promise.resolve(out).then((res) => {
        rec.end = now();
        const inst = res?.instance ?? res;
        const mem = inst?.exports?.memory;
        if (mem) { rec.memory = mem; }
        if (res?.module || res instanceof W.Module) { try { rec.bytes = 0; } catch {} }
      }, (e) => { rec.end = now(); rec.error = String(e); });
      return out;
    };
  };
  wrap('instantiateStreaming'); wrap('instantiate'); wrap('compileStreaming'); wrap('compile');
  P.wasmMemory = () => P.wasm.map((w) => ({ url: w.url, bytes: w.memory?.buffer?.byteLength ?? 0 }));

  if (!navigator.gpu) return;
  const G = P.gpu;
  const bpp = (f) => /32float|rgba32/.test(f) ? 16 : /rgba16|rg32/.test(f) ? 8 : /^(r8|r8unorm|r8snorm|r8uint|stencil8)$/.test(f) ? 1 : /^(rg8|r16|depth16)/.test(f) ? 2 : 4;
  // With P.stackOn, who calls: the first wasm frames of each call's stack (a build with names: EXACT_WEB_NAMES=1).
  P.stacks = {};
  const who = (kind, n = 1) => {
    if (!P.stackOn) return;
    const st = (new Error().stack || '').split('\n').filter((l) => /wasm-function|\.wasm/.test(l)).slice(0, 6)
      .map((l) => l.trim().replace(/^at /, '').replace(/\s*\(.*$/, '').replace(/::h[0-9a-f]{16}$/, '')).join(' < ');
    const k = `${kind}: ${st || '(js)'}`;
    P.stacks[k] = (P.stacks[k] || 0) + n;
  };
  const proto = (C, m, fn) => { const o = C.prototype[m]; if (o) C.prototype[m] = function () { return fn.call(this, o, arguments); }; };
  // GPU time: ask for timestamp-query; every pass then writes a begin/end timestamp.
  proto(GPUAdapter, 'requestDevice', function (o, a) {
    const d = { ...(a[0] || {}) };
    if (this.features.has('timestamp-query')) d.requiredFeatures = [...(d.requiredFeatures || []), 'timestamp-query'];
    return o.call(this, d).then((dev) => { P.timestamps = dev.features.has('timestamp-query'); return dev; });
  });
  proto(GPUDevice, 'createTexture', function (o, a) {
    const d = a[0], s = d.size, w = s.width ?? s[0], h = s.height ?? s[1] ?? 1, l = s.depthOrArrayLayers ?? s[2] ?? 1;
    G.textures++; who('createTexture'); G.textureBytes += w * h * l * bpp(d.format) * (d.sampleCount || 1) * ((d.mipLevelCount || 1) > 1 ? 1.33 : 1);
    return o.apply(this, a);
  });
  proto(GPUDevice, 'createBuffer', function (o, a) { G.buffers++; who('createBuffer'); G.bufferBytes += a[0].size; return o.apply(this, a); });
  proto(GPUDevice, 'createBindGroup', function (o, a) { G.bindGroups++; return o.apply(this, a); });
  for (const m of ['createRenderPipeline', 'createComputePipeline']) proto(GPUDevice, m, function (o, a) { const s = now(); try { return o.apply(this, a); } finally { G.pipelines++; G.pipelineMs += now() - s; who(m); } });
  for (const m of ['createRenderPipelineAsync', 'createComputePipelineAsync']) proto(GPUDevice, m, function (o, a) { G.asyncPipelines++; return o.apply(this, a); });
  proto(GPUDevice, 'createShaderModule', function (o, a) { const s = now(); try { return o.apply(this, a); } finally { G.shaderModules++; G.shaderMs += now() - s; who('createShaderModule'); } });
  proto(GPUQueue, 'writeTexture', function (o, a) { G.writeTextureBytes += a[1]?.byteLength ?? 0; who('writeTexture bytes', a[1]?.byteLength ?? 0); return o.apply(this, a); });
  proto(GPUQueue, 'writeBuffer', function (o, a) { G.writeBufferBytes += a[2]?.byteLength ?? 0; who('writeBuffer bytes', a[2]?.byteLength ?? 0); return o.apply(this, a); });
  proto(GPUQueue, 'copyExternalImageToTexture', function (o, a) { G.copyExternal++; return o.apply(this, a); });

  // Timestamp plumbing: a pool of query sets; an encoder takes one at its first pass.
  const pools = new WeakMap(), enc = new WeakMap();
  const N = 64;
  const slot = (dev) => {
    let p = pools.get(dev);
    if (!p) pools.set(dev, (p = []));
    let s = p.find((x) => !x.busy);
    if (!s && p.length < 16) {
      s = { qs: dev.createQuerySet({ type: 'timestamp', count: N }), res: dev.createBuffer({ size: N * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), read: dev.createBuffer({ size: N * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), busy: false };
      G.buffers -= 2; G.bufferBytes -= N * 16; // not the app's
      p.push(s);
    }
    return s;
  };
  const devOf = new WeakMap();
  proto(GPUDevice, 'createCommandEncoder', function (o, a) { const e = o.apply(this, a); devOf.set(e, this); return e; });
  const pass = (m) => proto(GPUCommandEncoder, m, function (o, a) {
    const dev = devOf.get(this);
    if (!P.timestamps || !P.recording || !dev || (a[0] && a[0].timestampWrites)) return o.apply(this, a);
    let st = enc.get(this);
    if (st === undefined) { const s = slot(dev); st = s ? { s, n: 0 } : null; if (s) s.busy = true; enc.set(this, st); }
    if (!st || st.n + 2 > N) return o.apply(this, a);
    const d = { ...(a[0] || {}), timestampWrites: { querySet: st.s.qs, beginningOfPassWriteIndex: st.n, endOfPassWriteIndex: st.n + 1 } };
    st.n += 2;
    return o.call(this, d);
  });
  pass('beginRenderPass'); pass('beginComputePass');
  const pendingRead = new WeakMap();
  proto(GPUCommandEncoder, 'finish', function (o, a) {
    const st = enc.get(this);
    if (st && st.n) { this.resolveQuerySet(st.s.qs, 0, st.n, st.s.res, 0); this.copyBufferToBuffer(st.s.res, 0, st.s.read, 0, st.n * 8); }
    const cb = o.apply(this, a);
    if (st) pendingRead.set(cb, st);
    return cb;
  });
  proto(GPUQueue, 'submit', function (o, a) {
    G.submits++;
    const r = o.apply(this, a);
    for (const cb of a[0] || []) {
      const st = pendingRead.get(cb);
      if (!st) continue;
      if (!st.n) { st.s.busy = false; continue; }
      const at = now();
      st.s.read.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigInt64Array(st.s.read.getMappedRange().slice(0));
        st.s.read.unmap(); st.s.busy = false;
        let ns = 0;
        for (let i = 0; i + 1 < st.n; i += 2) { const d = Number(t[i + 1] - t[i]); if (d > 0 && d < 1e9) ns += d; }
        P.gpuPass.push([at, ns / 1e6, st.n / 2]);
      }, () => { st.s.busy = false; });
    }
    return r;
  });
})();
