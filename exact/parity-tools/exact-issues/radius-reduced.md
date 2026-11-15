# A layout transition's resize draws the wrong corner when the radius is larger than half the box

exact2 730abad1, Apple host (iOS and macOS share the file).

## Where

`host/apple/Sources/ExactKit/Surface.swift`, `paintSurface(_:_:)`:

- line 116: `let sizes = BorderPaint.radii(style, in: box)`: the AUTHORED radii, not CSS-reduced.
- line 127: `… && radius <= min(box.width, box.height) / 2` gates the Core Animation path (`said`).

While a `-exact-layout-transition` resizes a box, `applySurface()` paints the box on a
`SurfaceLayer` at laid-out size + `layoutResize`. With an authored radius larger than half the
box (a pill written `border-radius=999`, or 50 on a 50 pt button), `said` is false, so every
frame of the transition draws on the CPU with `roundedPath` (the reduced radii and, for
`corner-shape="-exact-continuous"`, the kernel's `CornerShape.outline`). At rest,
`applyBoxLayer` uses the reduced radii (`cornerRadii(in:)`), passes its own check, and Core
Animation draws the corner (`cornerCurve = .continuous`). So:

1. The corner changes shape as soon as the box starts resizing and snaps back when it settles. The
   kernel's continuous outline is not Core Animation's continuous curve, and the difference is
   easy to see on a pill.
2. Every frame of the spring re-rasterises the box on the main thread
   (`needsDisplayOnBoundsChange`), where the CA path costs nothing.

Phone reports: online-offline, composable-text, alert-drawer, steps ("the classic border radius
problem").

## Minimal repro

```
component Repro
  state wide = false
  action toggle
    wide = not wide
  view
    column position="absolute" inset=0 align-items="center" justify-content="center"
      button appearance="none" press=toggle
        view width=(wide ? 300 : 120) height=44 border-radius=999
          corner-shape="-exact-continuous" background-color="#EAEAEA"
          -exact-layout-transition="-exact-spring(120, 20, 1)"
```

Tap it on iOS: during the spring the ends are visibly rounder or flatter than at rest. With
`border-radius=22` the shape stays the same throughout.

## Fix (one line)

```swift
let sizes = BorderPaint.reduced(BorderPaint.radii(style, in: box), in: box)
```

`radius` then becomes the reduced one, `said` holds for any pill, and the surface layer gets
the same `cornerRadius`/`cornerCurve` that the box gets at rest.

## Workaround in the demos (current fix)

Author the radius RN actually draws, at most half the box's shortest side at every frame of the
transition (usually h/2). This is RN-equal, because Core Animation clamps RN's radius to
min(w, h) / 2 anyway. Applied to online-offline (22), composable-text (30.333),
alert-drawer (25 ×2), steps' bar (15), checkbox-interactions (24) and scroll-progress
(35 / 29.5 / 2.5).

Not filed upstream yet (the owner decides).
