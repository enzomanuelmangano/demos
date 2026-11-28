/* The GPU guard: keeps a WebGPU surface from staying blank for a page's life (expo/exact#2086, #2131).
   tools/head.ts writes it into app.json's head with the comments dropped; the Demos app's head (../app.json) carries
   the same text, copied by `bun tools/head.ts` too. Plain ES5: it runs before Exact's runtime, in the site and in the
   sandboxed /demos/app/ frame (no sessionStorage there: counts live in window.name).
   1. A same-origin GET of a .wasm or a shaders/*.wgsl that fails (network error or 5xx) is tried again, up to 3 times
      (0.3, 1, 2.5 s): Exact's GPU load fetches the module and each shader once and gives up for good on one failure.
   2. The GPU glue's import failing (it or one of its static imports) leaves only a journal line; it is imported
      again, up to 3 times (1, 3, 6 s). A failed module fetch is not cached by the browser, so the same URL loads.
   3. A load that ends "no device" for any reason but a missing adapter (the module itself failed past the retries)
      reloads the page, as does a device lost for a reason other than its own destroy() (#170). At most twice a
      minute, counted in window.name.
   4. No adapter (a browser or GPU without WebGPU): <html data-gpu="none">; a load that still fails once the reloads are
      spent: <html data-gpu="failed">. Either lets a page show a still instead of an empty stage (web/head.css). */
(function () {
  if (!navigator.gpu) { document.documentElement.setAttribute('data-gpu', 'none'); return; }
  var KEY = 'exact-gpu-reload:';
  function reload(load) {
    var t = Date.now(), n = 0, m = /exact-gpu-reload:(\d+):(\d+)/.exec(window.name || '');
    if (m && t - Number(m[2]) < 60000) n = Number(m[1]);
    if (n >= 2) { if (load) document.documentElement.setAttribute('data-gpu', 'failed'); return false; }
    window.name = (window.name || '').replace(/exact-gpu-reload:\d+:\d+/, '') + KEY + (n + 1) + ':' + t;
    location.reload();
    return true;
  }
  /* 3 (device lost): a device lost for a reason other than its own destroy() reloads the page. */
  if (window.GPUAdapter && GPUAdapter.prototype.requestDevice) {
    var R = GPUAdapter.prototype.requestDevice, lostDone = false;
    GPUAdapter.prototype.requestDevice = function () {
      return R.apply(this, arguments).then(function (d) {
        d.lost.then(function (i) { if (lostDone || !i || i.reason === 'destroyed') return; lostDone = reload(); });
        return d;
      });
    };
  }
  /* 1: the GPU module's and the shaders' fetches. */
  var F = window.fetch;
  if (F) window.fetch = function (input, init) {
    var self = this, args = arguments, u;
    try { u = new URL(typeof input === 'string' ? input : (input && input.url) || String(input), location.href); } catch (e) { return F.apply(self, args); }
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' || u.origin !== location.origin || !/(\.wasm|\/shaders\/[^/]+\.wgsl)$/.test(u.pathname)) return F.apply(self, args);
    var n = 0, waits = [300, 1000, 2500];
    function later() { var d = waits[n++]; if (window.console) console.warn('exact gpu: fetching ' + u.pathname + ' again'); return new Promise(function (r) { setTimeout(r, d); }).then(go); }
    function go() {
      return F.apply(self, args).then(function (r) { return r.status >= 500 && n < waits.length ? later() : r; },
        function (e) { if (n < waits.length) return later(); throw e; });
    }
    return go();
  };
  /* 2, 3 (load), 4: what the runtime and the glue leave behind, read every 500 ms until the GPU is up or settled. */
  var tries = 0, nextAt = 0, settled = false, seen = 0, glueUrl = null;
  var timer = setInterval(function () {
    var x = window.exact;
    if (!x) return;
    var rec = x.gpu && x.gpu.recovery;
    if (rec && rec.status === 'no device') {
      if (rec.code === 'no-adapter') document.documentElement.setAttribute('data-gpu', 'none');
      else if (!settled) { settled = true; reload(true); }
      clearInterval(timer);
      return;
    }
    if (x.root && x.root.dataset && x.root.dataset.gpuMs) { clearInterval(timer); return; }
    if (x.gpu) return;
    var j = x.journal || [], url = null;
    for (var i = seen; i < j.length; i++) {
      var m = /gpu: Failed to fetch dynamically imported module: (\S+)/.exec(String(j[i]));
      if (m) url = m[1];
    }
    seen = j.length;
    if (url) glueUrl = url;
    if (url && !nextAt && tries < 3) nextAt = Date.now() + [1000, 3000, 6000][tries];
    if (nextAt && Date.now() >= nextAt && !x.gpu) {
      var glue = glueUrl || new URL('gpu-glue.js', document.baseURI).href;
      nextAt = 0; tries++;
      if (window.console) console.warn('exact gpu: importing ' + glue + ' again');
      import(glue).then(function () { if (x.gpu && x.gpu.settled) x.gpu.settled(); }, function () {
        if (tries < 3) nextAt = Date.now() + [1000, 3000, 6000][tries]; else { clearInterval(timer); reload(true); }
      });
    }
  }, 500);
})();
