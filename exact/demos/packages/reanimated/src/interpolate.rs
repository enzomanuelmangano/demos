//! `interpolate` and `Extrapolation` (interpolation.ts).

/// What happens outside the input range.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Extrapolation {
    /// Keep the line going (the default).
    Extend,
    /// Hold the edge's output.
    Clamp,
    /// Return the input itself.
    Identity,
}

/// `interpolate(value, input, output, { extrapolateLeft: left, extrapolateRight: right })`.
pub fn interpolate_with(value: f64, input: &[f64], output: &[f64], left: Extrapolation, right: Extrapolation) -> f64 {
    let n = input.len();
    debug_assert!(n >= 2 && output.len() == n);
    let (li, ri) = if value > input[n - 1] {
        (n - 2, n - 1)
    } else {
        let (mut lo, mut hi) = (1, n - 1);
        while lo < hi {
            let mid = (lo + hi) / 2;
            if value <= input[mid] {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        (lo - 1, lo)
    };
    let (i0, i1, o0, o1) = (input[li], input[ri], output[li], output[ri]);
    if i1 - i0 == 0.0 {
        return o0;
    }
    let val = o0 + (value - i0) / (i1 - i0) * (o1 - o0);
    let coef = if o1 >= o0 { 1.0 } else { -1.0 };
    let edge = |kind: Extrapolation, at: f64| match kind {
        Extrapolation::Identity => value,
        Extrapolation::Clamp => at,
        Extrapolation::Extend => val,
    };
    if coef * val < coef * o0 {
        edge(left, o0)
    } else if coef * val > coef * o1 {
        edge(right, o1)
    } else {
        val
    }
}

/// `interpolate(value, input, output, type)`: one extrapolation on both sides.
pub fn interpolate(value: f64, input: &[f64], output: &[f64], kind: Extrapolation) -> f64 {
    interpolate_with(value, input, output, kind, kind)
}

/// `interpolate(value, input, output, Extrapolation.CLAMP)`.
pub fn interpolate_clamp(value: f64, input: &[f64], output: &[f64]) -> f64 {
    interpolate(value, input, output, Extrapolation::Clamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_and_edges() {
        assert_eq!(interpolate(0.5, &[0.0, 1.0, 2.0], &[0.0, 10.0, 0.0], Extrapolation::Clamp), 5.0);
        assert_eq!(interpolate(1.5, &[0.0, 1.0, 2.0], &[0.0, 10.0, 0.0], Extrapolation::Clamp), 5.0);
        assert_eq!(interpolate(3.0, &[0.0, 1.0], &[0.0, 10.0], Extrapolation::Clamp), 10.0);
        assert_eq!(interpolate(3.0, &[0.0, 1.0], &[0.0, 10.0], Extrapolation::Extend), 30.0);
        assert_eq!(interpolate(-3.0, &[0.0, 1.0], &[0.0, 10.0], Extrapolation::Identity), -3.0);
    }
}
