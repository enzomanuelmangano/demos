//! Skia's arcs, ovals and circles as it builds them in a path: conics (google/skia chrome/m157:
//! `SkPathBuilder::addArc`, `arcTo(oval, start, sweep, forceMoveTo)`, the SVG `arcTo`,
//! `addOval`, `addCircle`; `SkConic::BuildUnitArc` in SkGeometry.cpp; the oval's points from
//! `SkPath_OvalPointIterator` / `SkPath_RectPointIterator`; `SkMatrix`'s concat and mapping
//! arithmetic, which decides each conic point's last bit).
//!
//! lyon paths have no conics, so a conic goes into a lyon builder as its cubic approximation
//! (the control points 4w / (3(1 + w)) of the way along the conic's tangents, the usual circular
//! cubic) and is remembered here, by the cubic's exact points; the canvas turns that cubic back
//! into the conic when it draws, so Graphite tessellates the conic (Wang's formula for conics)
//! as it does in RN. Anything else that reads the path (lyon's measuring, trimming, a demo's own
//! code) sees the cubic. A path transformed point by point loses the conics (its cubics are new).

use std::cell::RefCell;
use std::collections::HashMap;

use lyon::math::{point, Point};
use lyon::path::builder::NoAttributes;
use lyon::path::traits::PathBuilder;

/// `SK_ScalarRoot2Over2`.
pub(crate) const ROOT2_OVER2: f32 = 0.707106781;
/// `SK_ScalarNearlyZero`.
const NEARLY_ZERO: f32 = 1.0 / 4096.0;
/// The cubics remembered as conics, in two generations: a lookup keeps an entry young, so a
/// path built once (and drawn every frame) outlives a stream of per-frame arcs.
const GENERATION: usize = 16384;

#[derive(Default)]
struct Registry {
    young: HashMap<[u32; 8], (Point, f32)>,
    old: HashMap<[u32; 8], (Point, f32)>,
}

thread_local! {
    static REGISTRY: RefCell<Registry> = RefCell::new(Registry::default());
}

fn key(p0: Point, c1: Point, c2: Point, p3: Point) -> [u32; 8] {
    [p0.x, p0.y, c1.x, c1.y, c2.x, c2.y, p3.x, p3.y].map(f32::to_bits)
}

/// The conic a cubic was made from, if it was.
pub(crate) fn lookup(p0: Point, c1: Point, c2: Point, p3: Point) -> Option<(Point, f32)> {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if r.young.is_empty() && r.old.is_empty() {
            return None;
        }
        let k = key(p0, c1, c2, p3);
        if let Some(v) = r.young.get(&k) {
            return Some(*v);
        }
        let v = r.old.remove(&k)?;
        r.young.insert(k, v);
        Some(v)
    })
}

/// What a conic is appended to: a lyon builder, or lyon's SVG builder.
pub(crate) trait Sink {
    fn cubic(&mut self, c1: Point, c2: Point, to: Point);
    fn line(&mut self, to: Point);
}
impl<B: PathBuilder> Sink for NoAttributes<B> {
    fn cubic(&mut self, c1: Point, c2: Point, to: Point) {
        self.cubic_bezier_to(c1, c2, to);
    }
    fn line(&mut self, to: Point) {
        self.line_to(to);
    }
}
impl Sink for dyn lyon::path::builder::SvgPathBuilder + '_ {
    fn cubic(&mut self, c1: Point, c2: Point, to: Point) {
        self.cubic_bezier_to(c1, c2, to);
    }
    fn line(&mut self, to: Point) {
        self.line_to(to);
    }
}

/// `conicTo(p1, p2, w)` from `p0` into a lyon builder: its cubic, remembered as the conic.
pub(crate) fn conic_to<S: Sink + ?Sized>(b: &mut S, p0: Point, p1: Point, p2: Point, w: f32) {
    let k = 4.0 * w / (3.0 * (1.0 + w));
    let c1 = point(p0.x + (p1.x - p0.x) * k, p0.y + (p1.y - p0.y) * k);
    let c2 = point(p2.x + (p1.x - p2.x) * k, p2.y + (p1.y - p2.y) * k);
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        if r.young.len() >= GENERATION {
            r.old = std::mem::take(&mut r.young);
        }
        r.young.insert(key(p0, c1, c2, p2), (p1, w));
    });
    b.cubic(c1, c2, p2);
}

/// The part of `SkMatrix` the arc builders use: `[scaleX, skewX, transX, skewY, scaleY,
/// transY]`, and whether its type is known (`setSinCos` leaves it unknown, so a concat with it
/// is never the trivial-identity shortcut).
#[derive(Clone, Copy, Debug)]
pub(crate) struct SkM {
    m: [f32; 6],
    known: bool,
}

