# noise

2D simplex noise over a seeded permutation table, for GPU surfaces, with a small seeded random
generator to shuffle it with.

## What it is not

It is not a reimplementation of the simplex-noise package as a whole: it has only the 2D field. It
uses the same constants and the same table shuffle, so a field built from the same random
sequence gives the same values and the demos keep their numbers. Short term, a solid existing
alternative (the `noise` crates on crates.io) is preferable where one fits.

## Install

A path dependency inside the Demos repo for now; not published. Long term the crate should be
independent of any machine and publishable.

## Example

```rust
use noise::{Noise2D, Random};

let mut random = Random::new(42);
let field = Noise2D::new(|| random.next());
let v = field.at(0.5, 1.5);
assert!((-1.0..=1.0).contains(&v));
```

## Types

- `Noise2D`: the field; `at(x, y)` returns a value in -1..1.
- `Random`: a seeded xorshift64* generator.

## Credits

Constants and algorithm after simplex-noise 4.x by Jonas Wagner.

## Notice

simplex-noise is Copyright (c) Jonas Wagner, released under the MIT licence. This crate
follows its algorithm and constants; it contains none of its source.

## Licence

MIT, see [LICENSE](LICENSE).
