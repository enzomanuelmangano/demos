# reactiive.io

The reactiive.io website, built with [Exact](https://github.com/expo/exact), living beside the Demos app in this
repo. It is its own app: own `package.json`, `bun.lock`, `tsconfig.json` and Exact pin (`exact.mjs`).

```sh
cd .site
bun install
bun exact.mjs web-build --out dist      # the site
bun tools/demos-web/build.ts            # the Demos app's web build for /demos/ (cached by its inputs' tree hash)
bun tools/compose.ts                    # both, as .vercel/output (Build Output API v3)
bun tools/serve.ts                      # that output, served by its routes, at http://127.0.0.1:4310/
```

| Path | What |
|---|---|
| `app.contract`, `app.ts`, `app.json` | the site: routes, pages, data module, manifest |
| `components/`, `pages/` | the shared components and one file per page kind |
| `.content/` | source content (MDX and metadata): not captured by the build |
| `tools/demos-web/` | the `/demos/` artifact: build, cache key, legacy demo-post redirects, head overlay |
| `tools/compose.ts`, `tools/serve.ts` | the deploy tree and a local host that applies its routes |
| `tools/parity/` | headless-Chrome screenshots and pixel/structure diffs against the live site |
| `tools/isolation/` | the measurements behind `docs/isolation.md` |
| `docs/` | architecture, inventory, decisions, isolation, parity, stubs, progress |