impl SkM {
    #[cfg(test)]
    const I: SkM = SkM { m: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0], known: true };

    fn scale(sx: f32, sy: f32) -> SkM {
        SkM { m: [sx, 0.0, 0.0, 0.0, sy, 0.0], known: true }
    }
    /// `setSinCos(sin, cos)` about the origin.
    fn sin_cos(s: f32, c: f32) -> SkM {
        SkM { m: [c, -s, 0.0, s, c, 0.0], known: false }
    }
    /// `setRotate(degrees)`.
    fn rotate(deg: f32) -> SkM {
        let rad = deg * (std::f32::consts::PI / 180.0);
        SkM::sin_cos(sin_snap(rad), cos_snap(rad))
    }
    fn translates(&self) -> bool {
        self.m[2] != 0.0 || self.m[5] != 0.0
    }
    fn scales(&self) -> bool {
        self.m[0] != 1.0 || self.m[4] != 1.0
    }
    fn affine(&self) -> bool {
        self.m[1] != 0.0 || self.m[3] != 0.0
    }
    fn trivially_identity(&self) -> bool {
        self.known && !self.translates() && !self.scales() && !self.affine()
    }
    fn is_identity(&self) -> bool {
        !self.translates() && !self.scales() && !self.affine()
    }
    /// `postTranslate`.
    fn post_translate(mut self, dx: f32, dy: f32) -> SkM {
        self.m[2] += dx;
        self.m[5] += dy;
        self
    }
    /// `preScale(sx, sy)`.
    fn pre_scale(mut self, sx: f32, sy: f32) -> SkM {
        if sx == 1.0 && sy == 1.0 {
            return self;
        }
        self.m[0] *= sx;
        self.m[3] *= sx;
        self.m[1] *= sy;
        self.m[4] *= sy;
        self
    }
    /// `setConcat(a, b)`: a · b.
    fn concat(a: &SkM, b: &SkM) -> SkM {
        if a.trivially_identity() {
            return *b;
        }
        if b.trivially_identity() {
            return *a;
        }
        let (a, b) = (&a.m, &b.m);
        let scale_translate = |m: &[f32; 6]| m[1] == 0.0 && m[3] == 0.0;
        if scale_translate(a) && scale_translate(b) {
            return SkM { m: [a[0] * b[0], 0.0, a[0] * b[2] + a[2], 0.0, a[4] * b[4], a[4] * b[5] + a[5]], known: true };
        }
        let mam = |x: f32, y: f32, z: f32, w: f32| (x as f64 * y as f64 + z as f64 * w as f64) as f32;
        SkM {
            m: [
                mam(a[0], b[0], a[1], b[3]),
                mam(a[0], b[1], a[1], b[4]),
                mam(a[0], b[2], a[1], b[5]) + a[2],
                mam(a[3], b[0], a[4], b[3]),
                mam(a[3], b[1], a[4], b[4]),
                mam(a[3], b[2], a[4], b[5]) + a[5],
            ],
            known: true,
        }
    }
    /// `mapPoints` (`Trans_pts`, `Scale_pts`, `Affine_vpts`).
    fn map(&self, p: [f32; 2]) -> [f32; 2] {
        let [sx, kx, tx, ky, sy, ty] = self.m;
        if self.affine() {
            [p[0] * sx + p[1] * kx + tx, p[1] * sy + p[0] * ky + ty]
        } else if self.scales() {
            [p[0] * sx + tx, p[1] * sy + ty]
        } else if self.translates() {
            [p[0] + tx, p[1] + ty]
        } else {
            p
        }
    }
}

/// `SkScalarSinSnapToZero`, `SkScalarCosSnapToZero`.
fn sin_snap(r: f32) -> f32 {
    let v = r.sin();
    if v.abs() <= 1.0 / 65536.0 {
        0.0
    } else {
        v
    }
}
fn cos_snap(r: f32) -> f32 {
    let v = r.cos();
    if v.abs() <= 1.0 / 65536.0 {
        0.0
    } else {
        v
    }
}

/// A conic: three points and a weight.
pub(crate) type Conic = ([[f32; 2]; 3], f32);

