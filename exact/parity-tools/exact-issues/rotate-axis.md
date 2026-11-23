# A box's rotate keyframes and transitions turn about z on iOS, whatever its rotate axis

exact2 730abad1, Apple host (the lowering is `host/apple`, so iOS and macOS alike).

## Where

`host/apple/src/svg_lower.rs`:

- line 306 (`specs_in`, a box's keyframes): `Property::Rotate => &[(0, "transform.rotation.z")]`.
- line 881 (`transition_specs`, a box's played transitions): the same key path.
- line 1099 (`box_eligible`): decides whether a box's transform animation goes to Core Animation.
  It checks sticky, `transform-origin` (line 1111), layout transitions and interactive subtrees,
  but never the node's `rotate` axis (`StyleId::RotateAxis`) or `translate_z`.

The model value is right: a sampled `rotate` reaches `NodeView.applyTransform`
(`PressFeedback.swift:317`), and `spaceTransform` (`SpaceTransform.swift:18-25`) reads the
`rotate_axis` row and turns the layer about x or y, under the parent's perspective. But when the
box is eligible, the angle is handed to Core Animation as `transform.rotation.z`. The 3D turn
becomes a flat spin in the screen's plane for the whole animation. At the end the engine
presents the target, so the last frame is right and only the motion is wrong.

Phone reports: everybody-can-cook ("the rotation isn't 3D at all"). The same code path runs in
verification-code and verification-code-face (FlipInXDown / FlipOutXDown).

## Minimal repro

```
keyframes flip
  from rotate=0
  to rotate=90
component Repro
  state on = false
  action go
    on = not on
  view
    column position="absolute" inset=0 align-items="center" justify-content="center" press=go
      view perspective=1000
        text "A" font-size=80 rotate="x 0deg" animation=(on ? "flip 2s linear both" : "none")
```

On the web, the letter tips back about its horizontal axis. On the iOS host it spins clockwise in
the screen's plane. The same happens with `rotate=(on ? "x 90deg" : "x 0deg") transition="rotate 2s linear"`.
In `box_motion_tests.rs`, `keys(&on, id)` for such a box is `["transform.rotation.z"]`.

## Workaround (Contract, hot)

Give every box that turns about x or y a `transform-origin` that is not the default centre:
`transform-origin="left center"` for x, `"center top"` for y. `box_eligible` then returns false,
the engine samples the node, and its `rotate` goes through `spaceTransform` with the axis. Moving
the origin along the rotation axis does not change a pure rotation. With a `scale` on the same
node, put the scale on a wrapper instead. Used in everybody-can-cook, verification-code and
verification-code-face.

## Fix (exact2)

In `box_eligible`, sample a box whose transform is in space:

```rust
let in_space = matches!(n.computed(exact_kernel::StyleId::RotateAxis),
        exact_kernel::RowValue::RotateAxis(a) if a.is_3d())
    || !matches!(n.computed(exact_kernel::StyleId::TranslateZ),
        exact_kernel::RowValue::F32(z) if z == 0.0); // the row's own variant: check its codec
if turns && in_space {
    return false;
}
```

Alternatively, lower `Rotate` to `transform.rotation.x` / `.y` when the axis is a principal axis.
This needs care: CA's `transform.rotation.*` key paths compose with the layer's model transform
in CA's own order, not CSS's translate → rotate → scale about `transform-origin`. Sampling is
the safe fix. Test: in the repro above, `keys(&on, id)` should be empty and
`engine.node_sampled(..)` true.
