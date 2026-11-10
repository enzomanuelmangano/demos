# pressto

The app's one press system: a port of [pressto](https://github.com/enzomanuelmangano/pressto)
0.7.0 as it is designed (RN 0.7.0 on RNGH 3.3 shows no feedback: it passes `onBegan`/`onEnded`
to the v3 BaseButton, which reads `onBegin`/`onFinalize`; that bug is not copied).

- `pressto.contract`: Contract pressables (functions over a per-component `Press` state).
- `src/lib.rs` (crate `pressto`): the same machine for GPU surfaces.

## Semantics (both halves)

| pressto | Here |
|---|---|
| `active` on at touch-down (BaseButton onBegin) | `pointerdown=pressIn(key)` / `Pressable::pointer_down` |
| off at lift or cancel (onFinalize); sliding off keeps it (shouldCancelWhenOutside false) | `pointerup=pressOut` (an up wherever the finger lifts; a cancel is an up) |
| `onPress` only for a lift inside | the node's `press` (the host's) / `pointer_up(.., inside)` |
| progress `withTiming(250 ms, bezier(0.25, 0.1, 0.25, 1))`, from the current value | `transition=pressTransition(prop, pressto)` (`250ms cubic-bezier(0.25, 0.1, 0.25, 1)`, CSS `ease`) |
| `animationType="spring"` (`{ mass 1, damping 30, stiffness 200 }`) | `springPressablesConfig()` / `Animation::spring()` |
| `PressableScale`: scale 1 → `minScale` 0.96 | `pressableScale(pressing, key, pressto)` |
| `PressableOpacity`: opacity 1 → `activeOpacity` 0.5 | `pressableOpacity(pressing, key, pressto)` |
| `createAnimatedPressable(progress => …)` | `animatedPressable(pressing, key, rest, pressed)`, `animatedPressableColor(…)` |
| `PressablesConfig` (config, animation, `globalHandlers.onPress`) | the root (`app.contract` `Demos`) provides `pressto` and `pressablesOnPress` (the selection haptic); surfaces post `"haptic:selection"` |

Why not `:active`: the iOS host eases its press over a fixed 120 ms on
`cubic-bezier(.16, 1, .3, 1)` (exact2 `host/apple/Sources/ExactKit/PressFeedback.swift`); no
transition or property changes it. A node with a `pointerdown`/`pointerup` handler gets no host
dim either (`platformPressDims`), so nothing else animates the press.

Why the millionth (`pressNudge`): a transition retargeted to the value it started from is CSS's
reversing case (exact2 `motion/src/engine.rs`) and runs for a share of 250 ms; Reanimated always
runs the full 250 ms from where it is. Every other press aims 1e-6 off, so no retarget is a
reversal. Colours are not nudged (a quick tap's colour release is CSS-shortened).

## Contract use

```contract
use PressablesConfig, pressNone, pressDown, pressUp, pressableScale, pressTransition from "pressto"

component X
  inject
    pressto: PressablesConfig
    pressablesOnPress: action
  state pressing = pressNone()
  action pressIn(key: number)
    pressing = pressDown(pressing, key)
  action pressOut
    pressing = pressUp(pressing)
  action go
    pressablesOnPress()
  view
    button appearance="none" press=go pointerdown=pressIn(0) pointerup=pressOut
      scale=pressableScale(pressing, 0, pressto) transition=pressTransition("scale", pressto)
```

In a `for`, the key is the item's index. A node with its own transition joins them:
``transition=`${own}, ${pressTransition("scale", pressto)}` ``. A node that already has its own
`scale` takes the press on a box inside it that fills it (smooth-dropdown).
