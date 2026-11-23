# reactiive.io: inventory of the current site (reference for the Exact rebuild)

Reference repo: `enzomanuelmangano/reactiive.io` at `ef912464` (main, 2026-11-23), checkout
`/Users/enzomanuelmangano/Desktop/Work/reactiive/reactiive.io`, **read-only**. Live site: `https://reactiive.io`
(Vercel, `x-vercel-id fra1`, served `x-nextjs-prerender: 1`). Swept 2026-11-23 with headless Chrome 158 over CDP.
Companion: [architecture.md](architecture.md). Copied into the repo at .site/docs/ on 2026-11-23.

## 1. Stack

| Layer | What |
|---|---|
| Framework | Next.js 16.3.3 App Router, Turbopack, React 19.2.8, TypeScript strict; Bun 1.2.19 (`packageManager`), Node ≥ 24 |
| Style | Tailwind CSS v4 (`@tailwindcss/postcss`), `tw-animate-css`, theme pinned to the v3 values in `src/app/globals.css` (468 lines), `class-variance-authority`, `clsx`, `tailwind-merge` |
| Content | `@next/mdx` + 5 local plugins (`mdx-plugins/`: remark-gfm, remark-content-assets, rehype-code-meta, rehype-list-whitespace, rehype-unwrap-images); generated import maps `src/content/*.ts` and indexes `src/data/*.json` by `scripts/build-content-index.ts` (`content:build`, run before dev/build) |
| Client state/data | Jotai, TanStack Query (+ sync-storage persister), axios client to `${EXPO_PUBLIC_WEBSITE_URL}/api` |
| UI libs | `sonner` (toasts), `vaul` (drawer), Radix dialog/checkbox, `lucide-react` (2 icons inlined), `figma-squircle`, `qrcode-generator`, `prism-react-renderer` (palenight), `react-youtube`, `react-intersection-observer` |
| Motion | CSS keyframes (most of the site), `framer-motion` 11 in 5 files (course "Learn" + testimonials, demo-video chips, `staggered-text`, `reveal-on-scroll`, one article checkbox), `@number-flow/react` (GitHub stars pill on /demos). **No GSAP.** `src/lib/animation` = home-grown Reanimated/Gesture replacement (rAF values, springs, pointer pan) for the article demos |
| Backend | 22 API routes, Drizzle ORM + Postgres (Supabase), LemonSqueezy, OAuth (Google/GitHub/Apple/Patreon), JWT, Telegram notifications, pino |
| Observability | Sentry `@sentry/nextjs` (`instrumentation.ts`, `instrumentation-client.ts`), Amplitude browser SDK |
| Deploy | Vercel project `reactiive-io`, `vercel.json` = `{framework: nextjs, installCommand: bun install, buildCommand: bun run build}`; push to `main` = production |
| CI | `.github/workflows/ci.yml`: on push/PR to main/dev: `bun install --frozen-lockfile`, `content:build`, `typecheck`, `lint` |

## 2. Routes

Pages (`src/app/**/page.tsx`): 13 route files → **171 URLs** (13 static + 6 series + 26 articles + 126 demo posts),
plus `sitemap.xml`, `robots.txt`, `rss.xml`, `manifest.json`, the 404. No `middleware.ts`/`proxy.ts`.

| Route | File | Render | What it shows |
|---|---|---|---|
| `/` | `app/page.tsx` | static | `Container` md; staggered `motion-blur-in` entrance (80-650 ms delays, 900 ms, ease `cubic-bezier(.22,1,.36,1)`): 👋 `WavingHand` (keyframe `wave`), h1 "Hey, I'm Enzo." (body style), intro paragraph, `Newsletter` ("Join 5,000+ devs…", email + Subscribe → `https://subs.reactiive.io/api/subscribe`), "PROJECTS" caption + 3 `ProjectItem`s (Reanimate.dev / Demos → `/demos` / YouTube). JSON-LD WebSite + Person graph. Title "Home". |
| `/demos` | `app/demos/page.tsx` + `content.tsx` | ISR (stars fetched with `revalidate: 3600`) | **Replaced by the Demos web app in the rebuild.** Today: `SpiralBackdrop` (Canvas spiral after 1.2 s, skipped on low-end devices), `LandingHero` ("Demos" 2.5→9 rem gradient title with `motion-title` rotateX entrance, tap ×7 easter-egg toast, subtitle, `GitHubStarsButton` with NumberFlow stars), `VideoGrid`: search field (`/` shortcut, `?q=` in URL), infinite-scroll grid of phone-frame video cards (8 per page, IntersectionObserver loader), empty-state placeholder. Footer variant "Terms \| Privacy Policy". |
| `/demos/[post]` | `app/demos/[post]/page.tsx` | SSG, 126 slugs | `Container` md, MDX: `Title` (date), `Demo` (R2 mp4 in a phone frame + chips), `GithubCard`, prose, `ReanimatePromo`, `SendFeedback`; 5 posts with `GitHubRepoButtons`. JSON-LD NewsArticle. og:image `/demos/og-image/<slug>` (**404 on live**, see §8). Not in sitemap. Only reachable from the /demos grid. |
| `/articles` | `app/articles/page.tsx` | static | sr-only h1, `ArticleList` 3-column card grid (featured image, title, subtitle, date) with reveal-on-scroll cards. |
| `/articles/[post]` | `app/articles/[post]/page.tsx` | SSG, 26 slugs | MDX in `MarkdownTheme` + `Newsletter showTitle`. JSON-LD NewsArticle. og:image = featured image. |
| `/series/[series]` | `app/series/[series]/page.tsx` | SSG, 6 | `ArticleList` filtered: animate-with-reanimated, engineering, exploring-skia, react-native-toolbelt, thoughts, what-about-gestures. Title = title-cased slug. |
| `/docs` | `app/docs/page.tsx` | static | an empty `<div/>` (header + footer only). |
| `/docs/[post]` | `app/docs/[post]/page.tsx` | SSG, 3 | terms, privacy, license (MDX). |
| `/course` | `app/course/page.tsx` | static | `Learn`: "Reanimate.dev" heading, subtitle, pill CTA → reanimate.dev, framer-motion stagger; masonry of ~30 testimonial cards (avatar from `public/images/avatars`, X/Bluesky badge, quote). |
| `/inspirations` | `app/inspirations/page.tsx` | static | two intro paragraphs, "Inspirations" (4 `ProjectItem`s), "Mentions" (1), "Back to Home". |
| `/demos-app` | `app/demos-app/page.tsx` | static | "Demos (TestFlight)" text, styled QR (`qrcode-generator`, 240 px) of `https://testflight.apple.com/join/uB9PQHuT` with hover scale, 4 install steps. |
| `/profile` | `app/profile/*` | client, noindex/nofollow | auth-gated (`withRoleHandler`): Profile Settings, `SubscriptionBox`, `SendFeedback`, mobile sign out. |
| `/manage-subscription` | `app/manage-subscription/*` | client, noindex/nofollow | auth-gated subscription management ("Support Demos"). |
| 404 | `app/not-found.tsx` | static | `components/404`: "404 - Page Not Found", link home; robots noindex, follow. |
| `/sitemap.xml` | `app/sitemap.ts` | static | 29 URLs: `/` (weekly 1), `/demos` (daily 1), `/articles` (weekly 0.8), 26 articles (weekly 0.5, lastModified = date). Demo posts excluded on purpose. |
| `/robots.txt` | `app/robots.ts` | static | `User-Agent: *`, `Allow: /`, `Host: https://reactiive.io`, `Sitemap: …/sitemap.xml`. |
| `/rss.xml` | `app/rss.xml/route.ts` | force-static | RSS 2.0 + atom + content:encoded, 26 items, author `hello@reactiive.io (Enzo Manuel Mangano)`. |

