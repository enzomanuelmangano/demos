# motion

Spring, timing, easing, decay and interpolation functions stepped on a host's frame clock, for GPU
surfaces. A small folder that wraps the same constants and methods the timing and spring
functions of react-native-reanimated use, so the animations of the Demos app keep the numbers they
were designed with.

## What it is not

It is not a reimplementation of react-native-reanimated. It has no worklets, shared values or
layout animations; it only steps a value toward a target, frame by frame. Short term, a solid
existing alternative is preferable where one exists.

## Install

A path dependency inside the Demos repo for now; not published. Long term the crate should be
independent of any machine and publishable.

## Example

```rust
use motion::{Spring, GENTLE};

let mut spring = Spring::at(0.0);
spring.to(100.0, 0.0, GENTLE);
let mut now_ms = 0.0;
while spring.step(now_ms) {
    now_ms += 1000.0 / 60.0;
}
assert_eq!(spring.value, 100.0);
```

## Modules

- `spring`: a spring (`Spring`, `GENTLE`, `duration_config`).
- `timing` and `easing`: a timed value and the easing curves, Bezier included.
- `decay`: a fling that slows down, with an optional rubber band.
- `spring_array`: a critically damped duration spring over a whole array.
- `interpolate`: piecewise-linear interpolation of numbers and colours.

## Credits

Same constants as react-native-reanimated 4.x's `withSpring`, `withTiming`, `withDecay`, `Easing`
and `interpolate`.

## Notice

react-native-reanimated is Copyright (c) Software Mansion, released under the MIT licence.
This crate uses its constants and follows its algorithms; it contains none of its source.

## Licence

MIT, see [LICENSE](LICENSE).
