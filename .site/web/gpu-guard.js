/* The GPU guard: tells a page whether its WebGPU surfaces will draw, so it can show a still instead of an empty stage
   (web/head.css: html[data-gpu] [data-motion~=apps-stage]). tools/head.ts writes it into app.json's head with the
   comments dropped; the Demos app's head (../app.json) carries the same text, copied by `bun tools/head.ts` too. Plain
   ES5: it runs before Exact's runtime, in the site and in the sandboxed /demos/app/ frame.
   It no longer retries or reloads anything. Exact does that itself since 1fe690b4 (ae34e8b6a, expo/exact#2131): it
   fetches the GPU module, its wasm and each shader again on a network error or a 5xx (0.25, 0.5, 1 s), imports the
   glue again under a fresh URL, and boots again when the browser comes back online. A lost device recovers in place
   (a63357bec, expo/exact#2086). This guard's own retries would have stacked on Exact's (4 x 4 tries per request).
   - No WebGPU (no navigator.gpu, or no adapter): <html data-gpu="none">.
   - A load that failed for good (Exact's permanent "no device", the glue that never registered, or a load whose
     retries are spent): <html data-gpu="failed">. Exact may still boot on a later `online`; the attribute is then
     removed, so the surface shows again over the still. */
(function () {
  var root = document.documentElement;
  if (!navigator.gpu) { root.setAttribute('data-gpu', 'none'); return; }
  var seen = 0;
  var timer = setInterval(function () {
    var x = window.exact;
    if (!x) return;
    if (x.root && x.root.dataset && x.root.dataset.gpuMs) { root.removeAttribute('data-gpu'); clearInterval(timer); return; }
    var rec = x.gpu && x.gpu.recovery;
    if (rec && rec.status === 'no device') {
      root.setAttribute('data-gpu', rec.code === 'no-adapter' ? 'none' : 'failed');
      clearInterval(timer);
      return;
    }
    if (rec && rec.status === 'failed') { root.setAttribute('data-gpu', 'failed'); return; }
    if (x.gpu) return;
    if (x.gpuFailedPermanent) { root.setAttribute('data-gpu', 'failed'); clearInterval(timer); return; }
    /* The runtime journals a glue import that failed past its retries as `gpu: <message>`; the journal is a ring whose
       `start` is its oldest line's absolute index. A paint's `gpu: could not resolve colour slot` line is not a load. */
    var j = x.journal || [], base = j.start || 0;
    for (var i = Math.max(seen, base); i < base + j.length; i++) if (/^t=\S+ gpu: (?!could not resolve colour)/.test(String(j[i - base]))) root.setAttribute('data-gpu', 'failed');
    seen = base + j.length;
  }, 500);
})();
