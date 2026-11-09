# pressto

A port of [pressto](https://github.com/enzomanuelmangano/pressto) 0.7.0, the press feedback the
RN demos import. Contract only.

```contract
use PressableScale, PressableOpacity from "pressto"

button appearance="none" press=go class=PressableScale
```

| Export | Ports |
|---|---|
| `PressableScale` (style) | `PressableScale`: scale 1 → 0.96 while held (`DefaultPressableConfig.minScale`) |
| `PressableOpacity` (style) | `PressableOpacity`: opacity 1 → 0.5 while held (`activeOpacity`) |

The app's `PressablesConfig` plays `Haptics.selectionAsync()` on every press
(`app/_layout.tsx`): each press action runs `haptic("selection")`.

Exact eases a custom node's press over a fixed 120 ms; pressto eases 250 ms on
`bezier(0.25, 0.1, 0.25, 1)`.
