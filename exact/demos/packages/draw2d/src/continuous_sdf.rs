//! The signed distance to a rounded rect with continuous corners (the squircle corner of iOS):
//! the shape [`crate::add_continuous_rrect`] fills, for a shader that covers, anti-aliases or
//! blurs an edge by its distance.
//!
//! Analytic, no table: folded into one corner and across its diagonal (the corner is symmetric
//! about it), a point is projected onto the corner's own cubics (the first, and the half of the
//! second up to the diagonal: `CONTINUOUS_CORNER`) by a coarse sample and Newton's
//! method, or onto the straight side, which is nearest wherever the curve cannot be. Only points
//! within about 3 r of a corner take the projection. [`CONTINUOUS_RRECT_SDF_WGSL`] is the same
//! function for a shader, step for step; a shader carries a copy of its text (a `.wgsl` is one
//! file), which its demo's test checks is verbatim.

use crate::{CONTINUOUS_CORNER, CONTINUOUS_EXTENT};

type V = [f32; 2];

fn cubic(p: &[V; 4], t: f32) -> (V, V, V) {
    let mt = 1.0 - t;
    let mut c = [0.0; 2];
    let mut d1 = [0.0; 2];
    let mut d2 = [0.0; 2];
    for k in 0..2 {
        c[k] = mt * mt * mt * p[0][k] + 3.0 * mt * mt * t * p[1][k] + 3.0 * mt * t * t * p[2][k] + t * t * t * p[3][k];
        d1[k] = 3.0 * (mt * mt * (p[1][k] - p[0][k]) + 2.0 * mt * t * (p[2][k] - p[1][k]) + t * t * (p[3][k] - p[2][k]));
        d2[k] = 6.0 * (mt * (p[2][k] - 2.0 * p[1][k] + p[0][k]) + t * (p[3][k] - 2.0 * p[2][k] + p[1][k]));
    }
    (c, d1, d2)
}

/// The nearest point of cubic `p` over t ∈ [0, `end`] to `q`: (squared distance, the cross of
/// the tangent with the offset, negative on the shape's side).
fn project(p: &[V; 4], end: f32, q: V) -> (f32, f32) {
    let dist2 = |c: V| (c[0] - q[0]).powi(2) + (c[1] - q[1]).powi(2);
    let mut t = 0.0;
    let mut best = f32::MAX;
    for i in 0..5 {
        let s = end * i as f32 / 4.0;
        let d = dist2(cubic(p, s).0);
        if d < best {
            best = d;
            t = s;
        }
    }
    for _ in 0..3 {
        let (c, d1, d2) = cubic(p, t);
        let o = [c[0] - q[0], c[1] - q[1]];
        let g = o[0] * d1[0] + o[1] * d1[1];
        let h = d1[0] * d1[0] + d1[1] * d1[1] + o[0] * d2[0] + o[1] * d2[1];
        if h > 1e-6 {
            t = (t - g / h).clamp(0.0, end);
        }
    }
    let (c, d1, _) = cubic(p, t);
    let o = [q[0] - c[0], q[1] - c[1]];
    (dist2(c), d1[0] * o[1] - d1[1] * o[0])
}

/// The signed distance (negative inside) from `p` to the continuous rounded rect centred at the
/// origin with half size `half` and corner radius `r` (drawn at min(r, w / 2, h / 2), as
/// [`crate::continuous_radius`]). Exact (to 0.01 pt) while the corners do not overlap, 2 ×
/// 1.52866 r ≤ min(w, h); a pill or circle, whose corners' curves cross along a side, is not
/// covered.
pub fn continuous_rrect_sdf(p: V, half: V, r: f32) -> f32 {
    let r = r.min(half[0]).min(half[1]).max(0.0);
    // Inward from each side, folded across the corner's diagonal: a ≥ b, the side b = 0.
    let qx = half[0] - p[0].abs();
    let qy = half[1] - p[1].abs();
    let (a, b) = (qx.max(qy), qx.min(qy));
    let e = CONTINUOUS_EXTENT * r;
    if r <= 0.0 || a - e >= b.max(0.0) || b >= 3.0 * r {
        return -b;
    }
    let q = [a / r, b / r];
    let first = [[CONTINUOUS_EXTENT, 0.0], CONTINUOUS_CORNER[0][0], CONTINUOUS_CORNER[0][1], CONTINUOUS_CORNER[0][2]];
    let second = [CONTINUOUS_CORNER[0][2], CONTINUOUS_CORNER[1][0], CONTINUOUS_CORNER[1][1], CONTINUOUS_CORNER[1][2]];
    let (d1, s1) = project(&first, 1.0, q);
    let (d2, s2) = project(&second, 0.5, q);
    let (dc, sc) = if d1 < d2 { (d1, s1) } else { (d2, s2) };
    let side = (CONTINUOUS_EXTENT - q[0]).max(0.0).powi(2) + q[1] * q[1];
    if side < dc {
        return if q[1] > 0.0 { -side.sqrt() * r } else { side.sqrt() * r };
    }
    if sc < 0.0 {
        -dc.sqrt() * r
    } else {
        dc.sqrt() * r
    }
}

/// [`continuous_rrect_sdf`] in WGSL: `continuous_rrect_sdf(p, half, r) -> f32`, with its helpers
/// (`crr_` prefixed). Paste it into a shader verbatim.
pub const CONTINUOUS_RRECT_SDF_WGSL: &str = r#"// continuous_rrect_sdf: packages/draw2d/src/continuous_sdf.rs (Core Animation's continuous corner).
const CRR_E: f32 = 1.528665;

struct CrrHit { d2: f32, side: f32 };

