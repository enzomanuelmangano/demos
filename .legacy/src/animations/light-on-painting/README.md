# Light on Painting

Edward Hopper's *Nighthawks*, hung on a dark wall, relit by a bulb you can drag
around the room.

## What it does

- **Take hold of the bulb and drag it.** Nothing else moves the light — tapping
  the painting does not teleport it.
- **Let go** and it swings: an inextensible cord, gravity, and the momentum your
  hand gave it. Untouched, it hangs dead still.
- **Pinch** to push the bulb deeper into the scene or pull it towards you.
- **Double tap** anywhere for brightness, the cord, and a switch that turns the
  relighting off so you can see the painting as it was scanned.

The painting is not a flat image with a spotlight over it. It has a depth field,
so the diner's roof, the counter and the three figures each catch the light at
their own angle and cast their own shadows as the bulb moves past them.

The bulb hangs *inside* that depth rather than in front of it, which is what
makes it read as a lamp in the room: drag it behind the counter and the counter
covers it, and the cord disappears behind the diner's facade on its way down.

## How it works

**The relighting is Konrad Reczko's.** This is a port of the lighting model from
his [Monocular Light Injection](https://github.com/software-mansion/TypeGPU/tree/main/apps/typegpu-docs/src/examples/image-processing/monocular-light-injection)
example for TypeGPU at Software Mansion — [his post about it](https://x.com/reczko_konrad/status/2089670934009413751).
Wrapped lambert, the raymarched shadows, height-field occlusion, the visible
bulb with its limb darkening and halo, and the luminance-preserving tonemap are
all his, constants and all; they are reproduced here in WGSL rather than TGSL.

Copyright (c) 2025 Software Mansion. MIT licensed — see
[LICENSE](https://github.com/software-mansion/TypeGPU/blob/main/LICENSE).

The difference is where the depth comes from. Upstream relights a live camera
feed, so it runs a monocular depth network on the GPU every frame and follows it
with a disparity range estimator, a temporal filter and a surface compute
kernel. A painting never changes. All of that collapses into one offline bake,
and the runtime is left with a single fullscreen fragment pass — no compute, no
inference, nothing per-frame but the light moving.

### The bake

`scripts/bake-painting-surface.py` runs Depth Anything V2 over the painting and
writes `assets/nighthawks-surface.bin`, an `rgba16float` field:

| channel | meaning |
| ------- | ------- |
| R, G    | slope of the depth field |
| B       | ambient occlusion |
| A       | depth (0 far, 1 near) |

The gradient and occlusion maths are a port of upstream's `surfaceKernel`, so
the shader constants stay transferable between the two projects.

It ships as a raw binary rather than an image because the slopes are small
signed quantities — the meaningful range is ±0.009 — and 8 bits per channel
would quantise them into visible terraces once the light rakes across. Metro
serves `.bin` verbatim (see `metro.config.js`) and the half-floats reach
`writeTexture` untouched.

Regenerate with:

```bash
python3 scripts/bake-painting-surface.py \
  --image src/animations/light-on-painting/assets/nighthawks.jpg \
  --out   src/animations/light-on-painting/assets/nighthawks-surface.bin \
  --preview /tmp/preview.png
```

`--preview` writes a contact sheet of depth, occlusion and the derived normals,
which is the fastest way to tell whether a new painting has usable structure.

### World units

`1.0` is the painting's width. The canvas surface is the `z = 0` plane and the
painted scene recedes behind it to `SURFACE_FAR_Z`. The bulb travels between
`LIGHT_Z_MIN` and `LIGHT_Z_MAX`, and rests at `LIGHT_Z_DEFAULT` — partway into
the scene, which is what decides how much of the painting stands in front of it.

The scene is kept deliberately shallow. Give it too much depth and the near
pavement sits so much closer to the bulb than the diner interior that only the
pavement ever visibly reacts; the light stops feeling like it belongs to the
whole picture.

## Iterating on the look

The shader is pure TS with no React Native imports, so it can be compiled and
rendered in headless Chrome without building the app — see the harness recipe in
the project notes. Every lighting parameter is a uniform, which makes a
parameter sweep a matter of query strings.

## Credits

The relighting model is by **Konrad Reczko** (@reczko_konrad) at Software
Mansion, ported from TypeGPU's `monocular-light-injection` under the MIT licence
— [post](https://x.com/reczko_konrad/status/2089670934009413751),
[source](https://github.com/software-mansion/TypeGPU/tree/main/apps/typegpu-docs/src/examples/image-processing/monocular-light-injection).

His original runs the depth network itself, per frame, inside TypeGPU — around
250 dispatches at ~8ms, with the depth buffer never leaving the GPU and
inference, lighting and draw sharing one command encoder. **That is not
reproduced here.** Baking the field offline is what a static painting allows; it
is a simplification of his work, not an advance on it.

Paintings: *Girl with a Pearl Earring* (c. 1665), Johannes Vermeer —
Mauritshuis. *Nighthawks* (1942), Edward Hopper — Art Institute of Chicago.