Shell on every page (`layout.tsx` + `providers.tsx`): pre-paint script reading `localStorage['reactiive:signed-in']`
(reserves the avatar slot), `<noscript>` rule for `.motion-wait`, `Toaster` (dark), Query/Jotai/Amplitude/Auth
providers, lazy `ModalProvider` (12 modals), "Skip to content" link, `Header`, `<main id=main>` flex column
`min-h-[80vh]`, `ScrollToTop` (scrolls to top on route change), `Footer` (variant by path: `/demos`, `/profile`,
`/manage-subscription`, `/privacy`, `/terms` → "Terms | Privacy Policy"; else "Follow me on Twitter | Inspirations").

Header: desktop (≥ md) fixed bar, logo SVG 190×35, nav Articles/Demos with 1.5 px underline (scale transition,
active = current path), Sign In slot (blurred/pending until auth resolves; avatar when signed in); after 10 px scroll
it gets `bg-background` + `border-b white/5` (300 ms). Mobile (< md): logo 150×28, hamburger → full-screen overlay
menu (Home, Articles, Demos, Sign In/Profile), `inert` when closed.

### API routes (22, all env-dependent, none rendered)

`auth/{apple-sign-up,connect-github,connect-patreon,google-sign-up}`, `callback/{apple,github,google,patreon}`,
`feedback/{demo-request,submit}`, `github/stars`, `purchase/{cancel-subscription,create,downgrade-subscription,
resume-subscription,toggle-subscription,upgrade-subscription}`, `refund/request`, `user/{info,patreon-info,
reset-subscription-status}`, `webhook/subscription` (LemonSqueezy). Third parties call the OAuth callbacks and the
webhook, so they must keep answering after a cutover (architecture §8).

## 3. Content (`content/**`, 12 MB)

| Kind | Count | Files | Notes |
|---|---|---|---|
| Articles | 26 | `index.mdx`, `index.json` (title, shortTitle, subtitle, author, date, slug, tags, featuredImage, series), `index.js`, `images/` (33 png, 35 webp, 1 gif), 11 with `components/` + `mdx-client.tsx` (49 .tsx) | 10 MB; dates 2022-04-13 → 2025-12-06 |
| Demo posts | 126 | `index.mdx`, `index.js` (`module.exports` title/author/date/slug/tags) | 1 MB; dates 2022-12-07 → 2026-10-04; a demo is public from 10:00 UTC of its date (`isPublished`, evaluated at build/ISR) |
| Docs | 3 | terms, privacy, license | |

MDX components used (counts across content): `GithubCard` 139, `Demo` 127, `SendFeedback` 126, `ReanimatePromo` 121,
`YouTubeEmbed` 17, `GitHubRepoButtons` 5, `InlineMath` 5, `BlockMath` 5, `Embed` 3, `Title` (every page), `Kbd`,
plus the brand-anchor rule (Expo / expo-router / react-navigation / Lego / SiriusXM links lose link colour) and code
fences (prism palenight, copy button, diff, terminal theme for shell).

## 4. Interactive article components (37 exports, 11 articles)

| Article | Exports | Tech in the reference |
|---|---|---|
| animated-gradient | AnimatedGradientWithSkia, GlitchedAnimatedGradientWithSkia, NonInteractiveAnimatedGradientWithSkia | Canvas 2D gradients, rAF values |
| animated-loader-skia | BasicLoaderWithSkia, WithGradientLoaderWithSkia, WithProgressLoaderWithSkia, WithBasicAnimationLoaderWithSkia, WithAnimationLoaderWithSkia | Canvas 2D, conic gradient, blur |
| animated-spiral | AnimatedSpiralWithSkia, AnimatedInteractiveSnappySpiralWhite, AnimatedInteractiveSnappySpiralGradient, AnimatedInteractiveAnimatedSpiralFixedRadiusGradient (+ InlineMath, BlockMath) | Canvas 2D, springs, MathJax 3 (jsDelivr) |
| bottom-sheet-animation | InteractiveBox, InitialSetup, BasicComponent, PanGesture, BorderRadius, FinalDemo | pointer pan, springs |
| checkbox-interactions | Demo, StaticDemo | framer-motion |
| css-animations-react-native | AnimatedSquare, InteractiveBox | CSS transitions |
| introduction-to-gestures | IntroToGesturesDemo | pointer pan |
| introduction-to-reanimated | FinalAnimatedSquareDemo, AnimatedSquareOpacityDemo, AnimatedSquareOpacityAndScaleDemo | rAF values |
| metaball | BasicMetaballWithSkia, WithPanMetaballWithSkia, WithColorMatrixMetaballWithSkia, WithBlurMetaballWithSkia, CanvasKitJsAlert | SVG `feColorMatrix` goo + blur filter, pan |
| pan-gesture-handler | InteractivePanGesture | pointer pan |
| skeleton-loader | InteractiveSkeletonDemo, InteractiveContactItem, InteractiveJustSkeleton | CSS shimmer keyframes |

## 5. Design system

