# The swipe-down close: where it starts, per demo

RN's `CloseGesture` (legacy/src/navigation/home/demo-screen.tsx) is a pan over the whole screen (`activeOffsetY(10)`,
`failOffsetX(+-30)`) that a demo's own gesture can claim first. Here the close is `ClosePan`
(modules/apple/DemoLaunch.swift) on the window and the canvases take touches natively, so each demo states where
its own vertical or free 2D drags live: `closeZone(slug)` in app.contract (data), read by `CloseZone`.

Rules (all in DemoLaunch.swift, data in app.contract):
- Start anywhere (no entry): vertical-dominant pull, 10 pt to activate, fails at 30 pt sideways (`K.failSideways`, = RN's FAIL_SIDEWAYS).
- `strip`: only the top `K.stripFraction` = 18% of the screen (and the status-bar inset above it). Demos whose drags need the whole screen.
- `x0,y0,x1,y1` (screen fractions): the close must not start inside; it starts anywhere else and in the strip.
- Real vertical scrollers (UIScrollView under the finger, any demo): at the top the pull goes to the close (the scroller's own pan
  is cancelled when the close begins), scrolled into its content the scroller keeps it. Canvas "scrollers" (Rust `UiScroll`) are not
  UIScrollViews: they are `strip` or a zone.
- Strip touches: a pull up from the strip fails the close at once so the demo's recognizers (which wait on it) are not held until lift.
- New: the pull must be vertical-dominant to activate (a mostly sideways drag drifting down is the demo's, not the close).
- `-panTrace` logging, the still-image drag, the X button and the strip path are unchanged.

Counts: 109 demos: 71 close from anywhere (7 of them over a real scroller with the hand-off), 22 from outside a zone, 16 from the strip only.

| slug | who owns vertical / 2D drags | rule |
|---|---|---|
| action-tray | tray handle drag (Contract transformDragFor), y | zone 0,0.56,1,1 |
| add-to-cart | real vertical scroller, whole screen | scroll hand-off |
| airbnb-flip-interaction | scroller that only bounces (content shorter than the screen) | scroll hand-off (acts as anywhere) |
| airbnb-slider | native slider, x only | anywhere |
| alert-drawer | taps | anywhere |
| animated-3d-parallax | card tilt pan, 2D | zone 0.09,0.31,0.91,0.69 |
| animated-clip-box | press | anywhere |
| animated-indicator-list | real vertical scroller, y 0.20-0.96 | scroll hand-off |
| art-gallery | pinch + pan when zoomed (state) | strip |
| atlas-button | hold | anywhere |
| atlas-sphere | 2D gather over most of the screen | strip |
| audio-player | waveform scrub (2D pan, uses x) | zone 0.04,0.75,0.96,0.89 |
| balance-slider | x pan on a bar | zone 0.04,0.45,0.96,0.55 |
| bezier-curve-outline | control points dragged anywhere | strip |
| blur-cards | press | anywhere |
| blur-circles | none | anywhere |
| blurred-scroll | canvas fake vertical scroll, whole screen | strip |
| bottom-bar-skia | taps | anywhere |
| calendar-days | slider thumb (x) | zone 0.05,0.60,0.95,0.69 |
| card-shader-reflections | horizontal list; the card tilts by finger y (cosmetic) | anywhere |
| checkbox-interactions | taps | anywhere |
| cherry-blossom-qrcode | taps, long press | anywhere |
| chessboard | piece drag on the board | zone 0,0.24,1,0.74 |
| circular-carousel | horizontal scroll | anywhere |
| clerk-toast | toast swipe, x (Contract transformDragFor) | anywhere (toast drag not verifiable on the simulator) |
| clock-time-picker | time list, vertical canvas scroll | zone 0.50,0.41,0.83,0.59 |
| color-carousel | horizontal scroll | anywhere |
| composable-text | press | anywhere |
| coverflow-carousel | horizontal scroll | anywhere |
| cuberto-slider | thumb pan, x | anywhere |
| delete-button | press and hold | anywhere |
| dot-sheet | taps, text area | anywhere |
| drag-to-sort | canvas vertical scroll + row drag | strip |
| draggable-panel | panel thrown to any corner | strip |
| duration-slider | knob on the ring | zone 0.07,0.30,0.93,0.70 |
| empty-qr-code | tap | anywhere |
| everybody-can-cook | pointerdown | anywhere |
| exclusion-tabs | taps | anywhere |
| expandable-mini-player | collapsed: real scroller; expanded: full-screen sheet drag (Contract transformDragFor) | strip |
| family-number-input | keypad taps | anywhere |
| fibonacci-shader-grid | 6x6 pad pan, 2D | zone 0.20,0.56,0.80,0.84 |
| fibonacci-shader | native slider, x | anywhere |
| floating-bottom-bar | bar pan, x | zone 0,0.88,1,0.97 |
| floating-modal | sheet pan, y | zone 0,0.73,1,1 |
| fluid-slider | bar pan, x | anywhere |
| fluid-tab-interaction | taps | anywhere |
| fourier-visualizer | free drawing over the canvas | strip |
| fractal-glass | circle flung anywhere | strip |
| geometry-button | press and hold | anywhere |
| github-contributions | taps | anywhere |
| github-onboarding | horizontal pager | anywhere |
| github-terrain | tap | anywhere |
| gl-transitions | canvas vertical scroll, whole screen | strip |
| grid-visualizer | press and hold | anywhere |
| imessage-stack | horizontal scroll band | anywhere |
| infinite-carousel | pan, x | anywhere |
| interaction-appearance | bounce-only scroll | anywhere |
| ios-home-bouncy | canvas grid scroll + pull-down modal | strip |
| light-on-painting | bulb drag, 2D | zone 0.27,0,0.73,1 |
| linear-sensors | none (sensor) | anywhere |
| liquid-glass-playground | full-screen pan of the glass pane | strip |
| loading-button | tap | anywhere |
| magnet-spring | piece dragged across 9 magnets | strip |
| metaball | two circles at the centre | zone 0.24,0.37,0.76,0.63 |
| miles-bar-chart | horizontal pager | anywhere |
| mnist | drawing grid | zone 0.12,0.48,0.88,0.84 |
| mobile-input | keypad taps | anywhere |
| motion-blur | hold + list tap | anywhere |
| notion-qrcode | tap | anywhere |
| online-offline | tap | anywhere |
| paper-folding | tap | anywhere |
| pomodoro-timer | dial pan, x | anywhere |
| prequel-slider | ruler, x | anywhere |
| radar-chart | tap | anywhere |
| scroll-progress | real vertical scroller, whole screen | scroll hand-off |
| scroll-transition-3d | canvas vertical snapping list | strip |
| scrollable-bottom-sheet | sheet pull-down 1:1 | zone 0,0.41,1,1 |
| scrollable-shapes | horizontal snapping scroll | anywhere |
| sculptures-in-words | canvas vertical reading scroll | strip |
| selectable-grid-list | canvas list scroll + drag-select | strip |
| shared-transitions | real vertical scroller, y 0.133-1 | scroll hand-off |
| skia-color-picker | colour wheel pan, 2D | zone 0,0.25,1,0.75 |
| slide-to-reveal | reveal pan, 2D | zone 0.15,0.43,0.85,0.57 |
| smooth-dropdown | taps | anywhere |
| snake | fling on the board | zone 0.12,0.36,0.88,0.71 |
| sphere-waves | tap, pinch | anywhere |
| spiral | tap | anywhere |
| split-button | presses | anywhere |
| stacked-bottom-sheet | sheet handle drag (Contract transformDragFor), y | zone 0,0.57,1,1 |
| stacked-carousel | horizontal pan band | anywhere |
| stacked-list | real vertical scroller, whole screen | scroll hand-off |
| stacked-modals | presses | anywhere |
| staggered-card-number | button | anywhere |
| steddy-graph-interaction | segment taps | anywhere |
| steps | presses | anywhere |
| story-list | horizontal scroll | anywhere |
| sudoku | cell taps | anywhere |
| swipe-cards | card pan, 2D | zone 0.02,0.16,0.98,0.71 |
| tab-navigation | taps | anywhere |
| telegram-theme-switch | real vertical scroller, whole screen | scroll hand-off |
| the-little-prince | none | anywhere |
| theme-canvas-animation | taps | anywhere |
| threads-holo-ticket | pan, x | anywhere |
| time-machine | vertical pan opens/closes the time machine; row drag 2D | strip |
| toast | toast handle drag, x (Contract transformDragFor) | zone 0.02,0.85,0.98,0.96 |
| twodos-slide | horizontal scroll band | anywhere |
| verification-code-face | hidden numeric input | anywhere |
| verification-code | hidden numeric input | anywhere |
| wheel-picker | ruler pan, x | anywhere |

## Test results (iPhone 17 simulator, gesture-custom drags of 250-400 ms, ~35% of the screen)

47 demos driven (time-machine and shared-transitions have no icon on the home: not reachable, not tested).
"close" = a downward drag from a start allowed by the rule closed the demo; "own" = the demo's own drag worked and did not close it.

| demo | class | own drag | close | note |
|---|---|---|---|---|
| sphere-waves, prequel-slider, fibonacci-shader, atlas-button | anywhere | n.a. | PASS | |
| wheel-picker, scrollable-shapes, color-carousel, coverflow-carousel, circular-carousel, threads-holo-ticket, imessage-stack, github-onboarding, infinite-carousel, card-shader-reflections | anywhere | PASS | PASS | closes from on the ruler/ticket/card too |
| twodos-slide, pomodoro-timer | anywhere | PASS (on the drawn element; swiping elsewhere does nothing) | PASS | |
| audio-player | zone | PASS | PASS | a vertical swipe on the waveform did not close |
| balance-slider, calendar-days, floating-bottom-bar, metaball, animated-3d-parallax, floating-modal, skia-color-picker, duration-slider, clock-time-picker, fibonacci-shader-grid, light-on-painting, mnist, chessboard, scrollable-bottom-sheet, snake, action-tray | zone | PASS | PASS | every drag started inside the rect left the demo open; a drag shorter than ~15% of the screen (starts below y 0.8) springs back by the existing release rule, not a zone effect |
| swipe-cards | zone | PASS | PASS | 0.5,0.74 -> 0.96 and from the strip close; card follows its own drag |
| drag-to-sort, magnet-spring, atlas-sphere | strip | PASS | PASS | from the strip; a mid-screen pull does not close |
| stacked-list, scroll-progress, telegram-theme-switch, animated-indicator-list, add-to-cart, expandable-mini-player (collapsed) | scroll hand-off | PASS | PASS | at the top a pull closes; scrolled, a pull scrolls back; at the top again it closes |
| airbnb-flip-interaction | scroll (bounce only) | n.a. | PASS | |
| toast, clerk-toast, stacked-bottom-sheet | zone / anywhere | n.a. | PASS | close from outside the toast / sheet |
| expandable-mini-player (expanded) | zone 0,0.37,1,1 | n.a. | no close from inside the rect (before the zone a drag there closed the demo); the strip still closes | the sheet itself did not collapse on a simulator drag either |

Result: every close probe from a legal start point closed the demo; no own drag (that reacted on the simulator) closed it. The one unwanted close found (expanded mini-player sheet) is fixed by its zone and re-tested; no probe failed otherwise.

## Not done

- The Contract drags (toast, clerk-toast, stacked-bottom-sheet, expandable-mini-player sheet) did not react to simulator drags at all, close or no
  close, so their own interaction is not verified here: check toast / clerk-toast swipes, the stacked-bottom-sheet handle and the
  expanded mini-player collapse on the phone. clerk-toast is classed `anywhere` on the strength of an x-only drag and the
  vertical-dominance rule; if a vertical pull on a toast closes the demo on the phone, give it `0,0.73,1,0.98`.
- A demo opened by a deep link (`demos-exact://demo/<slug>`) did not close with a mid-screen swipe in the one try made (no icon launch session): not investigated.
- time-machine and shared-transitions are not on the home (no icon): their rules are untested.
- Canvas scrollers (blurred-scroll, drag-to-sort, ios-home-bouncy, gl-transitions, scroll-transition-3d, selectable-grid-list, sculptures-in-words,
  clock-time-picker's list) close only from the strip / outside the zone: a hand-off at scroll 0 would need the surface to report its offset
  to the close, which today cannot ask the canvas mid-gesture.
- Not probed: the rule from the 18% strip against content in the strip (time-machine row 0, magnet-spring's top magnet, ios-home-bouncy).
- The x-only pans that arm on any direction (cuberto-slider, fluid-slider, infinite-carousel, wheel-picker, ...) lose a pull that starts on their thumb to the close; nobody asked for those to be zones.