fn crr_project(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, end: f32, q: vec2<f32>) -> CrrHit {
    var t = 0.0;
    var best = 1e30;
    for (var i = 0; i < 5; i = i + 1) {
        let s = end * f32(i) / 4.0;
        let ms = 1.0 - s;
        let c = ms * ms * ms * p0 + 3.0 * ms * ms * s * p1 + 3.0 * ms * s * s * p2 + s * s * s * p3;
        let d = dot(c - q, c - q);
        if (d < best) { best = d; t = s; }
    }
    for (var i = 0; i < 3; i = i + 1) {
        let mt = 1.0 - t;
        let c = mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
        let d1 = 3.0 * (mt * mt * (p1 - p0) + 2.0 * mt * t * (p2 - p1) + t * t * (p3 - p2));
        let d2 = 6.0 * (mt * (p2 - 2.0 * p1 + p0) + t * (p3 - 2.0 * p2 + p1));
        let o = c - q;
        let h = dot(d1, d1) + dot(o, d2);
        if (h > 1e-6) { t = clamp(t - dot(o, d1) / h, 0.0, end); }
    }
    let mt = 1.0 - t;
    let c = mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
    let d1 = 3.0 * (mt * mt * (p1 - p0) + 2.0 * mt * t * (p2 - p1) + t * t * (p3 - p2));
    let o = q - c;
    return CrrHit(dot(o, o), d1.x * o.y - d1.y * o.x);
}

// The signed distance (negative inside) from `p` to the continuous rounded rect centred at the
// origin, half size `half`, corner radius `r` (drawn at min(r, w / 2, h / 2)); corners that do
// not overlap (2 × 1.52866 r ≤ min(w, h)).
fn continuous_rrect_sdf(p: vec2<f32>, half: vec2<f32>, r_in: f32) -> f32 {
    let r = max(min(r_in, min(half.x, half.y)), 0.0);
    let qq = half - abs(p);
    let a = max(qq.x, qq.y);
    let b = min(qq.x, qq.y);
    let e = CRR_E * r;
    if (r <= 0.0 || a - e >= max(b, 0.0) || b >= 3.0 * r) { return -b; }
    let q = vec2<f32>(a, b) / r;
    let h1 = crr_project(vec2<f32>(CRR_E, 0.0), vec2<f32>(1.088493, 0.0), vec2<f32>(0.868407, 0.0), vec2<f32>(0.631494, 0.074911), 1.0, q);
    let h2 = crr_project(vec2<f32>(0.631494, 0.074911), vec2<f32>(0.372824, 0.169060), vec2<f32>(0.169060, 0.372824), vec2<f32>(0.074911, 0.631494), 0.5, q);
    var hit = h2;
    if (h1.d2 < h2.d2) { hit = h1; }
    let sx = max(CRR_E - q.x, 0.0);
    let side = sx * sx + q.y * q.y;
    if (side < hit.d2) { return select(sqrt(side), -sqrt(side), q.y > 0.0) * r; }
    return select(sqrt(hit.d2), -sqrt(hit.d2), hit.side < 0.0) * r;
}
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::continuous_rrect_path;

    /// The path flattened finely, with the brute-force distance and the even-odd inside test.
    fn reference(w: f32, h: f32, r: f32) -> Vec<(V, V)> {
        let path = continuous_rrect_path(-w / 2.0, -h / 2.0, w, h, r);
        let mut segs = Vec::new();
        for e in lyon::path::iterator::PathIterator::flattened(path.iter(), 0.0005) {
            if let lyon::path::Event::Line { from, to } = e {
                segs.push(([from.x, from.y], [to.x, to.y]));
            }
            if let lyon::path::Event::End { last, first, .. } = e {
                segs.push(([last.x, last.y], [first.x, first.y]));
            }
        }
        segs
    }

    fn brute(segs: &[(V, V)], p: V) -> f32 {
        let mut best = f32::MAX;
        let mut inside = false;
        for &(a, b) in segs {
            let ab = [b[0] - a[0], b[1] - a[1]];
            let ap = [p[0] - a[0], p[1] - a[1]];
            let t = ((ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1]).max(1e-12)).clamp(0.0, 1.0);
            let d = ((ap[0] - ab[0] * t).powi(2) + (ap[1] - ab[1] * t).powi(2)).sqrt();
            best = best.min(d);
            if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) / (b[1] - a[1]) * ab[0] {
                inside = !inside;
            }
        }
        if inside {
            -best
        } else {
            best
        }
    }

    #[test]
    fn the_distance_is_core_animations_outline() {
        for (w, h, r) in [(300.0f32, 200.0f32, 20.0f32), (120.0, 100.0, 30.0)] {
            let segs = reference(w, h, r);
            let mut worst = 0.0f32;
            // A grid over a corner's neighbourhood, inside and out, and the whole quadrant coarsely.
            for i in 0..=120 {
                for j in 0..=120 {
                    let p = [w / 2.0 - 4.0 * r + 5.0 * r * i as f32 / 120.0, h / 2.0 - 4.0 * r + 5.0 * r * j as f32 / 120.0];
                    let (got, want) = (continuous_rrect_sdf(p, [w / 2.0, h / 2.0], r), brute(&segs, p));
                    worst = worst.max((got - want).abs());
                }
            }
            for i in 0..=40 {
                for j in 0..=40 {
                    let p = [(w / 2.0 + 20.0) * i as f32 / 40.0, (h / 2.0 + 20.0) * j as f32 / 40.0];
                    let (got, want) = (continuous_rrect_sdf(p, [w / 2.0, h / 2.0], r), brute(&segs, p));
                    worst = worst.max((got - want).abs());
                }
            }
            assert!(worst < 0.01, "{w}×{h} r {r}: off by {worst} pt");
        }
    }
}
