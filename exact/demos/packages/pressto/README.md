# pressto

The press system of the Demos app: pressables that scale, fade or give no feedback while a finger
holds them, with one machine under all of them so they press alike. It comes in two halves: the
Contract components in `pressto.contract`, and a Rust state machine in `src/lib.rs` (crate
`pressto`) for GPU surfaces.

pressto is the author's own library; its API names and defaults (`PressableScale`,
`PressableOpacity`, `PressableWithoutFeedback`, `createAnimatedPressable`, `PressablesConfig`) are
meant to last, and these two halves follow them.

## What it is not

It is not a reimplementation of another library's pressables; it is pressto's own conventions
on a new host. Short term, a solid existing alternative is preferable where one exists.

## Install

A path dependency inside the Demos repo for now; not published. Long term the crate should be
independent of any machine and publishable.

## Rust example

```rust
use pressto::Pressable;

let mut button = Pressable::new();
assert!(button.pointer_down(1, true));
let mut now_ms = 0.0;
while button.step(now_ms) {
    now_ms += 16.0;
}
assert_eq!(button.scale(), 0.96);
assert!(button.pointer_up(1, true).is_some());
```

## Contract example

```contract
use PressableScale from "pressto"

component Steps
  action next
    step = step + 1
  view
    // The pressable's place.
    view flex=1 height=60
      PressableScale(press=next)
        // Its look and content.
        row flex-grow=1 border-radius=30 background-color="#0c86f7" align-items="center" justify-content="center"
          text "Continue"
```

| pressto | Here |
|---|---|
| `<PressableScale onPress={f}>` | `PressableScale(press=f)` around the children |
| `<PressableOpacity onPress={f}>` | `PressableOpacity(press=f)` |
| `<PressableWithoutFeedback onPress={f}>` | `PressableWithoutFeedback(press=f)` |
| `createAnimatedPressable(...)` | `AnimatedPressable(press=f, rest=PressLook(...), pressed=PressLook(...))`: each value at progress 0 and 1 |
| a pressable with a layout animation | `PressableScaleLayout(press=f, layout=...)`, `PressableOpacityLayout(...)` |
| `<PressablesConfig globalHandlers={{ onPress }}>` | the root's `provide pressto = defaultPressablesConfig()` and `pressablesOnPress` |

Each component owns its press, calls the global `pressablesOnPress()` and then `press` on a lift
inside, and wraps its slot in one box (`view role="button"`, a flex column that grows and
stretches to fill the box its caller gives it). Write the pressable's place (position, size, flex,
margins) on a `view` around the component, and its look on the node in the slot. The scale turns
about the box's centre. The innermost pressable takes a touch: a pressable around another does not
press in.

## Behaviour

- A touch-down inside the button turns the press on. Sliding off keeps it. The lift turns it off
  and presses only when it lands inside the bounds; a cancel (a scroll or another gesture takes
  the touch) turns it off without a press.
- `progress` eases from 0 to 1 over 250 ms on `cubic-bezier(0.25, 0.1, 0.25, 1)`, or springs
  (mass 1, damping 30, stiffness 200). Each retarget is a full run from the current value.
- Defaults: min scale 0.96, base scale 1, active opacity 0.5.
- Every press carries the global handler's message (`"haptic:selection"`) for the surface to post,
  unless the pressable skips the global handlers.

The Contract half does not use `:active`: the iOS host eases its own press over a fixed 120 ms
that nothing changes, so each component keeps its press state from `pointerdown` and `pointerup`
and drives a transition. A transition retargeted to the value it started from would run for a
share of its duration, so every other press aims 1e-6 off (`pressNudge`) and each retarget runs
the full 250 ms.

## Modules

- `pressto.contract`: the Contract components and the functions under them.
- `src/lib.rs`: `Pressable`, `Press` / `PressEvent`, `Config`, `Animation`, `HitSlop`, `Group`.

## Credits

The timing curve and the spring use the same constants as the `motion` crate, which follows
react-native-reanimated 4.x's `withTiming` and `withSpring`.

## Notice

react-native-reanimated is Copyright (c) Software Mansion, released under the MIT licence. The
constants come from it; this crate contains none of its source.

## Licence

MIT, see [LICENSE](LICENSE).