/// `SkConic::BuildUnitArc`: up to five conics from `start` to `stop` (unit vectors), clockwise
/// unless `ccw`, through `user`.
pub(crate) fn build_unit_arc(start: [f32; 2], stop: [f32; 2], ccw: bool, user: &SkM, dst: &mut [Conic; 5]) -> usize {
    let x = start[0] * stop[0] + start[1] * stop[1];
    let mut y = start[0] * stop[1] - start[1] * stop[0];
    let abs_y = y.abs();
    if abs_y <= NEARLY_ZERO && x > 0.0 && ((y >= 0.0 && !ccw) || (y <= 0.0 && ccw)) {
        return 0;
    }
    if ccw {
        y = -y;
    }
    let mut quadrant = 0;
    if y == 0.0 {
        quadrant = 2;
    } else if x == 0.0 {
        quadrant = if y > 0.0 { 1 } else { 3 };
    } else {
        if y < 0.0 {
            quadrant += 2;
        }
        if (x < 0.0) != (y < 0.0) {
            quadrant += 1;
        }
    }
    const Q: [[f32; 2]; 8] = [[1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [-1.0, 1.0], [-1.0, 0.0], [-1.0, -1.0], [0.0, -1.0], [1.0, -1.0]];
    let mut count = quadrant;
    for (i, d) in dst.iter_mut().enumerate().take(count) {
        *d = ([Q[i * 2], Q[i * 2 + 1], Q[(i * 2 + 2) % 8]], ROOT2_OVER2);
    }
    let final_p = [x, y];
    let last_q = Q[quadrant * 2];
    let dot = last_q[0] * final_p[0] + last_q[1] * final_p[1];
    if dot.is_nan() {
        return 0;
    }
    if dot < 1.0 {
        let mut off = [last_q[0] + x, last_q[1] + y];
        let cos_half = ((1.0 + dot) / 2.0).sqrt();
        // setLength(1 / cos_half), in doubles.
        let len = 1.0 / cos_half;
        let (xx, yy) = (off[0] as f64, off[1] as f64);
        let scale = len as f64 / (xx * xx + yy * yy).sqrt();
        off = [(xx * scale) as f32, (yy * scale) as f32];
        let (dx, dy) = (last_q[0] - off[0], last_q[1] - off[1]);
        // !EqualsWithinTolerance(lastQ, offCurve): CanNormalize(lastQ − offCurve).
        if dx.is_finite() && dy.is_finite() && (dx != 0.0 || dy != 0.0) {
            dst[count] = ([last_q, off, final_p], cos_half);
            count += 1;
        }
    }
    let mut m = SkM::sin_cos(start[1], start[0]);
    if ccw {
        m = m.pre_scale(1.0, -1.0);
    }
    let m = SkM::concat(user, &m);
    for d in dst.iter_mut().take(count) {
        for p in d.0.iter_mut() {
            *p = m.map(*p);
        }
    }
    count
}

/// `SkRect::centerX/Y`: the midpoint in doubles.
fn mid(a: f32, b: f32) -> f32 {
    (0.5 * (a as f64 + b as f64)) as f32
}

fn pt(p: [f32; 2]) -> Point {
    point(p[0], p[1])
}

/// `SkPathRawShapes::Oval(oval, dir, index)`: the start and four quarter conics (control, end),
/// weight √2/2 (`set_as_oval`: `SkPath_OvalPointIterator`, `SkPath_RectPointIterator`).
pub(crate) fn oval_conics(r: [f32; 4], ccw: bool, index: u32) -> (Point, [(Point, Point); 4]) {
    let (cx, cy) = (mid(r[0], r[2]), mid(r[1], r[3]));
    let oval = [[cx, r[1]], [r[2], cy], [cx, r[3]], [r[0], cy]];
    let rect = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    let advance = if ccw { 3 } else { 1 };
    let mut oi = index % 4;
    let mut ri = (index + if ccw { 1 } else { 0 }) % 4;
    let start = pt(oval[oi as usize]);
    let mut out = [(start, start); 4];
    for o in out.iter_mut() {
        ri = (ri + advance) % 4;
        oi = (oi + advance) % 4;
        *o = (pt(rect[ri as usize]), pt(oval[oi as usize]));
    }
    (start, out)
}

/// `addOval(oval, dir, index)` as a new closed contour.
pub(crate) fn add_oval<B: PathBuilder>(b: &mut NoAttributes<B>, r: [f32; 4], ccw: bool, index: u32) {
    let (start, quarters) = oval_conics(r, ccw, index);
    b.begin(start);
    let mut at = start;
    for (c, to) in quarters {
        conic_to(b, at, c, to, ROOT2_OVER2);
        at = to;
    }
    b.end(true);
}

/// `addArc(oval, startAngle, sweepAngle)`: an oval when the sweep is a full turn from a
/// quadrant, else `arcTo(oval, start, sweep, forceMoveTo = true)`; a contour of its own, open.
pub(crate) fn add_arc<B: PathBuilder>(b: &mut NoAttributes<B>, oval: [f32; 4], start: f32, sweep: f32) {
    let (w, h) = (oval[2] - oval[0], oval[3] - oval[1]);
    // oval.isEmpty() || sweep == 0.
    if !(w > 0.0 && h > 0.0) || sweep == 0.0 {
        return;
    }
    if sweep >= 360.0 || sweep <= -360.0 {
        let over = start / 90.0;
        let over_i = (over as f64 + 0.5).floor() as f32;
        if (over - over_i).abs() <= NEARLY_ZERO {
            let mut index = (over_i + 1.0) % 4.0;
            if index < 0.0 {
                index += 4.0;
            }
            return add_oval(b, oval, sweep < 0.0, index as u32);
        }
    }
    let start = start % 360.0;
    // arc_is_lone_point.
    if sweep == 0.0 && (start == 0.0 || start == 360.0) {
        b.begin(point(oval[2], mid(oval[1], oval[3])));
        b.end(false);
        return;
    }
    let to_rad = |d: f32| d * (std::f32::consts::PI / 180.0);
    let (start_rad, mut stop_rad) = (to_rad(start), to_rad(start + sweep));
    let start_v = [cos_snap(start_rad), sin_snap(start_rad)];
    let mut stop_v = [cos_snap(stop_rad), sin_snap(stop_rad)];
    if start_v == stop_v {
        let sw = sweep.abs();
        if sw < 360.0 && sw > 359.0 {
            let delta = (1.0f32 / 512.0).copysign(sweep);
            while start_v == stop_v {
                stop_rad -= delta;
                stop_v = [cos_snap(stop_rad), sin_snap(stop_rad)];
            }
        }
    }
    let ccw = sweep <= 0.0;
    if start_v == stop_v {
        let end = to_rad(start + sweep);
        let (rx, ry) = (w / 2.0, h / 2.0);
        b.begin(point(mid(oval[0], oval[2]) + rx * end.cos(), mid(oval[1], oval[3]) + ry * end.sin()));
        b.end(false);
        return;
    }
    // build_arc_conics: setScale(w/2, h/2).postTranslate(centre).
    let user = SkM::scale(w / 2.0, h / 2.0).post_translate(mid(oval[0], oval[2]), mid(oval[1], oval[3]));
    let mut conics = [([[0.0; 2]; 3], 0.0); 5];
    let count = build_unit_arc(start_v, stop_v, ccw, &user, &mut conics);
    if count == 0 {
        b.begin(pt(user.map(stop_v)));
        b.end(false);
        return;
    }
    let mut at = pt(conics[0].0[0]);
    b.begin(at);
    for (p, w) in &conics[..count] {
        conic_to(b, at, pt(p[1]), pt(p[2]), *w);
        at = pt(p[2]);
    }
    b.end(false);
}

/// The SVG `arcTo(r, xAxisRotate, arcSize, sweep, end)` from `from`, on the current contour.
#[allow(clippy::too_many_arguments)]
pub(crate) fn svg_arc_to<S: Sink + ?Sized>(b: &mut S, from: Point, rx: f32, ry: f32, angle: f32, large: bool, ccw: bool, end: Point) {
    if rx == 0.0 || ry == 0.0 || from == end {
        b.line(end);
        return;
    }
    let (mut rx, mut ry) = (rx.abs(), ry.abs());
    let mid_d = [(from.x - end.x) * 0.5, (from.y - end.y) * 0.5];
    let rot = SkM::rotate(-angle);
    let t = rot.map(mid_d);
    let (sq_rx, sq_ry) = (rx * rx, ry * ry);
    let (sq_x, sq_y) = (t[0] * t[0], t[1] * t[1]);
    let mut radii_scale = sq_x / sq_rx + sq_y / sq_ry;
    if radii_scale > 1.0 {
        radii_scale = radii_scale.sqrt();
        rx *= radii_scale;
        ry *= radii_scale;
    }
    // setScale(1/rx, 1/ry).preRotate(−angle) (preConcat skips an identity rotation).
    let mut pt_xf = SkM::scale(1.0 / rx, 1.0 / ry);
    let r = SkM::rotate(-angle);
    if !r.is_identity() {
        pt_xf = SkM::concat(&pt_xf, &r);
    }
    let mut u0 = pt_xf.map([from.x, from.y]);
    let mut u1 = pt_xf.map([end.x, end.y]);
    let mut delta = [u1[0] - u0[0], u1[1] - u0[1]];
    let d = delta[0] * delta[0] + delta[1] * delta[1];
    let sfs = (1.0 / d - 0.25).max(0.0);
    let mut sf = sfs.sqrt();
    if ccw != large {
        sf = -sf;
    }
    delta = [delta[0] * sf, delta[1] * sf];
    let mut center = [u0[0] + u1[0], u0[1] + u1[1]];
    center = [center[0] * 0.5, center[1] * 0.5];
    center = [center[0] + -delta[1], center[1] + delta[0]];
    u0 = [u0[0] - center[0], u0[1] - center[1]];
    u1 = [u1[0] - center[0], u1[1] - center[1]];
    let theta1 = u0[1].atan2(u0[0]);
    let theta2 = u1[1].atan2(u1[0]);
    let mut theta_arc = theta2 - theta1;
    let pi = std::f32::consts::PI;
    if theta_arc < 0.0 && !ccw {
        theta_arc += pi * 2.0;
    } else if theta_arc > 0.0 && ccw {
        theta_arc -= pi * 2.0;
    }
    if theta_arc.abs() < pi / (1000.0 * 1000.0) {
        b.line(end);
        return;
    }
    // setRotate(angle).preScale(rx, ry).
    let pt_xf = SkM::rotate(angle).pre_scale(rx, ry);
    let segments = (theta_arc / (2.0 * pi / 3.0)).abs().ceil() as i32;
    let theta_width = theta_arc / segments as f32;
    let tt = (0.5 * theta_width).tan();
    if !tt.is_finite() {
        return;
    }
    let mut start_theta = theta1;
    let w = (0.5 + theta_width.cos() * 0.5).sqrt();
    let is_int = |v: f32| v == v.floor();
    let expect_integers = (pi / 2.0 - theta_width.abs()).abs() <= NEARLY_ZERO && is_int(rx) && is_int(ry) && is_int(end.x) && is_int(end.y);
    let mut at = from;
    for i in 0..segments {
        let end_theta = start_theta + theta_width;
        let (s, c) = (sin_snap(end_theta), cos_snap(end_theta));
        let p1 = [c + center[0], s + center[1]];
        let p0 = [p1[0] + tt * s, p1[1] + -tt * c];
        let mut mapped = [pt_xf.map(p0), pt_xf.map(p1)];
        if expect_integers {
            for p in mapped.iter_mut() {
                *p = p.map(|v| (v as f64 + 0.5).floor() as f32);
            }
        }
        // The final point is the input point (`fPts.back() = endPt`).
        let to = if i + 1 == segments { end } else { pt(mapped[1]) };
        conic_to(b, at, pt(mapped[0]), to, w);
        at = to;
        start_theta = end_theta;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_unit_quarter_arc_is_one_quadrant_conic() {
        let mut c = [([[0.0; 2]; 3], 0.0); 5];
        let n = build_unit_arc([1.0, 0.0], [0.0, 1.0], false, &SkM::I, &mut c);
        assert_eq!(n, 1);
        assert_eq!(c[0], ([[1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], ROOT2_OVER2));
        // 135°: a quadrant and a 45° conic with w = cos 22.5°.
        let s = std::f32::consts::FRAC_1_SQRT_2;
        let n = build_unit_arc([1.0, 0.0], [-s, s], false, &SkM::I, &mut c);
        assert_eq!(n, 2);
        assert!((c[1].1 - (std::f32::consts::PI / 8.0).cos()).abs() < 1e-6, "{}", c[1].1);
        // Every conic of a circular arc lies on the circle (its midpoint).
        for (p, w) in &c[..n] {
            let m = [(p[0][0] + 2.0 * w * p[1][0] + p[2][0]) / (2.0 + 2.0 * w), (p[0][1] + 2.0 * w * p[1][1] + p[2][1]) / (2.0 + 2.0 * w)];
            assert!(((m[0] * m[0] + m[1] * m[1]).sqrt() - 1.0).abs() < 1e-6);
        }
    }

    #[test]
    fn the_registry_turns_the_cubics_back_into_conics() {
        let mut b = lyon::path::Path::builder();
        add_arc(&mut b, [10.0, 20.0, 110.0, 120.0], -90.0, 270.0);
        let path = b.build();
        let mut at = point(0.0, 0.0);
        let mut conics = 0;
        for e in path.iter() {
            match e {
                lyon::path::PathEvent::Begin { at: p } => at = p,
                lyon::path::PathEvent::Cubic { ctrl1, ctrl2, to, .. } => {
                    assert!(lookup(at, ctrl1, ctrl2, to).is_some());
                    conics += 1;
                    at = to;
                }
                _ => {}
            }
        }
        // −90° + 270°: three quadrants.
        assert_eq!(conics, 3);
    }
}
