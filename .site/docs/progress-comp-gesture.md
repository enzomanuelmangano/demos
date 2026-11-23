# Progress: interactive article demos, gesture/UI group

Branch `site-comp-gesture` (worktree `thank-you-site-comp-gesture`), draft PR #120 into `site`.

## Done

The demos of all seven articles are ported to Contract under `components/interactive/<article>/index.contract`. Each
file's header names its exports and their props. The gallery is `/_dev/interactive-ui`: noindex, unlinked, listed in
`tools/seo/metadata.ts` so postbuild knows it, and left out of `sitemap.xml`.

| Article | Exports (props) | Check against live |
|---|---|---|
| bottom-sheet-animation | InteractiveBox (slot), InitialSetup, BasicComponent, PanGesture, BorderRadius, FinalDemo(hasBackdrop: bool) | Element geometry: 0 px apart at 1440 and 390. Drag, mid-spring grab and touch tested. |
| checkbox-interactions | Demo, StaticDemo | Every text placed as live. The check glyph comes from the reference's font. Chip moves are close to framer's (see below). |
| css-animations-react-native | InteractiveBox (slot), AnimatedSquare(withoutRepeat: bool, withoutPause: bool) | 0.03 % px. |
| introduction-to-gestures | IntroToGesturesDemo | 0.00 % px. The follower chain matches live within about 10 ms and 1 px (sampled). |
| introduction-to-reanimated | FinalAnimatedSquareDemo, AnimatedSquareOpacityDemo, AnimatedSquareOpacityAndScaleDemo(scaleAnimationType: string, showBorderRadiusAnimation: bool) | 0.00 to 0.17 % px. Spring curves match live sample for sample (live starts about 100 ms later after a click). |
| pan-gesture-handler | InteractivePanGesture | Element geometry 0 px. |
| skeleton-loader | InteractiveSkeletonDemo, InteractiveContactItem, InteractiveJustSkeleton | Every text placed as live. Shimmer and Play load as live. |

How the demos are built (the constraints that shaped them):

- **No timers, no per-frame actions.** Every page sits under the router's `for e in stack(nav)`, so a component with a
  `task` is refused (`type-child-resource`). All motion is therefore Exact transitions and springs, or CSS keyframes.
- **Gestures.** Drags use `pan` and `panrelease`, with `touch-action: none` on the dragged node. The release springs
  use `-exact-spring(k, c, m)` with `-exact-translate-velocity="0 0"`, because the reference's `spring()` always
  starts from rest.
  - The bottom sheet can appear several times on one page, and `frame(id)` always answers the first instance. So a
    drag that starts mid-spring reads the sheet's drawn position from the press itself: `clientY - offsetY` on the
    sheet and on the stage.
  - pan-gesture-handler and introduction-to-gestures use `frame()` with page-unique ids (`pg-*`, `ig-*`). They assume
    one instance per page, which is how their articles use them.
- **Springs baked as keyframes.** Where a spring must restart from its first value on each Play,
  `gesture-kit/.tools/bake.ts` bakes the reference's own 60 Hz integrator into keyframes. Contract allows at most 32
  stops, so each segment between stops is a cubic Hermite written as a per-stop `cubic-bezier`; the worst error is
  0.006 of the value. Rerun the baker after changing a spring: `bun components/interactive/gesture-kit/.tools/bake.ts`.
- **Animated corner radius.** `border-radius` does not animate, and any `animation` on an SVG node breaks the
  build-time render (Exact's `motion.rs` reads `document.createElement('div').style.animationName`; noted with
  `feedback note`). `gesture-kit`'s `MorphSquare` builds the rounded square from four quarter-turns of a half-bar and
  a disc, all moved by the compositor. The bottom sheet's radius is an SVG rect's `rx` on a *transition*, which
  works, following the same spring as the sheet's translate.
- **Pausing off screen.** Endless loops (the skeleton shimmer, the CSS square) are paused off screen through
  `intersect`. Pages render at build and activate at idle.

## Deliberate differences from live (live is broken there)

- **Bottom sheet.** Live integrates with semi-implicit Euler at `dt = 1/60`, which diverges for damping 50 and mass
  0.3. On a 60 Hz screen the live sheet leaves the stage on the first tap (sampled: translateY ±3.4e7). The port uses
  the spring the reference asks for, which is what live shows on a 120 Hz screen.

## Open

1. The checkbox chips. A chip's layout transition (`-exact-spring(500, 30, 1)`) resizes its surface while its
   children jump into place. framer animates the width (spring 400/30) and the margin. In samples, the neighbour
   chips arrive about 30 ms earlier than live.
2. A touch pan starts about 7 px late (Exact's slop). The reference counts from pointerdown.
3. Bundle cost. The demos' plan adds about 30 KB raw to the site's single `app.js`, which every page loads (Exact does
   not split the view plan per route). Measured: 295 KB without the gallery, 325 KB with it.
4. The content converter (`site-content`) must pass every prop: Contract props have no defaults. For example, the
   MDX's `<FinalDemo />` is `FinalDemo(hasBackdrop=true)` and `<AnimatedSquare />` is
   `AnimatedSquare(withoutRepeat=false, withoutPause=false)`.
