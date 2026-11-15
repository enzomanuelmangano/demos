# pressto

The app's one press system: a port of [pressto](https://github.com/enzomanuelmangano/pressto)
0.7.0 as it is designed (RN 0.7.0 on RNGH 3.3 shows no feedback: it passes `onBegan`/`onEnded`
to the v3 BaseButton, which reads `onBegin`/`onFinalize`; that bug is not copied).

- `pressto.contract`: the Contract components (pressto's API) and the functions under them.
- `src/lib.rs` (crate `pressto`): the same machine for GPU surfaces.

## The API

```contract
use PressableScale from "pressto"

component Steps
  action next
    step = step + 1
  view
    // The pressable's place (RN: the layout half of its `style`).
    view flex=1 height=60
      PressableScale(press=next)
        // Its look (the rest of its `style`) and content.
        row flex-grow=1 border-radius=30 background-color="#0c86f7" align-items="center" justify-content="center"
          text "Continue" color="white"
```

| pressto (RN) | Here |
|---|---|
| `<PressableScale onPress={f}>` | `PressableScale(press=f)` around the children |
| `<PressableOpacity onPress={f}>` | `PressableOpacity(press=f)` |
| `<PressableWithoutFeedback onPress={f}>` | `PressableWithoutFeedback(press=f)` |
| `createAnimatedPressable(p => ({ transform: [{ scale }], opacity, backgroundColor, borderRadius }))` | `AnimatedPressable(press=f, rest=PressLook(…), pressed=PressLook(…))`: each value at progress 0 and 1 |
| a pressable with `layout={…}` | `PressableScaleLayout(press=f, layout=…)`, `PressableOpacityLayout(…)`: the box's `-exact-layout-transition` |
| `<PressablesConfig globalHandlers={{ onPress }}>` at the root | the root's `provide pressto = defaultPressablesConfig()` and `pressablesOnPress` (app.contract). A slot's fill keeps its caller's providers, so a wrapping component cannot provide to it. |

Each component owns its press (as each RN pressable owns its `active`), calls the global
`pressablesOnPress()` and then `press` on a lift inside, and wraps the slot in one box: `view
role="button"`, a flex column that grows and stretches to fill the box its caller gives it. So
write the pressable's place (position, size, flex, margins) on a `view` around the component
when the parent alone would not give the box that frame, and its look on the node in the slot.
The scale turns about the box's centre, as RN's does about the BaseButton's. The innermost
pressable takes a touch (`stopPropagation()` on its down): a pressable around another does not
press in, as UIKit hands the touch to the deepest UIControl.

## Semantics (both halves), from the source

| pressto + RNGH 3.3 | Here |
|---|---|
| `active` on at touch-down inside the button (v3 BaseButton `onBegin`, `pointerInside`; RNGestureHandlerButton `beginTrackingWithTouch`) | `pointerdown` / `Pressable::pointer_down` |
| sliding off keeps it (`shouldCancelWhenOutside: false`; DragExit only reports `pointerInside: NO`) | nothing happens on a move |
| off at the lift, or when the touch is cancelled (a scroll takes it: `onFinalize` with `canceled`) | `pointerup` (a cancel is an up) / `pointer_up`, `cancel` |
| `onPress` only for a lift inside the button's bounds, through its transform (`endTrackingWithTouch`, `CGRectContainsPoint(bounds)`) | the host's `press` / `pointer_up(.., inside)` |
| the global `onPress` (the app's `Haptics.selectionAsync()`), then the pressable's, at that lift | `pressablesOnPress()` then `press`; surfaces post `"haptic:selection"` |
| `progress = withTiming(active ? 1 : 0, 250 ms, bezier(0.25, 0.1, 0.25, 1))`, each retarget a full run from where it is | `transition=… 250ms cubic-bezier(0.25, 0.1, 0.25, 1)` (CSS `ease`) with the parity nudge |
| `animationType="spring"` (`{ mass 1, damping 30, stiffness 200 }`) | `springPressablesConfig()` / `Animation::spring()` |
| `PressableScale`: scale 1 → `minScale` 0.96; `PressableOpacity`: opacity 1 → `activeOpacity` 0.5 | `pressableScale`, `pressableOpacity` |

Why not `:active`: the iOS host eases its press over a fixed 120 ms on
`cubic-bezier(.16, 1, .3, 1)` (exact2 `host/apple/Sources/ExactKit/PressFeedback.swift`); no
transition or property changes it. A node with a `pointerdown`/`pointerup` handler gets no host
dim either (`platformPressDims`), so nothing else animates the press.

Why the millionth (`pressNudge`): a transition retargeted to the value it started from is CSS's
reversing case (exact2 `motion/src/engine.rs`) and runs for a share of 250 ms; Reanimated always
runs the full 250 ms from where it is. Every other press aims 1e-6 off, so no retarget is a
reversal. Colours are not nudged (a quick tap's colour release is CSS-shortened). With one press
state per component, a pressable that was never pressed rests at exactly 1 (one shared state per
demo used to leave every pressable of the demo at 0.999999 after an odd press).
