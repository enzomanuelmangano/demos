# Deploying reactiive.io

**Vercel builds it** (owner, 2026-11-26: "manage everything with Vercel"). The Vercel project imports the GitHub repo
with Root Directory `.site`; `.site/vercel.json` sets the rest: install (bun 1.4.2, the site's lockfile), build
(`tools/vercel-build.ts`: the Demos app's web artifact from the build cache or built with Rust, the site, compose into
`.vercel/output`, which Vercel serves as is: Build Output API v3), and an ignore step that skips a commit touching only
`.legacy/`, `.parity/`, `.github/` or Markdown. Every push makes a preview; `main` makes production. A site-only change
reuses the cached artifact (a few minutes); a change to the demos rebuilds it (Rust to wasm: the first build is long).

## One-time setup (owner)

1. vercel.com → Add New → Project → import `enzomanuelmangano/demos`, **in the team of the old reactiive.io project**.
   - Root Directory: `.site` (keep "Include files outside the root directory" on: the demos build reads the repo root).
   - Application Preset: Other. Build, Output and Install: leave empty (`.site/vercel.json` sets them).
   - Environment Variables (values from the old project's settings; all public):
     `SITE_ACCOUNTS=1`, `EXPO_PUBLIC_ACCESS_KEY`, `EXPO_PUBLIC_AMPLITUDE_API_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, and
     `LEGACY_API_ORIGIN` = the old project's own `*.vercel.app` URL (never `reactiive.io`: the old Next deployment keeps
     answering `/api/*` through a rewrite until those routes are ported). A production build without
     `SITE_ACCOUNTS=1` and `LEGACY_API_ORIGIN` is refused (readers would lose their session).
   - Deploy. The first build compiles the Demos app (Rust); later ones reuse it while the demos do not change.
2. Check the deployment's URL by hand: `/`, `/demos` (the phone), an article, a demo post, `/sitemap.xml`, Sign In.
3. **The cutover**: the new project → Settings → Domains: add `reactiive.io` and `www.reactiive.io` (Vercel moves them
   from the old project; same team: no DNS change). Resubmit the sitemap in Search Console (126 new demo posts).
4. Keep the old project (its pages, purchase routes and `/api/*`) for at least a month: the API and the rollback.

Rollback: the new project → Deployments → an earlier one → "Promote to production", or move the domains back to the
old project.

`.github/workflows/site-deploy.yml` (manual, `vercel deploy --prebuilt` from Actions) stays as an alternative path;
it is not needed with the Git integration.

## The Actions path (alternative, prepared before the Vercel build existed)

Nothing here has been run: no Vercel project, secret, deployment or DNS change exists. The workflow
`.github/workflows/site-deploy.yml` is `workflow_dispatch` only and refuses to start without its three secrets.

What a deploy is: GitHub Actions builds the site (`bun run build`: `web-build` then `tools/seo/postbuild.ts`: head,
JSON-LD, sitemap, robots, RSS, manifest), takes the cached `/demos/app/` artifact (keyed by the demos' inputs, so a
site-only change reuses it), composes both into `.site/.vercel/output` (`tools/compose.ts`, Build Output API v3) and
uploads that tree with `vercel deploy --prebuilt`. Vercel builds nothing.

## One-time steps for the owner

1. **Create the Vercel project** (dashboard, or `vercel project add reactiive-site` in a scratch folder). Import no Git
   repository (the deploys are prebuilt from Actions); framework preset "Other". Leave the production domain off it for now.
   Note the project's ID and your team/org ID (Settings, General; or `.vercel/project.json` after `vercel link` in a scratch folder).
2. **Add the repository secrets** (`enzomanuelmangano/demos`, Settings, Secrets and variables, Actions):
   `VERCEL_TOKEN` (a token scoped to that team, Account Settings, Tokens), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
   Optional repository variable `LEGACY_API_ORIGIN` (step 5). For the accounts (sign-in, profile, the subscription's
   status and cancel; `docs/stubs.md`), repository VARIABLES (public values, the old site's bundle ships them):
   `SITE_ACCOUNTS=1`, `EXPO_PUBLIC_ACCESS_KEY` (required with it: the old site's session key, so signed-in readers stay
   signed in, `docs/storage.md`), `EXPO_PUBLIC_AMPLITUDE_API_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, optionally
   `EXPO_PUBLIC_WEBSITE_URL` (default `https://reactiive.io`); the values are the old Vercel project's.
3. **First preview.** Actions, "Site / deploy", Run workflow, `production` off. The run builds, checks head parity with the
   live site, deploys a preview and prints its URL in the summary. Check by hand: `/`, `/demos`, an article, 404, `/sitemap.xml`,
   `/rss.xml`, and `bun .site/tools/parity/head-diff.ts --ours-url <preview url>` (a preview behind Deployment Protection
   answers 401: turn protection off for this project's previews, or check with the bypass header).
4. **Move the domain** (the cutover, when the preview is accepted):
   1. Vercel, the new project, Settings, Domains: add `reactiive.io` and `www.reactiive.io`. Vercel will say the domain is on
      another project; confirm the move (same team) or remove it from the old project first. Same team: no DNS change at all,
      the domain's records already point at Vercel. Another team or an external DNS: use the records Vercel shows.
   2. Run the workflow again with `production` on (the first production deploy; the alias goes live when it finishes).
   3. Submit the sitemap again in Search Console only if the property changed; the URLs are unchanged.
5. **`/api/*` to the old deployment.** The old Next project keeps serving the 22 API routes (OAuth callbacks, webhook,
   purchase, feedback, stars) until they are ported. Give it a stable URL that is not `reactiive.io` (its `*.vercel.app`
   production URL, or an alias such as `legacy.reactiive.io`), and set the repository variable `LEGACY_API_ORIGIN` to it.
   `tools/compose.ts` then writes `^/api/(.*)$ -> $LEGACY_API_ORIGIN/api/$1` as the first dynamic route. Its OAuth redirect URIs
   stay `https://reactiive.io/api/...`, so they reach the old backend through this rewrite. Do this **before** step 4.
   Cookies are the old site's own host-only cookies on the same origin: unchanged.
6. **Automatic deploys** (optional, after a few good manual ones): replace the `on:` block of the workflow with the commented
   one in its header (push to `main`, path-filtered to `.site/**` and the demos' inputs).

## Rollback

- **Instant:** Vercel, the new project, Deployments: find the last good production deployment, "Promote to production" (or
  `vercel rollback <deployment url>`). Seconds, no rebuild.
- **To the old Next site:** Domains: remove `reactiive.io` from the new project and add it back to the old one (or, if you kept
  the old project's alias, re-assign it). The old project is not deleted at cutover: keep it for a month.
- Rolling back never loses anything: the new site writes no data (sign-in, payments and feedback stay on the old backend via `/api/*`).

## What a run needs and where the pieces are

| Piece | Where |
|---|---|
| Workflow | `.github/workflows/site-deploy.yml` |
| Demos artifact key / cache | `.site/tools/demos-web/build.ts` (`--key-only`) |
| Compose (output tree, redirects, `/api/*`, live's `/content-assets/` images) | `.site/tools/compose.ts` |
| Head, JSON-LD, sitemap, robots, RSS, manifest | `.site/tools/seo/` (`metadata.ts` is the one table of page kinds) |
| Parity of those with the live site | `bun .site/tools/parity/head-diff.ts` |

## SEO notes

- `metadata.ts` `allPages()` lists every page kind from the content frontmatter (`.content/articles/*/index.json`: title,
  subtitle, date, tags, series, featuredImage). A built page with no entry, or a head title that differs from the
  `head title=...` in the Contract, fails `postbuild.ts`: new routes must say what they are.
- The home title is plain `Home`; every other page `<title> | Reactiive`; the 404 page is `noindex` (two robots tags, as live).
- Article images keep live's URLs `/content-assets/<kind>/<slug>/images/<file>` (share images, JSON-LD, image search):
  compose places the originals there; the pages load the optimised copies under `/assets/content/`.
- Every article and demo post is built and listed in the sitemap (D25). The head is byte-identical to live (checked by head-diff).
- `/_dev/*` and the Demos app's paths are never listed; `/demos` is the only demos URL in the sitemap.
- Known accepted head difference: Next's `next-size-adjust` marker.
- Deliberate head differences (D23): /demos's and /demos-app's descriptions (and og/twitter, og:image:alt) are their
  own ("100+ animations built with Exact, Rust and WebGPU ..."); head-diff expects them in place of live's.
