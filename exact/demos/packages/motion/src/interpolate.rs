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

/// `interpolateColor(value, input, output)` in its default RGB space (interpolateColor.ts):
/// each channel interpolated (clamped) in a gamma-2.2 linear space, rounded back to 0…255;
/// alpha linearly. Colours are `[r, g, b, a]`, channels 0…255 and alpha 0…1.
pub fn interpolate_color(value: f64, input: &[f64], output: &[[f64; 4]]) -> [f64; 4] {
    const GAMMA: f64 = 2.2;
    let mut out = [0.0; 4];
    let mut channel = [0.0; 8];
    let n = output.len().min(channel.len());
    for (k, slot) in out.iter_mut().enumerate() {
        for (i, c) in output.iter().take(n).enumerate() {
            channel[i] = if k < 3 { (c[k] / 255.0).powf(GAMMA) } else { c[k] };
        }
        let v = interpolate_clamp(value, &input[..n], &channel[..n]);
        *slot = if k < 3 { (v.powf(1.0 / GAMMA) * 255.0).round() } else { v };
    }
    out
}

#[cfg(test)]
mod color_tests {
    use super::*;

    #[test]
    fn color_midpoint_is_gamma_corrected() {
        let c = interpolate_color(0.5, &[0.0, 1.0], &[[0.0, 0.0, 0.0, 1.0], [255.0, 255.0, 255.0, 1.0]]);
        // (0.5)^(1/2.2) × 255 = 186.
        assert_eq!(c, [186.0, 186.0, 186.0, 1.0]);
    }
}