- **Theme: dark only.** Background `oklch(15.5% 0.0041 286)` (#0c0c0e as `theme-color` in both schemes); surfaces
  secondary 23 %, tertiary 26.5 %, elevated 19.5 %, code 18.5 %; text primary 92 %, secondary 81.8 %, tertiary 66 %,
  disabled 50 %; link `#7d8fef` / hover `#9faef4`; primary `#6172e8` (400 `#7d8fef`, 600 `#4a5ad4` …); success
  `#22c97e`, danger `#ef5544`, warning `#e9b308`, info `#4d7df6`; hairlines `rgb(255 255 255 / .08)` and `.14`;
  selection `#262935db`.
- Radii: xs 2, sm 4, default 6, md 8, lg 12, xl 16, 2xl 20, 3xl 24, card 18, control 10. Shadows: `highlight`,
  `xs…2xl` (dark-tuned), `surface` (layered ring), `overlay`, `control`, `control-focus`, `focus` (2 px gap + ring).
  `--blur-sm: 4px`, `--spacing-mdrail`.
- Eases: `--ease-motion cubic-bezier(.22,1,.36,1)`, `--ease-snappy cubic-bezier(.23,1,.32,1)`, `--ease-out-expo
  cubic-bezier(.19,1,.22,1)`. Keyframes: kennyburns, motion-title-in, motion-blur-in, motion-pop-in, motion-qr-in,
  motion-card-in, fadeIn, wave, skeleton-shimmer; all disabled under `prefers-reduced-motion: reduce`;
  `scroll-behavior: smooth` only with no-preference.
- Fonts: Inter 4 variable (`InterVariable.woff2`, subset 115 KB, wght 100-900, opsz 14-32, preloaded,
  `font-optical-sizing: auto`), Source Code Pro 400 (`woff2`, 36 KB, not preloaded), self-hosted via `next/font/local`.
  Unused leftovers: `public/fonts/Inter_400Regular.ttf` (304 KB).
- Breakpoints: Tailwind defaults sm 640, md 768 (header switch), lg 1024, xl 1280; custom variant `canhover`
  (`@media (hover: hover)`). Containers: xs 448 / sm 576 / md 768 / lg 896 / xl 1152 / 2xl 1280 px, padding 24.
- RN-web parity traps encoded in the code (`CLAUDE.md`, `MIGRATION.md`): RNW `<Text>` line-height normal +
  `pre-wrap`, `<View>` flex column min-size 0, list bullets as `::before`, weights as real faces, `not-prose` roots.

## 6. Assets (`public/`, 81 MB, 314 files)

| Path | Size | Use |
|---|---|---|
| `demos/videos` (126 mp4) | 74 MB | demo videos; **served in production from R2** `https://pub-4f02f6295cfb4d38ad95eef187b3610d.r2.dev/demos/…` (`EXPO_PUBLIC_MEDIA_CDN_URL`); largest 6.2 MB |
| `demos/thumbnails` (126 webp) | 1.2 MB | grid posters (R2) |
| `demos/main/demos-main.mp4` | 3.5 MB | main demo video (R2) |
| `images/avatars` (42) | 1.3 MB | testimonials on /course |
| `og/{main,demos,articles}.png` | 88/128/88 KB | 1280×720 share images |
| `pwa/` | 140 KB | apple-touch-icon 180, chrome icons 144/192/512 |
| `logos/{dark-github,demos}.png` | 4/192 KB | GithubCard, demos |
| `pfp.png` | 292 KB | |
| `manifest.json`, `LICENSE`, `apple-touch-icon.png`, `favicon.ico` (app/) | small | |
| `file.svg globe.svg next.svg vercel.svg window.svg` | small | create-next-app leftovers, unused |
| `content-assets/` | generated | article images copied by `content:build` (gitignored) |

## 7. SEO and third parties

- Per page via `pageMetadata()`: title (template `%s | Reactiive`, but home's title renders as plain "Home"),
  description, canonical `https://reactiive.io<path>`, RSS alternate, OpenGraph (site_name, type website/article,
  locale en_US, url, image with width/height/alt/secure_url, published_time/authors/tags on posts), Twitter
  `summary_large_image` + `@reactiive_`. Layout adds author/creator/publisher, manifest, apple-touch-icon,
  appleWebApp capable, `msapplication-TileColor`, `X-UA-Compatible`, theme-color ×3, viewport `viewport-fit=cover`.
- JSON-LD: `/` (WebSite + Person), articles and demo posts (NewsArticle).
- Third-party origins at runtime: R2 media CDN, `avatars.githubusercontent.com` (GithubCard owner avatar),
  `cdn.jsdelivr.net` MathJax 3 (5 articles), YouTube iframes (17), `platform.twitter.com/widgets.js` (X embed),
  `subs.reactiive.io` (newsletter POST), Amplitude, Sentry, `api.github.com` (server, ISR). Script hosts seen by
  the sweep: `reactiive.io` everywhere, plus `www.youtube.com` (17 articles), `platform.twitter.com` (introducing-refined,
  leaving-patreon), `cdn.jsdelivr.net` (animated-spiral, MathJax).

## 8. Env-dependent parts (to stub in the rebuild)

Keys in `.env.example` / `src/server/env` (names only, values never read): `DATABASE_URL`,
`EXPO_PUBLIC_{WEBSITE_URL,AMPLITUDE_API_KEY,ACCESS_KEY,SENTRY_DSN,MEDIA_CDN_URL}`,
`LEMON_SQUEEZY_{API_KEY,STORE_ID,MONTHLY_SUPPORTER_VARIANT_ID,ANNUAL_SUPPORTER_VARIANT_ID,WEBHOOK_SECRET}`,
`GOOGLE_CLIENT_{ID,SECRET}`, `GITHUB_CLIENT_{ID,SECRET}`, `GITHUB_OAUTH_TOKEN`, `PATREON_CLIENT_{ID,SECRET}`,
`APPLE_{TEAM_ID,CLIENT_ID,KEY_ID,PRIVATE_KEY}`, `AUTH_JWT_SECRET`, `BEEHIIV_{API_KEY,PUBLICATION_ID}`,
`TELEGRAM_{BOT_TOKEN,CHAT_ID}`.

| Feature | Depends on | Visible where |
|---|---|---|
| Sign in / session | OAuth keys, JWT, `ACCESS_KEY`, DB | header Sign In slot, mobile menu, sign-in modal |
| Profile, subscriptions, purchase/refund modals, webhook | LemonSqueezy, DB, auth | `/profile`, `/manage-subscription`, modals |
| Feedback & demo requests | auth, Telegram | `SendFeedback` card on 126 demo posts, profile |
| Live GitHub stars/cards | `GITHUB_OAUTH_TOKEN` (falls back to `src/data/github-repos.json`) | /demos pill, `GithubCard` (139 uses) |
| Analytics | Amplitude key | none visible |
| Error reporting | Sentry DSN | none visible |
| Media URLs | `EXPO_PUBLIC_MEDIA_CDN_URL` (public value, visible in live HTML) | demo videos |
| Scripts | DB, LemonSqueezy, Apple, Telegram | `scripts/*` (refunds, orders, Apple secret, patrons, perf tests) |

Not env-dependent and kept: newsletter (public endpoint), YouTube, MathJax (moved to build time), QR, RSS/sitemap.

## 9. Live site vs repo (differences found)

1. **Demo-post og:image 404s**: `/demos/<slug>` pages advertise `og:image https://reactiive.io/demos/og-image/<slug>`
   (from `generateMetadata`), and no such route exists in the repo; live answers 404 (checked `/demos/og-image/action-tray`).
   Decision D1 for the owner: keep (strict parity) or point at the thumbnail.
2. **Home title** is "Home" (no "| Reactiive"), because the page sets `title` and the layout's template does not apply
   to the root segment's own metadata; canonical `https://reactiive.io` (no slash). Recorded as-is for parity.
3. **Sitemap** live = repo (29 URLs). robots live = repo.
4. **Stars pill** live shows 3,248 (ISR, live GitHub); the snapshot JSON differs: env-dependent.
5. **/articles and /series reveal-on-scroll**: cards below the first viewport only appear when scrolled into view;
   full-page captures beyond the viewport show them hidden/faded (see §10), which is the live behaviour for an
   unscrolled page, not a bug.
6. **/demos grid** loads 8 cards and the rest on scroll (IntersectionObserver), live = repo.
7. `MIGRATION.md` says "125 demos"; the repo and live have **126**. `README.md` is the create-next-app stub.
8. Unused files: `public/{file,globe,next,vercel,window}.svg`, `public/fonts/Inter_400Regular.ttf`,
   `components/landing/tabs/pricing` (archived), FAQ archived.
9. **Signed-out `/profile` and `/manage-subscription` redirect client-side to `/demos`**: the sweep landed on the
   /demos page (title "Demos | Reactiive", same counts). After the rebuild that target is the Demos app; the stub must
   keep the redirect (to `/demos/`).
10. **`/docs`** (empty index) has title "Reactiive" and canonical `https://reactiive.io/` (layout defaults); the 404
    page likewise has canonical `https://reactiive.io/` and the site description. Kept for parity.
11. No JavaScript exceptions on any of the 171 routes at either width; every route 200 except the 404 probe.
12. Per-page metrics of every route (status, title, description, canonical, og, heights, element counts, script
   hosts, JS exceptions) are in `/tmp/reactiive-live/metrics.json`; summary in §10.

## 10. Live screenshots

Saved under `/tmp/reactiive-live/` as `<route>@1440.jpg` and `<route>@390.jpg` (route `/` = `home`, `/` → `__`,
full page, JPEG q70, capped at 16,000 px), produced by `/tmp/reactiive-live-tools/shoot.ts` (CDP, viewport 1440×900
desktop and 390×844 mobile with touch emulation, 3.5 s settle + one scroll-through). Pages whose content reveals on
scroll also have `<route>@1440.tall.jpg` (viewport as tall as the page, so every reveal fires).

Totals: 171 routes, 342 screenshots (+8 `.tall`), failures: 0; non-200: [('/this-page-does-not-exist', 404)]; script hosts: ['cdn.jsdelivr.net', 'platform.twitter.com', 'reactiive.io', 'www.youtube.com']; routes with JS exceptions: []

| Route | Files (@1440, @390) | HTTP | Title | Height 1440 / 390 px | links / img / video / iframe / canvas / pre | JSON-LD |
|---|---|---|---|---|---|---|
| `/` | `home@1440.jpg`, `@390.jpg` | 200 | Home | 905 / 874 | 13 / 0 / 0 / 0 / 0 / 0 | 1 |
| `/demos` | `demos@1440.jpg`, `@390.jpg` | 200 | Demos | Reactiive | 1990 / 2080 | 19 / 8 / 0 / 0 / 2 / 0 | 0 |
| `/articles` | `articles@1440.jpg`, `@390.jpg` | 200 | Articles | Reactiive | 3212 / 8094 | 36 / 26 / 0 / 0 / 0 / 0 | 0 |
| `/course` | `course@1440.jpg`, `@390.jpg` | 200 | Course | Reactiive | 2077 / 5059 | 37 / 26 / 0 / 0 / 0 / 0 | 0 |
| `/inspirations` | `inspirations@1440.jpg`, `@390.jpg` | 200 | Inspirations | Reactiive | 1186 / 1355 | 16 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/demos-app` | `demos-app@1440.jpg`, `@390.jpg` | 200 | Demos (TestFlight) | Reactiive | 1057 / 1074 | 12 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/docs` | `docs@1440.jpg`, `@390.jpg` | 200 | Reactiive | 905 / 844 | 10 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/docs/terms` | `docs__terms@1440.jpg`, `@390.jpg` | 200 | Terms of Service | Reactiive | 13139 / 23496 (capped) | 14 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/docs/privacy` | `docs__privacy@1440.jpg`, `@390.jpg` | 200 | Privacy Policy | Reactiive | 5948 / 9865 | 11 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/docs/license` | `docs__license@1440.jpg`, `@390.jpg` | 200 | License | Reactiive | 2522 / 3891 | 11 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/profile` | `profile@1440.jpg`, `@390.jpg` | 200 | Demos | Reactiive | 1990 / 2080 | 19 / 8 / 0 / 0 / 2 / 0 | 0 |
| `/manage-subscription` | `manage-subscription@1440.jpg`, `@390.jpg` | 200 | Demos | Reactiive | 1990 / 2080 | 19 / 8 / 0 / 0 / 2 / 0 | 0 |
| `/this-page-does-not-exist` | `this-page-does-not-exist@1440.jpg`, `@390.jpg` | 404 | Page not found | Reactiive | 905 / 844 | 11 / 0 / 0 / 0 / 0 / 0 | 0 |
| `/series/animate-with-reanimated` | `series__animate-with-reanimated@1440.jpg`, `@390.jpg` | 200 | Animate With Reanimated | Reactiive | 1615 / 3583 | 21 / 11 / 0 / 0 / 0 / 0 | 0 |
| `/series/engineering` | `series__engineering@1440.jpg`, `@390.jpg` | 200 | Engineering | Reactiive | 905 / 844 | 11 / 1 / 0 / 0 / 0 / 0 | 0 |
| `/series/exploring-skia` | `series__exploring-skia@1440.jpg`, `@390.jpg` | 200 | Exploring Skia | Reactiive | 905 / 1365 | 14 / 4 / 0 / 0 / 0 / 0 | 0 |
| `/series/react-native-toolbelt` | `series__react-native-toolbelt@1440.jpg`, `@390.jpg` | 200 | React Native Toolbelt | Reactiive | 905 / 1088 | 13 / 3 / 0 / 0 / 0 / 0 | 0 |
| `/series/thoughts` | `series__thoughts@1440.jpg`, `@390.jpg` | 200 | Thoughts | Reactiive | 905 / 1068 | 13 / 3 / 0 / 0 / 0 / 0 | 0 |
| `/series/what-about-gestures` | `series__what-about-gestures@1440.jpg`, `@390.jpg` | 200 | What About Gestures | Reactiive | 905 / 844 | 12 / 2 / 0 / 0 / 0 / 0 | 0 |
| `/articles/introducing-refined` | `articles__introducing-refined@1440.jpg`, `@390.jpg` | 200 | Introducing Refined: optimize your React Native styles by default | Reactiive | 8099 / 8472 | 15 / 2 / 0 / 3 / 0 / 15 | 1 |
| `/articles/open-sourcing-demos` | `articles__open-sourcing-demos@1440.jpg`, `@390.jpg` | 200 | Demos is now Open Source | Reactiive | 2929 / 3762 | 15 / 1 / 0 / 0 / 0 / 0 | 1 |
| `/articles/appjs-2025` | `articles__appjs-2025@1440.jpg`, `@390.jpg` | 200 | Speaking at App.js 2025 | Reactiive | 3150 / 4451 | 38 / 1 / 0 / 1 / 0 / 0 | 1 |
| `/articles/checkbox-interactions` | `articles__checkbox-interactions@1440.jpg`, `@390.jpg` | 200 | Checkbox Interactions - The beauty of Layout Animations | Reactiive | 8804 / 10191 | 11 / 1 / 0 / 1 / 0 / 9 | 1 |
| `/articles/bottom-sheet-animation` | `articles__bottom-sheet-animation@1440.jpg`, `@390.jpg` | 200 | Building a BottomSheet from scratch in React Native | Reactiive | 10276 / 9932 | 10 / 0 / 0 / 1 / 0 / 9 | 1 |
| `/articles/css-animations-react-native` | `articles__css-animations-react-native@1440.jpg`, `@390.jpg` | 200 | CSS Animations but in React Native | Reactiive | 8140 / 8150 | 17 / 0 / 0 / 0 / 0 / 4 | 1 |
| `/articles/building-demos` | `articles__building-demos@1440.jpg`, `@390.jpg` | 200 | How did I build Demos: a high-level overview | Reactiive | 3859 / 4923 | 18 / 1 / 0 / 0 / 0 / 0 | 1 |
| `/articles/animated-loader-skia` | `articles__animated-loader-skia@1440.jpg`, `@390.jpg` | 200 | Animated Loader with React Native (Skia) | Reactiive | 9765 / 10031 | 12 / 1 / 0 / 1 / 4 / 7 | 1 |
| `/articles/skeleton-loader` | `articles__skeleton-loader@1440.jpg`, `@390.jpg` | 200 | Skeleton Animation in React Native with Moti | Reactiive | 8292 / 8409 | 11 / 1 / 0 / 1 / 0 / 8 | 1 |
| `/articles/leaving-patreon` | `articles__leaving-patreon@1440.jpg`, `@390.jpg` | 200 | Leaving Patreon. Moving to Demos | Reactiive | 7271 / 7649 | 15 / 2 / 0 / 4 / 0 / 0 | 1 |
| `/articles/patreon-migration` | `articles__patreon-migration@1440.jpg`, `@390.jpg` | 200 | Migration: from Patreon to Demos | Reactiive | 2182 / 2847 | 15 / 0 / 0 / 0 / 0 / 0 | 1 |
| `/articles/metaball` | `articles__metaball@1440.jpg`, `@390.jpg` | 200 | Metaball Animation with React Native Skia | Reactiive | 10530 / 11002 | 19 / 1 / 0 / 1 / 4 / 13 | 1 |
| `/articles/animated-spiral` | `articles__animated-spiral@1440.jpg`, `@390.jpg` | 200 | Animated Spiral with React Native Skia | Reactiive | 10370 / 10923 | 14 / 1 / 0 / 0 / 5 / 12 | 1 |
| `/articles/introduction-to-reanimated` | `articles__introduction-to-reanimated@1440.jpg`, `@390.jpg` | 200 | Introduction to Reanimated | Reactiive | 13310 / 14612 | 12 / 1 / 0 / 1 / 0 / 21 | 1 |
| `/articles/animated-gradient` | `articles__animated-gradient@1440.jpg`, `@390.jpg` | 200 | Animated Gradient in React Native (Skia) | Reactiive | 8811 / 9198 | 12 / 1 / 0 / 1 / 3 / 10 | 1 |
| `/articles/the-hidden-gems-of-react-native` | `articles__the-hidden-gems-of-react-native@1440.jpg`, `@390.jpg` | 200 | The Hidden Gems of React Native | Reactiive | 10939 / 12804 | 29 / 6 / 0 / 0 / 0 / 5 | 1 |
| `/articles/animated-flat-list` | `articles__animated-flat-list@1440.jpg`, `@390.jpg` | 200 | Animated FlatList in React Native Reanimated | Reactiive | 7124 / 8311 | 12 / 1 / 0 / 1 / 0 / 7 | 1 |
| `/articles/introduction-to-gestures` | `articles__introduction-to-gestures@1440.jpg`, `@390.jpg` | 200 | Introduction to React Native Gesture Handler | Reactiive | 15097 / 16548 (capped) | 13 / 1 / 0 / 1 / 0 / 17 | 1 |
| `/articles/setup-reanimated-gestures` | `articles__setup-reanimated-gestures@1440.jpg`, `@390.jpg` | 200 | How to install React Native Reanimated and Gesture Handler | Reactiive | 4001 / 4469 | 12 / 0 / 0 / 0 / 0 / 11 | 1 |
| `/articles/smooth-dropdown` | `articles__smooth-dropdown@1440.jpg`, `@390.jpg` | 200 | Creating a Smooth Dropdown Menu Animation in React Native Reanimated | Reactiive | 20683 / 25061 (capped) | 13 / 1 / 0 / 1 / 0 / 23 | 1 |
| `/articles/circular-progress-bar` | `articles__circular-progress-bar@1440.jpg`, `@390.jpg` | 200 | Circular Progress Bar Animation with React Native Reanimated | Reactiive | 5230 / 6310 | 14 / 1 / 0 / 1 / 0 / 6 | 1 |
| `/articles/the-power-of-lottie` | `articles__the-power-of-lottie@1440.jpg`, `@390.jpg` | 200 | Unlocking the Power of Lottie in React Native | Reactiive | 6434 / 7622 | 13 / 1 / 0 / 1 / 0 / 6 | 1 |
| `/articles/pinch-gesture-handler` | `articles__pinch-gesture-handler@1440.jpg`, `@390.jpg` | 200 | Exploring Pinch Gesture in React Native (Reanimated) | Reactiive | 10400 / 13319 | 12 / 1 / 0 / 1 / 0 / 9 | 1 |
| `/articles/interpolate-with-scrollview` | `articles__interpolate-with-scrollview@1440.jpg`, `@390.jpg` | 200 | Interpolate with ScrollView like a Pro (Reanimated) | Reactiive | 16806 / 19337 (capped) | 12 / 1 / 0 / 1 / 0 / 19 | 1 |
| `/articles/pan-gesture-handler` | `articles__pan-gesture-handler@1440.jpg`, `@390.jpg` | 200 | Introduction to Pan Gesture Handler in Reanimated | Reactiive | 13476 / 14983 | 13 / 1 / 0 / 1 / 0 / 17 | 1 |
| `/articles/haptic-feedback` | `articles__haptic-feedback@1440.jpg`, `@390.jpg` | 200 | The Secret Ingredient: React Native Haptic Feedback | Reactiive | 3321 / 3733 | 13 / 0 / 0 / 1 / 0 / 6 | 1 |
| `/demos/sculptures-in-words` | `demos__sculptures-in-words@1440.jpg`, `@390.jpg` | 200 | Sculptures in Words — Text to Statue Morph | Reactiive | 3564 / 4593 | 16 / 0 / 1 / 0 / 0 / 4 | 1 |
| `/demos/light-on-painting` | `demos__light-on-painting@1440.jpg`, `@390.jpg` | 200 | Light on Painting — Depth-Aware Relighting | Reactiive | 3032 / 3865 | 18 / 0 / 1 / 0 / 0 / 3 | 1 |
| `/demos/the-little-prince` | `demos__the-little-prince@1440.jpg`, `@390.jpg` | 200 | The Little Prince — Text to Image Morph | Reactiive | 2411 / 2825 | 16 / 0 / 1 / 0 / 0 / 3 | 1 |
| `/demos/chessboard` | `demos__chessboard@1440.jpg`, `@390.jpg` | 200 | Chessboard Shader | Reactiive | 2402 / 2759 | 16 / 0 / 1 / 0 / 0 / 2 | 1 |
| `/demos/art-gallery` | `demos__art-gallery@1440.jpg`, `@390.jpg` | 200 | Art Gallery with React Native WebGPU and Nitro | Reactiive | 2162 / 2658 | 16 / 0 / 1 / 0 / 0 / 0 | 1 |
| `/demos/cherry-blossom-qrcode` | `demos__cherry-blossom-qrcode@1440.jpg`, `@390.jpg` | 200 | cherry-blossom-qrcode | Reactiive | 3717 / 4731 | 18 / 1 / 1 / 0 / 0 / 4 | 1 |
| `/demos/github-terrain` | `demos__github-terrain@1440.jpg`, `@390.jpg` | 200 | github-terrain | Reactiive | 3902 / 4757 | 18 / 1 / 1 / 0 / 0 / 4 | 1 |
| `/demos/notion-qrcode` | `demos__notion-qrcode@1440.jpg`, `@390.jpg` | 200 | Spiral QRCode | Reactiive | 3573 / 4456 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/scrollable-shapes` | `demos__scrollable-shapes@1440.jpg`, `@390.jpg` | 200 | Scrollable Shapes with Skia and Reanimated | Reactiive | 3109 / 3769 | 18 / 1 / 1 / 0 / 0 / 4 | 1 |
| `/demos/sphere-waves` | `demos__sphere-waves@1440.jpg`, `@390.jpg` | 200 | Sphere Waves with Skia | Reactiive | 3910 / 4681 | 18 / 1 / 1 / 0 / 0 / 6 | 1 |
| `/demos/calendar-days` | `demos__calendar-days@1440.jpg`, `@390.jpg` | 200 | Calendar Days Flip Animation | Reactiive | 2601 / 3149 | 19 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/blur-cards` | `demos__blur-cards@1440.jpg`, `@390.jpg` | 200 | Blur Cards with React Native Skia | Reactiive | 2497 / 3016 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/liquid-glass-playground` | `demos__liquid-glass-playground@1440.jpg`, `@390.jpg` | 200 | Liquid Glass Playground | Reactiive | 2524 / 3147 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/magnet-spring` | `demos__magnet-spring@1440.jpg`, `@390.jpg` | 200 | Magnet Spring Animation | Reactiive | 2727 / 3246 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/airbnb-flip-interaction` | `demos__airbnb-flip-interaction@1440.jpg`, `@390.jpg` | 200 | Airbnb Flip Interaction with Reanimated | Reactiive | 3328 / 3922 | 18 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/stacked-carousel` | `demos__stacked-carousel@1440.jpg`, `@390.jpg` | 200 | Stacked Carousel with Reanimated | Reactiive | 2737 / 3172 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/github-contributions` | `demos__github-contributions@1440.jpg`, `@390.jpg` | 200 | GitHub Contributions with Reanimated | Reactiive | 3184 / 3614 | 19 / 1 / 1 / 0 / 0 / 3 | 1 |
| `/demos/draggable-panel` | `demos__draggable-panel@1440.jpg`, `@390.jpg` | 200 | Draggable Panel with Reanimated and Gesture Handler | Reactiive | 2751 / 3045 | 18 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/online-offline` | `demos__online-offline@1440.jpg`, `@390.jpg` | 200 | Online to Offline animation | Reactiive | 2320 / 2811 | 20 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/ios-home-bouncy` | `demos__ios-home-bouncy@1440.jpg`, `@390.jpg` | 200 | iOS 26 Home | Reactiive | 2588 / 3108 | 18 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/time-machine` | `demos__time-machine@1440.jpg`, `@390.jpg` | 200 | Time Machine with Reanimated and Skia | Reactiive | 1754 / 1936 | 21 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/ios-home-grid` | `demos__ios-home-grid@1440.jpg`, `@390.jpg` | 200 | ios-home-grid | Reactiive | 2378 / 2701 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/particles-button` | `demos__particles-button@1440.jpg`, `@390.jpg` | 200 | Particles Button with Reanimated and Skia | Reactiive | 2371 / 2609 | 20 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/sudoku` | `demos__sudoku@1440.jpg`, `@390.jpg` | 200 | Sudoku with React Native Reanimated & Skia | Reactiive | 2784 / 3190 | 20 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/clock-time-picker` | `demos__clock-time-picker@1440.jpg`, `@390.jpg` | 200 | Clock Time Picker with Reanimated & Skia | Reactiive | 2060 / 2242 | 19 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/card-shader-reflections` | `demos__card-shader-reflections@1440.jpg`, `@390.jpg` | 200 | card-shader-reflections | Reactiive | 2213 / 2471 | 19 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/composable-text` | `demos__composable-text@1440.jpg`, `@390.jpg` | 200 | Composable Text with Reanimated 👋 | Reactiive | 2224 / 2378 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/shake-to-delete` | `demos__shake-to-delete@1440.jpg`, `@390.jpg` | 200 | shake-to-delete | Reactiive | 2406 / 2477 | 18 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/fluid-tab-interaction` | `demos__fluid-tab-interaction@1440.jpg`, `@390.jpg` | 200 | fluid-tab-interaction | Reactiive | 2553 / 2680 | 20 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/threads-holo-ticket` | `demos__threads-holo-ticket@1440.jpg`, `@390.jpg` | 200 | Threads Holo Ticket | Reactiive | 2804 / 3128 | 19 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/everybody-can-cook` | `demos__everybody-can-cook@1440.jpg`, `@390.jpg` | 200 | Everybody can cook | Reactiive | 2634 / 3033 | 19 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/verification-code-face` | `demos__verification-code-face@1440.jpg`, `@390.jpg` | 200 | Verification Code with Reanimated and Skia 👀 | Reactiive | 3012 / 3578 | 21 / 1 / 1 / 0 / 0 / 2 | 1 |
| `/demos/stacked-modals` | `demos__stacked-modals@1440.jpg`, `@390.jpg` | 200 | Stacked Modals with React Native Reanimated | Reactiive | 1802 / 2012 | 21 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/linear-sensors` | `demos__linear-sensors@1440.jpg`, `@390.jpg` | 200 | Linear Sensors with Skia and Reanimated | Reactiive | 2496 / 3154 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/mnist` | `demos__mnist@1440.jpg`, `@390.jpg` | 200 | MNIST Neural Network Digit Recognition | Reactiive | 2600 / 3174 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/tab-navigation` | `demos__tab-navigation@1440.jpg`, `@390.jpg` | 200 | Tab Navigation with React Native Reanimated | Reactiive | 2748 / 2902 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/bezier-curve-outline` | `demos__bezier-curve-outline@1440.jpg`, `@390.jpg` | 200 | Bézier Curve Outline with React Native Skia | Reactiive | 2300 / 2562 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/expandable-mini-player` | `demos__expandable-mini-player@1440.jpg`, `@390.jpg` | 200 | Expandable Mini Player with Reanimated | Reactiive | 2244 / 2334 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/snake` | `demos__snake@1440.jpg`, `@390.jpg` | 200 | Snake Game with React Native Skia | Reactiive | 2706 / 2861 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/dynamic-blur-tabs` | `demos__dynamic-blur-tabs@1440.jpg`, `@390.jpg` | 200 | Dynamic Blur TabBar with Reanimated and Expo Blur | Reactiive | 2530 / 2608 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/delete-button` | `demos__delete-button@1440.jpg`, `@390.jpg` | 200 | Gooey Delete Button with React Native Skia | Reactiive | 2900 / 3110 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/motion-blur` | `demos__motion-blur@1440.jpg`, `@390.jpg` | 200 | Blurred List with Reanimated and Expo Blur | Reactiive | 2545 / 2727 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/alert-drawer` | `demos__alert-drawer@1440.jpg`, `@390.jpg` | 200 | Family Alert Drawer with Reanimated | Reactiive | 2210 / 2421 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/duration-slider` | `demos__duration-slider@1440.jpg`, `@390.jpg` | 200 | Duration Slider with React Native Skia 🕒 | Reactiive | 2614 / 2656 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/clerk-toast` | `demos__clerk-toast@1440.jpg`, `@390.jpg` | 200 | Clerk Toast with Reanimated | Reactiive | 2349 / 2532 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/exclusion-tabs` | `demos__exclusion-tabs@1440.jpg`, `@390.jpg` | 200 | Exclusion Tabs with React Native Skia | Reactiive | 2447 / 2489 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/pomodoro-timer` | `demos__pomodoro-timer@1440.jpg`, `@390.jpg` | 200 | Pomodoro Timer with Reanimated | Reactiive | 2629 / 2784 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/steps` | `demos__steps@1440.jpg`, `@390.jpg` | 200 | Steps Pager with Reanimated | Reactiive | 3028 / 3183 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/miles-bar-chart` | `demos__miles-bar-chart@1440.jpg`, `@390.jpg` | 200 | Weekly Bar Chart with Reanimated | Reactiive | 2650 / 2805 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/paper-folding` | `demos__paper-folding@1440.jpg`, `@390.jpg` | 200 | Paper Folding Animation with React Native Skia | Reactiive | 2349 / 2531 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/coverflow-carousel` | `demos__coverflow-carousel@1440.jpg`, `@390.jpg` | 200 | Coverflow Carousel with React Native Reanimated | Reactiive | 2314 / 2478 | 16 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/dot-sheet` | `demos__dot-sheet@1440.jpg`, `@390.jpg` | 200 | Dot Sheet Animation with Reanimated and Skia | Reactiive | 2446 / 2516 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/interaction-appearance` | `demos__interaction-appearance@1440.jpg`, `@390.jpg` | 200 | Blur Theme Switch with Reanimated & Skia 🎨 | Reactiive | 1890 / 2120 | 18 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/checkbox-interactions` | `demos__checkbox-interactions@1440.jpg`, `@390.jpg` | 200 | Checkbox Interactions with Reanimated | Reactiive | 2454 / 2684 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/atlas-sphere` | `demos__atlas-sphere@1440.jpg`, `@390.jpg` | 200 | Atlas Sphere with React Native Skia | Reactiive | 2343 / 2862 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/atlas-button` | `demos__atlas-button@1440.jpg`, `@390.jpg` | 200 | Atlas Button with React Native Skia 🪄 | Reactiive | 2336 / 2602 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/imessage-stack` | `demos__imessage-stack@1440.jpg`, `@390.jpg` | 200 | Swipe Cards with React Native Reanimated | Reactiive | 2524 / 2706 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/grid-visualizer` | `demos__grid-visualizer@1440.jpg`, `@390.jpg` | 200 | Grid Visualizer with React Native Skia 🔢 | Reactiive | 2503 / 2657 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/record-button` | `demos__record-button@1440.jpg`, `@390.jpg` | 200 | Record Button Animation with Skia 🎤 | Reactiive | 2734 / 2916 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/geometry-button` | `demos__geometry-button@1440.jpg`, `@390.jpg` | 200 | Magic Button with React Native Skia 🪄 | Reactiive | 2160 / 2342 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/stacked-list` | `demos__stacked-list@1440.jpg`, `@390.jpg` | 200 | Animated Stacked FlatList made with Reanimated | Reactiive | 2986 / 3168 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/wheel-picker` | `demos__wheel-picker@1440.jpg`, `@390.jpg` | 200 | Wheel Picker with Reanimated and Gesture Handler | Reactiive | 2902 / 3112 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/twodos-slide` | `demos__twodos-slide@1440.jpg`, `@390.jpg` | 200 | Unlock Twodos with Reanimated, Gesture Handler and Skia | Reactiive | 2881 / 3063 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/infinite-carousel` | `demos__infinite-carousel@1440.jpg`, `@390.jpg` | 200 | Infinite Carousel with Reanimated and Gesture Handler | Reactiive | 2720 / 2930 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/empty-qr-code` | `demos__empty-qr-code@1440.jpg`, `@390.jpg` | 200 | Animated Logo/QRCode with React Native Skia | Reactiive | 2397 / 2467 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/prequel-slider` | `demos__prequel-slider@1440.jpg`, `@390.jpg` | 200 | Image Editor with Skia, Reanimated and Gesture Handler | Reactiive | 2643 / 2825 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/gl-transitions` | `demos__gl-transitions@1440.jpg`, `@390.jpg` | 200 | GL Transitions with Skia | Reactiive | 2440 / 2595 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/stacked-bottom-sheet` | `demos__stacked-bottom-sheet@1440.jpg`, `@390.jpg` | 200 | Stacked Action Tray with Reanimated and Gesture Handler | Reactiive | 2853 / 3111 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/staggered-card-number` | `demos__staggered-card-number@1440.jpg`, `@390.jpg` | 200 | Staggered Card Number Input with Reanimated | Reactiive | 2685 / 2915 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/instagram-shared-transition` | `demos__instagram-shared-transition@1440.jpg`, `@390.jpg` | 200 | Instagram Shared Element Transition with Reanimated | Reactiive | 1450 / 1624 | 18 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/3d-scroll-transition` | `demos__3d-scroll-transition@1440.jpg`, `@390.jpg` | 200 | Scroll Transition with Reanimated and Skia | Reactiive | 2836 / 3438 | 18 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/inner-shared-transition` | `demos__inner-shared-transition@1440.jpg`, `@390.jpg` | 200 | Haptic Shared Element Transition with Reanimated | Reactiive | 1498 / 1672 | 18 / 1 / 1 / 0 / 0 / 0 | 1 |
| `/demos/email-demo` | `demos__email-demo@1440.jpg`, `@390.jpg` | 200 | Dynamic FlatList with React Native Reanimated 👇 | Reactiive | 2536 / 2606 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/verification-code` | `demos__verification-code@1440.jpg`, `@390.jpg` | 200 | Verification Code Input with Reanimated | Reactiive | 2902 / 3084 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/fibonacci-shader-grid` | `demos__fibonacci-shader-grid@1440.jpg`, `@390.jpg` | 200 | Enhanced Fibonacci Sphere with React Native Skia 🌐 | Reactiive | 2551 / 2641 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/balance-slider` | `demos__balance-slider@1440.jpg`, `@390.jpg` | 200 | Balance Slider with Reanimated | Reactiive | 2651 / 2862 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/family-number-input` | `demos__family-number-input@1440.jpg`, `@390.jpg` | 200 | Family Number Input with Reanimated | Reactiive | 2146 / 2212 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/fibonacci-shader` | `demos__fibonacci-shader@1440.jpg`, `@390.jpg` | 200 | Fibonacci Sphere with React Native Skia 🌐 | Reactiive | 2488 / 2558 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/drag-to-sort` | `demos__drag-to-sort@1440.jpg`, `@390.jpg` | 200 | Drag to Sort with Reanimated and Gesture Handler 🤌🏽 | Reactiive | 2572 / 2642 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/fractal-glass` | `demos__fractal-glass@1440.jpg`, `@390.jpg` | 200 | Fractal Glass with React Native Skia 🎨 | Reactiive | 2230 / 2412 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/blurred-bottom-bar` | `demos__blurred-bottom-bar@1440.jpg`, `@390.jpg` | 200 | Blurred TabBar with Expo Blur 🎨 | Reactiive | 2138 / 2349 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/slide-to-reveal` | `demos__slide-to-reveal@1440.jpg`, `@390.jpg` | 200 | Slide to Reveal with React Native Skia 🪄 | Reactiive | 2503 / 2685 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/toast` | `demos__toast@1440.jpg`, `@390.jpg` | 200 | Toast Manager with Reanimated and Gesture Handler 🍞 | Reactiive | 2818 / 3028 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/action-tray` | `demos__action-tray@1440.jpg`, `@390.jpg` | 200 | Family Action Tray with Reanimated and Gesture Handler | Reactiive | 3023 / 3513 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/steddy-graph-interaction` | `demos__steddy-graph-interaction@1440.jpg`, `@390.jpg` | 200 | Steddy Graph Interaction with Skia and Reanimated | Reactiive | 2811 / 3041 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/airbnb-slider` | `demos__airbnb-slider@1440.jpg`, `@390.jpg` | 200 | Airbnb Slider with Reanimated and Gesture Handler | Reactiive | 2126 / 2364 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/blurred-scroll` | `demos__blurred-scroll@1440.jpg`, `@390.jpg` | 200 | Blurred Scroll with React Native Skia | Reactiive | 2335 / 2602 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/skia-color-picker` | `demos__skia-color-picker@1440.jpg`, `@390.jpg` | 200 | Color Picker with React Native Skia | Reactiive | 2496 / 2651 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/scrollable-bottom-sheet` | `demos__scrollable-bottom-sheet@1440.jpg`, `@390.jpg` | 200 | Scrollable Bottom Sheet with Reanimated and Gesture Handler | Reactiive | 2734 / 2936 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/loading-button` | `demos__loading-button@1440.jpg`, `@390.jpg` | 200 | Loading Button Animation with Reanimated, RN Skia and Moti 🫣 | Reactiive | 2580 / 2762 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/github-onboarding` | `demos__github-onboarding@1440.jpg`, `@390.jpg` | 200 | GitHub Onboarding with Reanimated | Reactiive | 2503 / 2658 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/fourier-visualizer` | `demos__fourier-visualizer@1440.jpg`, `@390.jpg` | 200 | Fourier Visualizer with React Native Skia | Reactiive | 2090 / 2300 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/telegram-theme-switch` | `demos__telegram-theme-switch@1440.jpg`, `@390.jpg` | 200 | Telegram Switch Theme with Skia and Reanimated 🌙 | Reactiive | 3112 / 3370 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/split-button` | `demos__split-button@1440.jpg`, `@390.jpg` | 200 | Split Button with Reanimated and Gesture Handler 🪀 | Reactiive | 2748 / 2902 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/circular-carousel` | `demos__circular-carousel@1440.jpg`, `@390.jpg` | 200 | Circular Carousel with React Native Reanimated 🪄 | Reactiive | 2377 / 2531 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/twitter-tab-bar` | `demos__twitter-tab-bar@1440.jpg`, `@390.jpg` | 200 | Twitter Tab Bar with React Navigation and Reanimated | Reactiive | 3007 / 3189 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/popup-handler` | `demos__popup-handler@1440.jpg`, `@390.jpg` | 200 | Popup Handler with Gesture Handler and Skia | Reactiive | 2475 / 2657 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/qr-code-generator` | `demos__qr-code-generator@1440.jpg`, `@390.jpg` | 200 | QR Code Generator with React Native Skia | Reactiive | 2580 / 2762 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/animated-count-text` | `demos__animated-count-text@1440.jpg`, `@390.jpg` | 200 | Animated Text Count with Reanimated | Reactiive | 2042 / 2300 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/selectable-grid-list` | `demos__selectable-grid-list@1440.jpg`, `@390.jpg` | 200 | Selectable Grid List with Reanimated and Gesture Handler | Reactiive | 2818 / 3000 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/image-cropper` | `demos__image-cropper@1440.jpg`, `@390.jpg` | 200 | Image Cropper with React Native Skia 🖼️ | Reactiive | 2545 / 2727 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/radar-chart` | `demos__radar-chart@1440.jpg`, `@390.jpg` | 200 | Radar Chart with React Native Skia | Reactiive | 2881 / 3064 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/animated-indicator-list` | `demos__animated-indicator-list@1440.jpg`, `@390.jpg` | 200 | Animated Section List with Reanimated 📜 | Reactiive | 2217 / 2531 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/fluid-slider` | `demos__fluid-slider@1440.jpg`, `@390.jpg` | 200 | Fluid Slider with React Native Skia 🌊 | Reactiive | 2223 / 2350 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/animated-3d-parallax` | `demos__animated-3d-parallax@1440.jpg`, `@390.jpg` | 200 | Animated 3D Parallax with Reanimated 🌌 | Reactiive | 2105 / 2419 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/color-carousel` | `demos__color-carousel@1440.jpg`, `@390.jpg` | 200 | Fancy Color Carousel with Reanimated and Skia 🌈 | Reactiive | 2594 / 2832 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/audio-player` | `demos__audio-player@1440.jpg`, `@390.jpg` | 200 | Waveform Scrubber with React Native Reanimated 🎵 | Reactiive | 2084 / 2378 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/floating-modal` | `demos__floating-modal@1440.jpg`, `@390.jpg` | 200 | React Native Floating Modal Animation 📦 | Reactiive | 2034 / 2188 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/skia-bottom-sheet` | `demos__skia-bottom-sheet@1440.jpg`, `@390.jpg` | 200 | React Native Skia Bottom Sheet Animation 📜 | Reactiive | 2748 / 2902 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/smooth-dropdown` | `demos__smooth-dropdown@1440.jpg`, `@390.jpg` | 200 | Smooth Dropdown Animation with Reanimated 👇 | Reactiive | 2706 / 2888 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/blur-circles` | `demos__blur-circles@1440.jpg`, `@390.jpg` | 200 | Glassmorphism and Simplex Noise with React Native Skia | Reactiive | 2377 / 2587 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/dynamic-tab-indicator` | `demos__dynamic-tab-indicator@1440.jpg`, `@390.jpg` | 200 | Dynamic Tab Indicator with Reanimated 📊 | Reactiive | 2306 / 2396 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/story-list` | `demos__story-list@1440.jpg`, `@390.jpg` | 200 | Story List UI App in React Native 📚 | Reactiive | 2916 / 3099 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/shared-transitions` | `demos__shared-transitions@1440.jpg`, `@390.jpg` | 200 | Shared Element Transitions with Reanimated 🔄 | Reactiive | 2587 / 2769 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/metaball` | `demos__metaball@1440.jpg`, `@390.jpg` | 200 | React Native Metaball Animation 🌐 | Reactiive | 2503 / 2630 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/cuberto-slider` | `demos__cuberto-slider@1440.jpg`, `@390.jpg` | 200 | Balloons Slider Animation with React Native 🎈 | Reactiive | 2349 / 2643 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/bottom-bar-skia` | `demos__bottom-bar-skia@1440.jpg`, `@390.jpg` | 200 | Fancy Bottom Bar with React Native Skia 🎨 | Reactiive | 2447 / 2713 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/add-to-cart` | `demos__add-to-cart@1440.jpg`, `@390.jpg` | 200 | Add to Cart Animation with Reanimated and Gesture Handler | Reactiive | 2287 / 2665 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/theme-canvas-animation` | `demos__theme-canvas-animation@1440.jpg`, `@390.jpg` | 200 | React Native Theme Canvas Animation 🎨 | Reactiive | 2818 / 3048 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/animated-clip-box` | `demos__animated-clip-box@1440.jpg`, `@390.jpg` | 200 | React Native Animated Clip Box Animation 📦 | Reactiive | 2349 / 2587 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/floating-bottom-bar` | `demos__floating-bottom-bar@1440.jpg`, `@390.jpg` | 200 | React Native Floating Bottom Bar Animation 🚀 | Reactiive | 2055 / 2097 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/animated-grid-list` | `demos__animated-grid-list@1440.jpg`, `@390.jpg` | 200 | Grid List Layout Animation with Reanimated | Reactiive | 2210 / 2448 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/scroll-progress` | `demos__scroll-progress@1440.jpg`, `@390.jpg` | 200 | React Native Scroll Progress Animation 📜 | Reactiive | 2755 / 2937 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/spiral` | `demos__spiral@1440.jpg`, `@390.jpg` | 200 | React Native Spiral Animation 🌀 | Reactiive | 2727 / 2882 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/swipe-cards` | `demos__swipe-cards@1440.jpg`, `@390.jpg` | 200 | React Native Swipe Cards Animation (Tinder-like) 👀 | Reactiive | 3021 / 3203 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |
| `/demos/mobile-input` | `demos__mobile-input@1440.jpg`, `@390.jpg` | 200 | React Native Lock Screen Smile Animation 🙂🙃 | Reactiive | 2433 / 2615 | 18 / 1 / 1 / 0 / 0 / 1 | 1 |

`.tall` captures: `articles`, `course`, and the six `series__*` at both widths (`metrics.tall.json`).
Page heights capped at 16,000 px are marked; the capture is the top 16,000 px.
