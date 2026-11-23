# Interactive canvas demos: progress (branch `site-comp-canvas`, draft PR #119 into `site`)

Scope: the canvas/visual article demos of animated-gradient, animated-loader-skia, animated-spiral and metaball
(17 exports + CanvasKitJsAlert). The gesture demos are `site-comp-gesture`'s; the MathJax of animated-spiral
(InlineMath / BlockMath) is the content converter's.

## How to embed (for the content converter)

Each article folder has a dispatcher: `AnimatedGradientInteractive(name)`, `AnimatedLoaderSkiaInteractive(name)`,
`AnimatedSpiralInteractive(name)`, `MetaballInteractive(name)` in
`components/interactive/<article>/<article>.contract`; `name` is the MDX tag (the block's `title`). Each export is
also a prop-less component of the same name. They declare no resource and no task, so they may sit under a `for`
(`/_dev/interactive` renders them exactly so). The box is as wide as its parent, 16:9 (square for
WithColorMatrixMetaballWithSkia, and for WithProgressLoaderWithSkia in a portrait window), 16 px margin below.
Verified wired into `components/markdown.contract` (locally, not committed: that file is the content branch's):

```contract
use AnimatedGradientInteractive from "./interactive/animated-gradient/animated-gradient.contract"
use AnimatedLoaderSkiaInteractive from "./interactive/animated-loader-skia/animated-loader-skia.contract"
use AnimatedSpiralInteractive from "./interactive/animated-spiral/animated-spiral.contract"
use MetaballInteractive from "./interactive/metaball/metaball.contract"
…
    else if block.kind == "interactive" and block.lang == "animated-gradient"
      AnimatedGradientInteractive(name=block.title)
    else if block.kind == "interactive" and block.lang == "animated-loader-skia"
      AnimatedLoaderSkiaInteractive(name=block.title)
    else if block.kind == "interactive" and block.lang == "animated-spiral"
      AnimatedSpiralInteractive(name=block.title)
    else if block.kind == "interactive" and block.lang == "metaball"
      MetaballInteractive(name=block.title)
```

With it, every demo box on the four article pages (1440) differs from live's by ≤ 0.09 % of pixels (> 32/255),
16 of 16 boxes at live's size and place count, and no canvas mounts until scrolled near (spiral's first, near the
top, does).

**No ancestor between the demo and the page's scroller may clip (`overflow` hidden/auto/scroll)**: the lazy mount
and the off-screen pause use an IntersectionObserver whose root is the nearest clipping ancestor.

## Design

- Canvas 2D surfaces drawn by the data module (`_canvas/surfaces.ts`, merged into `app.ts`'s `surfaces`/`draw`):
  `gradient`, `loader`, `articleSpiral`, `metaball`. Per-canvas memory keyed by demo key + mount time.
- Skia's `BlurMask` halo (the reference used `ctx.filter = 'blur(5px)'`, which Exact's recorder does not take): the
  shape is drawn 10,000 px off the canvas with a shadow cast back (shadows are in bitmap px, as filter lengths are),
  in angular pieces each shadowed in the sweep's colour (`_canvas/util.ts` `halo`). Loader: 8° pieces, added
  ('lighter'); spiral: 48 pieces laid over (dots overlap).
- Metaball: CSS `blur()` + SVG `feColorMatrix` on the canvas box, as the reference. The basic demo's sonner toast is a
  `popover="manual"` (top layer, position fixed) with `role="alertdialog"` (Exact's popover CSS anchors every other
  role to an invoker); its life is one 3.4 s keyframes animation, pixel-equal to live's at 1440 and 390. Restart
  eases the three sliders' values every frame over 300 ms: no task may live under the page's `for`, so the clock is a
  hidden box whose `height` transitions 0 ↔ 300 px (linear) and whose `resize` event (once a frame) gives the time.
- Lazy: the canvas (and the canvas2d chunk) mounts when the box is within 300 px of the viewport; animations draw
  only while it is; the loaders' fade-in box is on the page from load, as live's.
- Randomness (Play) is a stream seeded from the frame's time at the press (data modules may not call Math.random).

## Status (tools in /tmp/cc during the session: live-shot, local-shot, compare, interact, fps, touch, pause)

Box screenshots vs live, share of pixels differing > 32/255 (and > 8/255):

| demo | 1440 DPR 1 | notes |
|---|---|---|
| gradient ×3 | 0 % (0 %) | |
| spiral white | 0 % (0 %) | |
| spiral gradient ×2, animated spiral | 0-0.07 % (0-0.09 %) | halo pieces centred on the axes (a spoke split over two pieces glowed twice) |
| loaders ×4 | 0.09-0.30 % (0.18-0.62 %) | live snaps the 158 px canvas at y = 123.5 down, ours up: a 1 px ring offset |
| metaball ×4 | 0-0.02 % | toast 0.08 % |

DPR 2: same halo width as live (sigma in bitmap px). 390: differences are the capture's half-pixel box positions
(box border and buttons offset too), not content. Frames: spiral animation, loader spin (after the 8° pieces;
2° pieces dropped 30 of 53 frames), metaball touch drag: 0 frames over 20 ms. Touch drag does not scroll the page.

## Motion, frame by frame (CDP screencast, live vs local, 1440, /tmp/cc/cast.ts)

Each group recorded a few seconds around one scripted interaction, every composited frame (60 Hz). Progress = mean
|frame − first| / |last − first| of the demo's box; "direct" = share of pixels > 32/255 between frames at the same
time since the motion's start.

| group (demo, interaction) | frames live / local | progress curve | direct |
|---|---|---|---|
| loader (WithAnimation, Play, 2.5 s) | 151 / 150 | within 0.03 at every mark (0-2 s) | median 0.27 %, max 0.56 % |
| metaball (WithPan, 15-step drag + release, 2.5 s) | 141 / 140 | drag one frame behind live (pointer → runner → draw), spring-back same curve | median 0.18 %, max 8.6 % (during the drag) |
| gradient (AnimatedGradient, Play) | 20 / 20 | 250 ms ease, within 0.06 (one-frame phase) | n/a: random colours |
| spiral (FixedRadiusGradient, Play) | 93 / 93 | 1.5 s easeInOutQuad, same shape, ±1 frame | n/a: random angle |

Restart on the colour-matrix demo: labels, matrix and blur logged every frame for 330 ms after the press, live and
local: the same values at the same times (e.g. 128 ms: blur 11, alpha 85, pos 61 on both; ends at 323-329 ms).

## Open

1. The loaders' 1 px snap in the gallery (not on the article pages).
2. Metaball drag lags live by one frame (Exact's pointer → state → draw round trip).
3. Bundle: the four articles' components + the gallery add ~49 KB raw / ~15 KB gzip to the shared `app-*.js` (Exact
   has no per-route code split); the draw code ~2.7 KB gzip.
