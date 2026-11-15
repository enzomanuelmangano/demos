# gestures

Pan, Tap, Pinch and Fling recognizers fed by raw pointer events, for GPU surfaces. A surface keeps
one recognizer per gesture and passes it every pointer event (id, phase, canvas position, time in
ms); it answers with what happened: begin, start, update, end or fail.

## What it is not

It is not a reimplementation of react-native-gesture-handler. It uses the same callback names and
payload shapes, and iOS's own recognizer thresholds (a 10 pt pan, the swipe's 50 pt and 0.5 s), so
the Demos app keeps its feel. Short term, a solid existing alternative is preferable where one
exists.

## Install

A path dependency inside the Demos repo for now; not published. Long term the crate should be
independent of any machine and publishable.

## Example

```rust
use gestures::{Event, PanGesture, Phase};

let mut pan = PanGesture::new();
pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
let Event::Start(p) = pan.event(1, Phase::Move, 20.0, 0.0, 132.0, true) else { panic!() };
assert_eq!(p.translation_x, 10.0);
```

## Types

- `PanGesture`: one finger; begins after `min_distance`, reports translation and velocity.
- `TapGesture`: ends within a duration, with optional distance limits.
- `PinchGesture`: two fingers; reports a scale and a focal point.
- `FlingGesture` and `directions`: iOS's swipe recognizer and its direction bits.

## Credits

Callback names and payload shapes follow react-native-gesture-handler 3.x.

## Notice

react-native-gesture-handler is Copyright (c) Krzysztof Magiera and Software Mansion,
released under the MIT licence. This crate follows its API shapes; it contains none of its source.

## Licence

MIT, see [LICENSE](LICENSE).
