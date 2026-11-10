//! What Skia Graphite (RN Skia 3.7.2 = Skia m157, Graphite on Dawn/Metal) decides for a draw,
//! replayed on the CPU: the transform's class and AA radius, rounded rects, the
//! AnalyticRRectRenderStep's instance data, the tessellated path renderers' curve
//! subdivision, and the clip stack's analytic clips.
//!
//! The sources (google/skia, branch chrome/m157):
//! - `Device::chooseRenderer` / `is_simple_shape` (src/gpu/graphite/Device.cpp): filled rects,
//!   rrects (any radii) and lines, hairline rects and rrects, stroked rects and stroked rrects with
//!   circular corners go to `analyticRRect()`; a filled rect whose device rect is within 0.0039 px
//!   of whole pixels under a rect-stays-rect transform, and flood fills, to `nonAABounds()`;
//!   everything else to the path strategy.
//! - `RendererProvider` (RendererProvider.cpp): with no Vello and no sparse strips in the build,
//!   `fInternalMultisampleCount = 4` and `fMinimumPathSizeForMSAA = 0` (RN's ContextOptions are
//!   the defaults), the strategy is `kTessellation`: paths are stencil-and-cover (or convex
//!   wedges) with 4× MSAA, strokes are the hardware stroke tessellator with 4× MSAA.
//! - A render pass is multisampled only when one of its draws `requiresMSAA()` (RenderPassDesc).
//! - `AnalyticRRectRenderStep.cpp` + `analytic_rrect_vertex_fn` (sksl_graphite_vert.sksl) +
//!   `analytic_rrect_coverage_fn` (sksl_graphite_frag.sksl): the 36-vertex, 69-index strip and
//!   its coverage, ported to WGSL in `render.rs` and to Rust in [`reference`].
//! - `TessellateWedgesRenderStep` + `tessellate_filled_curve` + `PatchWriter`: each curve becomes
//!   2^L chords at T = k / 2^L, L = ceil(log2(Wang's formula, precision 4)) ≤ 5 (chopped on the
//!   CPU past 32 segments); a wedge per curve fans from the contour's mean point.
//! - `ClipStack.cpp`: per clip element, an intersection folded into a rect/rrect draw, a scissor
//!   for a pixel-aligned device rect, one analytic rect/rrect clip (`sk_analytic_clip`), or a
//!   depth-only MSAA draw of the element.

use crate::{point, Matrix, Point};

/// `Shape::kDefaultPixelTolerance`: (1 − 0.001) / 255.
pub(crate) const PIXEL_TOLERANCE: f32 = 0.0039;

/// `Transform::Type`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Kind {
    Identity,
    SimpleRectStaysRect,
    RectStaysRect,
    Affine,
    Invalid,
}

/// `skgpu::graphite::Transform` for a 2D affine matrix: its class and scale factors.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Xf {
    pub m: Matrix,
    pub kind: Kind,
    pub min_scale: f32,
    pub max_scale: f32,
}

/// `compute_svd`: the singular values of [m00 m01; m10 m11] as (min, max).
fn compute_svd(m00: f32, m01: f32, m10: f32, m11: f32) -> (f32, f32) {
    let s1 = m00 * m00 + m01 * m01 + m10 * m10 + m11 * m11;
    let e = m00 * m00 + m01 * m01 - m10 * m10 - m11 * m11;
    let f = m00 * m10 + m01 * m11;
    let s2 = (e * e + 4.0 * f * f).sqrt();
    ((0.5 * (s1 - s2)).max(0.0).sqrt(), (0.5 * (s1 + s2)).sqrt())
}

impl Xf {
    pub fn new(m: Matrix) -> Xf {
        let [sx, ky, kx, sy, tx, ty] = m.0;
        let sort = |a: f32, b: f32| if a.abs() > b.abs() { (b.abs(), a.abs()) } else { (a.abs(), b.abs()) };
        let (kind, (min_scale, max_scale)) = if !m.0.iter().all(|v| v.is_finite()) {
            (Kind::Invalid, (0.0, 0.0))
        } else if kx == 0.0 && ky == 0.0 {
            if sx == 0.0 || sy == 0.0 {
                (Kind::Invalid, (0.0, 0.0))
            } else if sx == 1.0 && sy == 1.0 && tx == 0.0 && ty == 0.0 {
                (Kind::Identity, (1.0, 1.0))
            } else {
                (if sx > 0.0 && sy > 0.0 { Kind::SimpleRectStaysRect } else { Kind::RectStaysRect }, sort(sx, sy))
            }
        } else if sx == 0.0 && sy == 0.0 {
            (Kind::RectStaysRect, sort(kx, ky))
        } else if sx * sy - kx * ky == 0.0 {
            (Kind::Invalid, (0.0, 0.0))
        } else {
            (Kind::Affine, compute_svd(sx, kx, ky, sy))
        };
        Xf { m, kind, min_scale, max_scale }
    }

    pub fn valid(&self) -> bool {
        self.kind != Kind::Invalid
    }

    /// `Transform::localAARadius`: 1 / the minimum scale factor (infinite when it is 0).
    pub fn local_aa_radius(&self) -> f32 {
        let r = 1.0 / self.min_scale;
        if r.is_finite() { r } else { f32::INFINITY }
    }

    /// `Transform::mapRect` (ltrb).
    pub fn map_rect(&self, r: [f32; 4]) -> [f32; 4] {
        let [a, b, c, d, e, f] = self.m.0;
        match self.kind {
            Kind::Identity => r,
            Kind::SimpleRectStaysRect => [r[0] * a + e, r[1] * d + f, r[2] * a + e, r[3] * d + f],
            Kind::RectStaysRect => {
                let v = if a == 0.0 { [r[1] * c + e, r[0] * b + f, r[3] * c + e, r[2] * b + f] } else { [r[0] * a + e, r[1] * d + f, r[2] * a + e, r[3] * d + f] };
                [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])]
            }
            _ => {
                let pts = [point(r[0], r[1]), point(r[2], r[1]), point(r[2], r[3]), point(r[0], r[3])].map(|p| self.m.apply(p));
                let mut o = [f32::INFINITY, f32::INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY];
                for p in pts {
                    o = [o[0].min(p.x), o[1].min(p.y), o[2].max(p.x), o[3].max(p.y)];
                }
                o
            }
        }
    }
}

/// `Rect::nearlyEquals(makeRound(), tol)`.
pub(crate) fn nearly_pixel_aligned(r: [f32; 4]) -> bool {
    r.iter().all(|v| (v - (v + 0.5).floor()).abs() <= PIXEL_TOLERANCE)
}

/// An `SkRRect`: `rect` ltrb, per-corner (x, y) radii TL, TR, BR, BL.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct RRect {
    pub rect: [f32; 4],
    pub radii: [[f32; 2]; 4],
}

impl RRect {
    pub fn width(&self) -> f32 {
        self.rect[2] - self.rect[0]
    }
    pub fn height(&self) -> f32 {
        self.rect[3] - self.rect[1]
    }
    /// `SkRRect::setRectXY(rect, r, r)`: `None` when it is a plain rect (r ≤ 0) or empty.
    pub fn xy(rect: [f32; 4], rx: f32, ry: f32) -> RRect {
        let (w, h) = (rect[2] - rect[0], rect[3] - rect[1]);
        let (mut rx, mut ry) = (rx, ry);
        if !(rx > 0.0 && ry > 0.0) || w <= 0.0 || h <= 0.0 {
            return RRect { rect, radii: [[0.0; 2]; 4] };
        }
        if w < rx + rx || h < ry + ry {
            let scale = (w / (rx + rx)).min(h / (ry + ry));
            rx *= scale;
            ry *= scale;
        }
        let (hw, hh) = (w * 0.5, h * 0.5);
        if rx >= hw && ry >= hh {
            // An oval.
            return RRect { rect, radii: [[hw, hh]; 4] };
        }
        RRect { rect, radii: [[rx, ry]; 4] }
    }
    /// `SkRRect::MakeOval`.
    pub fn oval(rect: [f32; 4]) -> RRect {
        let (hw, hh) = ((rect[2] - rect[0]) * 0.5, (rect[3] - rect[1]) * 0.5);
        RRect { rect, radii: [[hw, hh]; 4] }
    }
    pub fn is_rect(&self) -> bool {
        self.radii.iter().all(|r| r[0] == 0.0 || r[1] == 0.0)
    }
    pub fn is_empty(&self) -> bool {
        !(self.width() > 0.0 && self.height() > 0.0)
    }
    /// `SkRRectPriv::AllCornersRelativelyCircular`.
    pub fn all_corners_circular(&self, tol: f32) -> bool {
        self.radii.iter().all(|r| is_relatively_circular(r[0], r[1], tol))
    }
    /// `SkRRect::transform` under a rect-stays-rect matrix (scale, translate, 90° turns, mirrors).
    pub fn transform(&self, xf: &Xf) -> Option<RRect> {
        let [a, b, c, d, ..] = xf.m.0;
        let rect = xf.map_rect(self.rect);
        let swap = a == 0.0;
        let (sx, sy) = if swap { (c, b) } else { (a, d) };
        // Radii scale by |s| (swapped for a 90° turn); the corners permute with the mirrors.
        let mut radii = self.radii.map(|r| if swap { [(r[1] * sx).abs(), (r[0] * sy).abs()] } else { [(r[0] * sx).abs(), (r[1] * sy).abs()] });
        let (flip_x, flip_y) = if swap { (c < 0.0, b < 0.0) } else { (a < 0.0, d < 0.0) };
        if swap {
            // (x, y) → (c y, b x): TL goes to TL when both positive... corner (sx', sy') of the
            // source corner (u, v) is (sign c · v, sign b · u).
            let src = radii;
            for (i, (u, v)) in [(-1, -1), (1, -1), (1, 1), (-1, 1)].into_iter().enumerate() {
                let (x, y) = (if c < 0.0 { -v } else { v }, if b < 0.0 { -u } else { u });
                radii[corner_index(x, y)] = src[i];
            }
        } else if flip_x || flip_y {
            let src = radii;
            for (i, (u, v)) in [(-1, -1), (1, -1), (1, 1), (-1, 1)].into_iter().enumerate() {
                let (x, y) = (if flip_x { -u } else { u }, if flip_y { -v } else { v });
                radii[corner_index(x, y)] = src[i];
            }
        }
        let rr = RRect { rect, radii };
        (!rr.is_empty()).then_some(rr)
    }
    /// `SkRRectPriv::InnerBounds`.
    pub fn inner_bounds(&self) -> [f32; 4] {
        if self.is_empty() || self.is_rect() {
            return self.rect;
        }
        let [l, t, r, b] = self.rect;
        let [tl, tr, br, bl] = self.radii;
        let left = tl[0].max(bl[0]);
        let top = tl[1].max(tr[1]);
        let right = tr[0].max(br[0]);
        let bottom = bl[1].max(br[1]);
        let (dw, dh) = (left + right, top + bottom);
        let (w, h) = (r - l, b - t);
        let horiz = (w - dw) * h;
        let vert = (h - dh) * w;
        const K: f32 = (1.0 - std::f32::consts::FRAC_1_SQRT_2) + 1e-5;
        let inner = (w - K * dw) * (h - K * dh);
        if horiz > vert && horiz > inner {
            [l + left, t, r - right, b]
        } else if vert > inner {
            [l, t + top, r, b - bottom]
        } else {
            [l + K * left, t + K * top, r - K * right, b - K * bottom]
        }
    }
    /// `SkRRect::checkCornerContainment`.
    fn corner_contains(&self, x: f32, y: f32) -> bool {
        let [l, t, r, b] = self.rect;
        let [tl, tr, br, bl] = self.radii;
        let (cx, cy, rad) = if x < l + tl[0] && y < t + tl[1] {
            (x - (l + tl[0]), y - (t + tl[1]), tl)
        } else if x < l + bl[0] && y > b - bl[1] {
            (x - (l + bl[0]), y - (b - bl[1]), bl)
        } else if x > r - tr[0] && y < t + tr[1] {
            (x - (r - tr[0]), y - (t + tr[1]), tr)
        } else if x > r - br[0] && y > b - br[1] {
            (x - (r - br[0]), y - (b - br[1]), br)
        } else {
            return true;
        };
        let (rx2, ry2) = (rad[0] * rad[0], rad[1] * rad[1]);
        cx * cx * ry2 + cy * cy * rx2 <= rx2 * ry2
    }
}

fn corner_index(x: i32, y: i32) -> usize {
    match (x, y) {
        (-1, -1) => 0,
        (1, -1) => 1,
        (1, 1) => 2,
        _ => 3,
    }
}

/// `SkRRectPriv::IsRelativelyCircular` (non-legacy).
pub(crate) fn is_relatively_circular(rx: f32, ry: f32, tol: f32) -> bool {
    (rx <= tol && ry <= tol) || (rx - ry).abs() <= tol * rx.max(ry)
}

/// `SkRRectPriv::ConservativeIntersect`: the intersection as an rrect, or `None`.
pub(crate) fn conservative_intersect(a: &RRect, b: &RRect) -> Option<RRect> {
    let rect = [a.rect[0].max(b.rect[0]), a.rect[1].max(b.rect[1]), a.rect[2].min(b.rect[2]), a.rect[3].min(b.rect[3])];
    if !(rect[0] < rect[2] && rect[1] < rect[3]) {
        return None;
    }
    let corner = |r: &[f32; 4], i: usize| match i {
        0 => (r[0], r[1]),
        1 => (r[2], r[1]),
        2 => (r[2], r[3]),
        _ => (r[0], r[3]),
    };
    let inside = |i: usize, p: (f32, f32), q: (f32, f32)| match i {
        0 => p.0 >= q.0 && p.1 >= q.1,
        1 => p.0 <= q.0 && p.1 >= q.1,
        2 => p.0 <= q.0 && p.1 <= q.1,
        _ => p.0 >= q.0 && p.1 <= q.1,
    };
    let mut radii = [[0.0f32; 2]; 4];
    for (i, out) in radii.iter_mut().enumerate() {
        let test = corner(&rect, i);
        let (ac, bc) = (corner(&a.rect, i), corner(&b.rect, i));
        let (ar, br) = (a.radii[i], b.radii[i]);
        let ok = if test == ac && test == bc {
            if ar[0] >= br[0] && ar[1] >= br[1] {
                *out = ar;
                true
            } else if br[0] >= ar[0] && br[1] >= ar[1] {
                *out = br;
                true
            } else {
                false
            }
        } else if test == ac {
            *out = ar;
            if ar == br { inside(i, ac, bc) } else { b.corner_contains(ac.0, ac.1) }
        } else if test == bc {
            *out = br;
            if br == ar { inside(i, bc, ac) } else { a.corner_contains(bc.0, bc.1) }
        } else {
            a.corner_contains(test.0, test.1) && b.corner_contains(test.0, test.1)
        };
        if !ok {
            return None;
        }
    }
    let rr = RRect { rect, radii };
    // AreRectAndRadiiValid + no scaling needed.
    let (w, h) = (rr.width(), rr.height());
    if radii[0][0] + radii[1][0] > w || radii[3][0] + radii[2][0] > w || radii[0][1] + radii[3][1] > h || radii[1][1] + radii[2][1] > h {
        return None;
    }
    Some(rr)
}

// ---------------------------------------------------------------------------------------------
// AnalyticRRectRenderStep's instance

/// One AnalyticRRectRenderStep instance, as `writeVertices` writes it, plus the transform, the
/// draw's depth and its paint.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RRectInstance {
    /// `xRadiiOrFlags`.
    pub xr: [f32; 4],
    /// `radiiOrQuadXs`.
    pub rq: [f32; 4],
    /// `ltrbOrQuadYs`.
    pub lq: [f32; 4],
    /// `center` (xy), `centerWeight`, local AA radius (or −1).
    pub center: [f32; 4],
    /// Columns of the 3×3 local-to-device matrix.
    pub mat: [[f32; 3]; 3],
    /// The draw's depth.
    pub depth: f32,
    /// The paint's index.
    pub paint: u32,
}

/// A shape the analytic step draws.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Simple {
    Rect([f32; 4]),
    RRect(RRect),
    Line(Point, Point),
}

impl Simple {
    /// `Shape::bounds`.
    pub fn bounds(&self) -> [f32; 4] {
        match *self {
            Simple::Rect(r) => r,
            Simple::RRect(rr) => rr.rect,
            Simple::Line(a, b) => [a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y)],
        }
    }
}

/// How a stroke is drawn: `StrokeStyle` (half width, join limit: miter limit > 0, 0 bevel, −1
/// round) and its cap (0 butt, 1 round, 2 square).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Stroke {
    pub half_width: f32,
    pub join_limit: f32,
    pub cap: u8,
}

const SOLID_INTERIOR: f32 = 1.0;
const STROKE_INTERIOR: f32 = 0.0;
const FILLED_STROKE_INTERIOR: f32 = -1.0;
const COMPLEX_AA_INSETS: f32 = -1.0;

/// `AnalyticRRectRenderStep::writeVertices` for a shape (not an EdgeAAQuad).
pub(crate) fn rrect_instance(shape: &Simple, stroke: Option<Stroke>, xf: &Xf, depth: f32, paint: u32) -> RRectInstance {
    let bounds = shape.bounds();
    let mut aa_radius = xf.local_aa_radius();
    let mut stroke_inset = 0.0;
    let mut center_weight = SOLID_INTERIOR;
    let (xr, rq, lq);
    let size = |b: [f32; 4]| [b[2] - b[0], b[3] - b[1]];
    let load_x = |rr: &RRect| [rr.radii[0][0], rr.radii[1][0], rr.radii[2][0], rr.radii[3][0]];
    let load_y = |rr: &RRect| [rr.radii[0][1], rr.radii[1][1], rr.radii[2][1], rr.radii[3][1]];
    match stroke {
        Some(s) => {
            let stroke_radius = s.half_width;
            let sz = match *shape {
                Simple::Line(a, b) => [(b - a).length(), 0.0],
                _ => size(bounds),
            };
            let gap = [sz[0] - 2.0 * s.half_width, sz[1] - 2.0 * s.half_width];
            if (gap[0] <= 0.0 || gap[1] <= 0.0) && stroke_radius > 0.0 {
                stroke_inset = -stroke_radius;
            } else {
                center_weight = STROKE_INTERIOR;
                stroke_inset = stroke_radius;
            }
            let x_radii = match shape {
                Simple::RRect(rr) => load_x(rr),
                _ => [0.0; 4],
            };
            let is_line = matches!(shape, Simple::Line(..));
            if stroke_radius > 0.0 || is_line {
                let mut join = s.join_limit;
                let empty = [sz[0] == 0.0, sz[1] == 0.0];
                if is_line || (empty[0] && empty[1]) {
                    join = match s.cap {
                        1 => -1.0,
                        0 => 0.0,
                        _ => 1.0,
                    };
                } else if s.join_limit > 0.0 {
                    join = if s.join_limit < std::f32::consts::SQRT_2 || empty[0] || empty[1] { 0.0 } else { 1.0 };
                }
                xr = [-2.0, if is_line { 1.0 } else { 0.0 }, stroke_radius, join];
                rq = x_radii;
                lq = match *shape {
                    Simple::Line(a, b) => [a.x, a.y, b.x, b.y],
                    _ => bounds,
                };
            } else {
                let y_radii = match shape {
                    Simple::RRect(rr) => load_y(rr),
                    _ => [0.0; 4],
                };
                xr = x_radii.map(|r| -2.0 - r);
                rq = y_radii;
                lq = bounds;
            }
        }
        None => match shape {
            Simple::Rect(_) => {
                xr = [-1.0; 4];
                rq = [bounds[0], bounds[2], bounds[2], bounds[0]];
                lq = [bounds[1], bounds[1], bounds[3], bounds[3]];
            }
            Simple::RRect(rr) if rr.is_rect() => {
                xr = [-1.0; 4];
                rq = [bounds[0], bounds[2], bounds[2], bounds[0]];
                lq = [bounds[1], bounds[1], bounds[3], bounds[3]];
            }
            Simple::RRect(rr) => {
                xr = load_x(rr);
                rq = load_y(rr);
                lq = bounds;
            }
            Simple::Line(..) => unreachable!("a filled line draws nothing"),
        },
    }
    // opposite_insets_intersect
    let intersect = match *shape {
        Simple::Line(..) => stroke_inset <= aa_radius,
        Simple::Rect(r) => {
            let s = size(r);
            s[0] <= 2.0 * (stroke_inset + aa_radius) || s[1] <= 2.0 * (stroke_inset + aa_radius)
        }
        Simple::RRect(rr) => {
            let m = stroke_inset + 2.0 * aa_radius;
            let (w, h) = (rr.width(), rr.height());
            rr.radii.iter().any(|r| m >= w - r[0] || m >= h - r[1])
        }
    };
    if intersect {
        aa_radius = COMPLEX_AA_INSETS;
        if center_weight == STROKE_INTERIOR {
            center_weight = FILLED_STROKE_INTERIOR;
        }
    }
    let [a, b, c, d, e, f] = xf.m.0;
    RRectInstance {
        xr,
        rq,
        lq,
        center: [(bounds[0] + bounds[2]) * 0.5, (bounds[1] + bounds[3]) * 0.5, center_weight, aa_radius],
        mat: [[a, b, 0.0], [c, d, 0.0], [e, f, 1.0]],
        depth,
        paint,
    }
}

// ---------------------------------------------------------------------------------------------
// Path tessellation (TessellateWedgesRenderStep)

/// A path verb in local coordinates, conics included (Skia's circles and arcs are conics).
#[derive(Clone, Copy, Debug)]
pub(crate) enum Verb {
    Move(Point),
    Line(Point),
    Quad(Point, Point),
    Conic(Point, Point, f32),
    Cubic(Point, Point, Point),
    Close,
}

const PRECISION: f32 = 4.0;
const MAX_RESOLVE_LEVEL: i32 = 5;
const MAX_SEGMENTS_P4: f32 = 32.0 * 32.0 * 32.0 * 32.0;
const MAX_SEGMENTS_PER_CURVE_P4: f32 = 1024.0 * 1024.0 * 1024.0 * 1024.0;

fn sub(a: Point, b: Point) -> [f32; 2] {
    [a.x - b.x, a.y - b.y]
}
fn mix(a: Point, b: Point, t: f32) -> Point {
    point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
}

/// The 2×2 of the matrix applied to a vector (`VectorXform`).
fn vx(m: &Matrix, v: [f32; 2]) -> [f32; 2] {
    let [a, b, c, d, ..] = m.0;
    [a * v[0] + c * v[1], b * v[0] + d * v[1]]
}

/// `wangs_formula::cubic_p4` with precision 4.
fn cubic_p4(m: &Matrix, p0: Point, p1: Point, p2: Point, p3: Point) -> f32 {
    let v0 = vx(m, [-2.0 * p1.x + p0.x + p2.x, -2.0 * p1.y + p0.y + p2.y]);
    let v1 = vx(m, [-2.0 * p2.x + p1.x + p3.x, -2.0 * p2.y + p1.y + p3.y]);
    // length_term_p2<3>(4) = (3·2/8 · 4)² = 9.
    (v0[0] * v0[0] + v0[1] * v0[1]).max(v1[0] * v1[0] + v1[1] * v1[1]) * 9.0
}
/// `wangs_formula::quadratic_p4` with precision 4.
fn quad_p4(m: &Matrix, p0: Point, p1: Point, p2: Point) -> f32 {
    let v = vx(m, [-2.0 * p1.x + p0.x + p2.x, -2.0 * p1.y + p0.y + p2.y]);
    // length_term_p2<2>(4) = (2·1/8 · 4)² = 1.
    v[0] * v[0] + v[1] * v[1]
}
/// `wangs_formula::conic_p2` with precision 4 (points mapped by the 2×2 first).
fn conic_p2(m: &Matrix, p0: Point, p1: Point, p2: Point, w: f32) -> f32 {
    let [p0, p1, p2] = [p0, p1, p2].map(|p| vx(m, [p.x, p.y]));
    conic_p2_mapped(p0, p1, p2, w)
}
fn conic_p2_mapped(p0: [f32; 2], p1: [f32; 2], p2: [f32; 2], w: f32) -> f32 {
    let c = [(p0[0].min(p1[0]).min(p2[0]) + p0[0].max(p1[0]).max(p2[0])) * 0.5, (p0[1].min(p1[1]).min(p2[1]) + p0[1].max(p1[1]).max(p2[1])) * 0.5];
    let [p0, p1, p2] = [p0, p1, p2].map(|p| [p[0] - c[0], p[1] - c[1]]);
    let dot = |p: [f32; 2]| p[0] * p[0] + p[1] * p[1];
    let max_len = dot(p0).max(dot(p1)).max(dot(p2)).sqrt();
    let dp = [-2.0 * w * p1[0] + p0[0] + p2[0], -2.0 * w * p1[1] + p0[1] + p2[1]];
    let dw = (-2.0 * w + 2.0).abs();
    let rp_minus_1 = (max_len * PRECISION - 1.0).max(0.0);
    let numer = dot(dp).sqrt() * PRECISION + rp_minus_1 * dw;
    let denom = 4.0 * w.min(1.0);
    numer / denom
}

/// A patch as the shader receives it: a cubic (w < 0) or a conic (p3 = (w, ∞)).
#[derive(Clone, Copy, Debug)]
struct Patch {
    p: [Point; 4],
    w: f32,
}

/// `$wangs_formula_cubic_log2` / `$wangs_formula_conic_log2` as the vertex shader evaluates
/// them (`fma` is a plain multiply-add here).
fn shader_level(m: &Matrix, patch: &Patch) -> i32 {
    let level = if patch.w >= 0.0 {
        let [p0, p1, p2] = [patch.p[0], patch.p[1], patch.p[2]].map(|p| vx(m, [p.x, p.y]));
        let n2 = conic_p2_mapped(p0, p1, p2, patch.w);
        (n2.max(1.0).log2() * 0.5).ceil()
    } else {
        let [p0, p1, p2, p3] = patch.p;
        let d0 = vx(m, [-2.0 * p1.x + p2.x + p0.x, -2.0 * p1.y + p2.y + p0.y]);
        let d1 = vx(m, [-2.0 * p2.x + p3.x + p1.x, -2.0 * p2.y + p3.y + p1.y]);
        let mm = (d0[0] * d0[0] + d0[1] * d0[1]).max(d1[0] * d1[0] + d1[1] * d1[1]);
        // kLengthTermPow2 = 9.
        ((9.0 * mm).max(1.0).log2() * 0.25).ceil()
    };
    (level as i32).clamp(0, MAX_RESOLVE_LEVEL)
}

/// `tessellate_filled_curve`'s points for one patch, after its first (p0): appended in local
/// coordinates.
fn patch_points(m: &Matrix, patch: &Patch, out: &mut impl FnMut(Point)) {
    let level = shader_level(m, patch);
    let n = 1 << level;
    let [p0, p1, p2, p3] = patch.p;
    let (w, p1, p3) = if patch.w >= 0.0 { (patch.w, point(p1.x * patch.w, p1.y * patch.w), p2) } else { (-1.0, p1, p3) };
    for k in 1..=n {
        let fixed = (0.5 + (k << (MAX_RESOLVE_LEVEL - level)) as f32).floor();
        if fixed > 0.0 && fixed < 32.0 {
            let t = fixed * (1.0 / 32.0);
            let ab = mix(p0, p1, t);
            let bc = mix(p1, p2, t);
            let cd = mix(p2, p3, t);
            let abc = mix(ab, bc, t);
            let bcd = mix(bc, cd, t);
            let abcd = mix(abc, bcd, t);
            let u = 1.0 + (w - 1.0) * t;
            let v = w + 1.0 - u;
            let uv = u + (v - u) * t;
            out(if w < 0.0 { abcd } else { point(abc.x / uv, abc.y / uv) });
        } else {
            out(if fixed == 0.0 { p0 } else { p3 });
        }
    }
}

/// `PatchWriter::accountForCurve`: 0 (no chop) or the number of patches.
fn chops(n4: f32) -> i32 {
    if n4 <= MAX_SEGMENTS_P4 {
        0
    } else {
        ((n4.min(MAX_SEGMENTS_PER_CURVE_P4) / MAX_SEGMENTS_P4).sqrt().sqrt()).ceil() as i32
    }
}

fn cubic_patch(p0: Point, p1: Point, p2: Point, p3: Point) -> Patch {
    Patch { p: [p0, p1, p2, p3], w: -1.0 }
}
fn quad_patch(p0: Point, p1: Point, p2: Point) -> Patch {
    cubic_patch(p0, mix(p0, p1, 2.0 / 3.0), mix(p2, p1, 2.0 / 3.0), p2)
}

/// Writes a cubic as `PatchWriter::writeCubic` does (chopping when it needs > 32 segments).
fn write_cubic(m: &Matrix, p0: Point, p1: Point, p2: Point, p3: Point, emit: &mut impl FnMut(&Patch)) {
    let n = chops(cubic_p4(m, p0, p1, p2, p3));
    if n == 0 {
        return emit(&cubic_patch(p0, p1, p2, p3));
    }
    let (mut p0, mut p1, mut p2) = (p0, p1, p2);
    let mut left = n;
    while left >= 3 {
        let (t1, t2) = (1.0 / left as f32, 2.0 / left as f32);
        let ab = (mix(p0, p1, t1), mix(p0, p1, t2));
        let bc = (mix(p1, p2, t1), mix(p1, p2, t2));
        let cd = (mix(p2, p3, t1), mix(p2, p3, t2));
        let abc = (mix(ab.0, bc.0, t1), mix(ab.1, bc.1, t2));
        let bcd = (mix(bc.0, cd.0, t1), mix(bc.1, cd.1, t2));
        let abcd = (mix(abc.0, bcd.0, t1), mix(abc.1, bcd.1, t2));
        let middle = (mix(abc.0, bcd.0, t2), mix(abc.1, bcd.1, t1));
        emit(&cubic_patch(p0, ab.0, abc.0, abcd.0));
        emit(&cubic_patch(abcd.0, middle.0, middle.1, abcd.1));
        (p0, p1, p2) = (abcd.1, bcd.1, cd.1);
        left -= 2;
    }
    if left == 2 {
        let ab = mix(p0, p1, 0.5);
        let bc = mix(p1, p2, 0.5);
        let cd = mix(p2, p3, 0.5);
        let abc = mix(ab, bc, 0.5);
        let bcd = mix(bc, cd, 0.5);
        let abcd = mix(abc, bcd, 0.5);
        emit(&cubic_patch(p0, ab, abc, abcd));
        emit(&cubic_patch(abcd, bcd, cd, p3));
    } else {
        emit(&cubic_patch(p0, p1, p2, p3));
    }
}

fn write_quad(m: &Matrix, p0: Point, p1: Point, p2: Point, emit: &mut impl FnMut(&Patch)) {
    let n = chops(quad_p4(m, p0, p1, p2));
    if n == 0 {
        return emit(&quad_patch(p0, p1, p2));
    }
    let (mut p0, mut p1) = (p0, p1);
    let mut left = n;
    while left >= 3 {
        let (t1, t2) = (1.0 / left as f32, 2.0 / left as f32);
        let ab = (mix(p0, p1, t1), mix(p0, p1, t2));
        let bc = (mix(p1, p2, t1), mix(p1, p2, t2));
        let abc = (mix(ab.0, bc.0, t1), mix(ab.1, bc.1, t2));
        let tm = (t1 + (t2 - t1) * (2.0 / 3.0), t2 + (t1 - t2) * (2.0 / 3.0));
        let middle = (mix(ab.0, bc.0, tm.0), mix(ab.1, bc.1, tm.1));
        emit(&quad_patch(p0, ab.0, abc.0));
        emit(&cubic_patch(abc.0, middle.0, middle.1, abc.1));
        (p0, p1) = (abc.1, bc.1);
        left -= 2;
    }
    if left == 2 {
        let ab = mix(p0, p1, 0.5);
        let bc = mix(p1, p2, 0.5);
        let abc = mix(ab, bc, 0.5);
        emit(&quad_patch(p0, ab, abc));
        emit(&quad_patch(abc, bc, p2));
    } else {
        emit(&quad_patch(p0, p1, p2));
    }
}

fn write_conic(m: &Matrix, p0: Point, p1: Point, p2: Point, w: f32, emit: &mut impl FnMut(&Patch)) {
    let n2 = conic_p2(m, p0, p1, p2, w);
    let n = chops(n2 * n2);
    if n == 0 {
        return emit(&Patch { p: [p0, p1, p2, p2], w });
    }
    let h = |p: Point, s: f32| [p.x * s, p.y * s, s];
    let (mut h0, mut h1, h2) = (h(p0, 1.0), h(p1, w), h(p2, 1.0));
    let lerp = |a: [f32; 3], b: [f32; 3], t: f32| [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    let proj = |a: [f32; 3]| point(a[0] / a[2], a[1] / a[2]);
    let mut left = n;
    while left >= 2 {
        let t = 1.0 / left as f32;
        let ab = lerp(h0, h1, t);
        let bc = lerp(h1, h2, t);
        let abc = lerp(ab, bc, t);
        let mid = proj(abc);
        emit(&Patch { p: [proj(h0), proj(ab), mid, mid], w: ab[2] / (h0[2] * abc[2]).sqrt() });
        (h0, h1) = (abc, bc);
        left -= 1;
    }
    emit(&Patch { p: [proj(h0), proj(h1), point(h2[0], h2[1]), point(h2[0], h2[1])], w: h1[2] / h0[2].sqrt() });
}

/// One contour flattened as Graphite's wedges flatten it: its device-space points (the start
/// first, the contour closed implicitly) and its fan point (the mean of its on-curve points).
pub(crate) fn flatten(verbs: &[Verb], m: &Matrix, mut contour: impl FnMut(Point, &[Point]), scratch: &mut Vec<Point>) {
    let mut i = 0;
    while i < verbs.len() {
        // A contour: a Move then everything up to the next Move.
        let start = match verbs[i] {
            Verb::Move(p) => p,
            _ => {
                i += 1;
                continue;
            }
        };
        let mut end = i + 1;
        while end < verbs.len() && !matches!(verbs[end], Verb::Move(_)) {
            end += 1;
        }
        // MidpointContourParser: the mean of each verb's last point, plus the start when the
        // contour does not end on it.
        let (mut sum, mut count, mut last) = (point(0.0, 0.0), 0u32, start);
        let mut geometry = false;
        for v in &verbs[i + 1..end] {
            let p = match *v {
                Verb::Line(p) | Verb::Quad(_, p) | Verb::Conic(_, p, _) | Verb::Cubic(_, _, p) => p,
                _ => continue,
            };
            sum = point(sum.x + p.x, sum.y + p.y);
            count += 1;
            last = p;
            geometry = true;
        }
        if !geometry {
            i = end;
            continue;
        }
        if last != start {
            sum = point(sum.x + start.x, sum.y + start.y);
            count += 1;
        }
        let k = 1.0 / count as f32;
        let fan = m.apply(point(sum.x * k, sum.y * k));
        scratch.clear();
        scratch.push(m.apply(start));
        let mut at = start;
        for v in &verbs[i + 1..end] {
            let mut push = |p: &Patch| patch_points(m, p, &mut |q| scratch.push(m.apply(q)));
            match *v {
                Verb::Line(p) => {
                    scratch.push(m.apply(p));
                    at = p;
                }
                Verb::Quad(c, p) => {
                    write_quad(m, at, c, p, &mut push);
                    at = p;
                }
                Verb::Conic(c, p, w) => {
                    write_conic(m, at, c, p, w, &mut push);
                    at = p;
                }
                Verb::Cubic(c1, c2, p) => {
                    write_cubic(m, at, c1, c2, p, &mut push);
                    at = p;
                }
                _ => {}
            }
        }
        contour(fan, scratch);
        i = end;
    }
}

/// `SkPath::RRect(rrect)` (clockwise from the top-left corner's end, conic corners with w =
/// √2/2) as verbs.
pub(crate) fn rrect_verbs(rr: &RRect, out: &mut Vec<Verb>) {
    const W: f32 = std::f32::consts::FRAC_1_SQRT_2;
    let [l, t, r, b] = rr.rect;
    let [tl, tr, br, bl] = rr.radii;
    out.push(Verb::Move(point(l + tl[0], t)));
    out.push(Verb::Line(point(r - tr[0], t)));
    if tr[0] > 0.0 && tr[1] > 0.0 {
        out.push(Verb::Conic(point(r, t), point(r, t + tr[1]), W));
    }
    out.push(Verb::Line(point(r, b - br[1])));
    if br[0] > 0.0 && br[1] > 0.0 {
        out.push(Verb::Conic(point(r, b), point(r - br[0], b), W));
    }
    out.push(Verb::Line(point(l + bl[0], b)));
    if bl[0] > 0.0 && bl[1] > 0.0 {
        out.push(Verb::Conic(point(l, b), point(l, b - bl[1]), W));
    }
    out.push(Verb::Line(point(l, t + tl[1])));
    if tl[0] > 0.0 && tl[1] > 0.0 {
        out.push(Verb::Conic(point(l, t), point(l + tl[0], t), W));
    }
    out.push(Verb::Close);
}

/// The polygon is convex: one contour, every turn the same way.
pub(crate) fn convex(points: &[Point]) -> bool {
    let n = points.len();
    if n < 3 {
        return true;
    }
    let mut sign = 0.0f32;
    let mut turns = 0.0f32;
    for i in 0..n {
        let (a, b, c) = (points[i], points[(i + 1) % n], points[(i + 2) % n]);
        let (e0, e1) = (sub(b, a), sub(c, b));
        let cross = e0[0] * e1[1] - e0[1] * e1[0];
        if cross != 0.0 {
            if sign == 0.0 {
                sign = cross.signum();
            } else if cross.signum() != sign {
                return false;
            }
            turns += cross.atan2(e0[0] * e1[0] + e0[1] * e1[1]);
        }
    }
    turns.abs() < 1.5 * std::f32::consts::TAU
}

// ---------------------------------------------------------------------------------------------
// Analytic clips (ClipStack's can_apply_analytic_clip, non-legacy)

/// `AnalyticClip`: the device-to-local 2×2, the rect (translation folded in), the per-corner
/// radii, already encoded as `sk_analytic_clip` reads them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct AnalyticClip {
    pub xform: [f32; 4],
    pub rect: [f32; 4],
    pub radii_with_inverse: [f32; 4],
}

/// `can_apply_analytic_clip` for an intersect element.
pub(crate) fn analytic_clip(rect: [f32; 4], rr: Option<&RRect>, xf: &Xf) -> Option<AnalyticClip> {
    if xf.kind > Kind::Affine {
        return None;
    }
    let inv = xf.m.invert();
    let [ia, ib, ic, id, ..] = inv.0;
    let xform = [ia, ib, ic, id];
    let [_, _, _, _, e, f] = xf.m.0;
    let tx = xform[0] * e + xform[2] * f;
    let ty = xform[1] * e + xform[3] * f;
    let encode = |radii: [f32; 4]| [(radii[0] + 1.0), (radii[1] + 1.0), -(radii[2] + 1.0), (radii[3] + 1.0)];
    let Some(rr) = rr else {
        return Some(AnalyticClip { xform, rect: [rect[0] + tx, rect[1] + ty, rect[2] + tx, rect[3] + ty], radii_with_inverse: encode([0.0; 4]) });
    };
    let tol = xf.local_aa_radius() * PIXEL_TOLERANCE;
    let mut scale_y: Option<f32> = None;
    let mut radii = [0.0f32; 4];
    for (i, r) in rr.radii.iter().enumerate() {
        let corner_scale = if is_relatively_circular(r[0], r[1], tol) { 1.0 } else { r[0] / r[1] };
        if r[0] < tol || r[1] < tol {
            radii[i] = 0.0;
        } else if let Some(s) = scale_y {
            if (corner_scale - s).abs() > tol {
                return None;
            }
            radii[i] = r[0];
        } else {
            scale_y = Some(corner_scale);
            radii[i] = r[0];
        }
    }
    let mut out = [rr.rect[0] + tx, rr.rect[1] + ty, rr.rect[2] + tx, rr.rect[3] + ty];
    let mut xform = xform;
    if let Some(s) = scale_y.filter(|s| (s - 1.0).abs() > tol) {
        out[1] *= s;
        out[3] *= s;
        xform[1] *= s;
        xform[3] *= s;
    }
    Some(AnalyticClip { xform, rect: out, radii_with_inverse: encode(radii) })
}

// ---------------------------------------------------------------------------------------------
// A CPU reference of the analytic step, for tests and for surfaces that bake a Graphite drawing.

/// The AnalyticRRectRenderStep run on the CPU: its static vertices, `analytic_rrect_vertex_fn`,
/// rasterization at pixel centres (vertices snapped to 1/256 px, the top-left rule, the first
/// triangle of the strip covering a centre winning: the depth test) and
/// `analytic_rrect_coverage_fn`. What a single-sampled Graphite pass writes as coverage.
#[doc(hidden)]
pub mod reference {
    use super::RRectInstance;

    /// The 9 per-corner template vertices: position, normal, normalScale, centerWeight.
    pub const TEMPLATE: [([f32; 2], [f32; 2], f32, f32); 9] = {
        const H: f32 = 0.5 * std::f32::consts::SQRT_2;
        [
            ([1.0, 0.0], [1.0, 0.0], 1.0, 0.0),
            ([1.0, 0.0], [H, H], 1.0, 0.0),
            ([0.0, 1.0], [H, H], 1.0, 0.0),
            ([0.0, 1.0], [0.0, 1.0], 1.0, 0.0),
            ([1.0, 0.0], [H, H], 0.0, 0.0),
            ([0.0, 1.0], [H, H], 0.0, 0.0),
            ([1.0, 0.0], [1.0, 0.0], -1.0, 0.0),
            ([0.0, 1.0], [0.0, 1.0], -1.0, 0.0),
            ([1.0, 0.0], [1.0, 0.0], -1.0, 1.0),
        ]
    };

    /// The 69-index strip.
    #[rustfmt::skip]
    pub const INDICES: [u16; 69] = {
        const TL: u16 = 0; const TR: u16 = 9; const BR: u16 = 18; const BL: u16 = 27;
        [
            TL, TL+4, TL+1, TL+5, TL+2, TL+3, TL+5,
            TR, TR+4, TR+1, TR+5, TR+2, TR+3, TR+5,
            BR, BR+4, BR+1, BR+5, BR+2, BR+3, BR+5,
            BL, BL+4, BL+1, BL+5, BL+2, BL+3, BL+5,
            TL, TL+4,
            TL+4, TL+6, TL+5, TL+7,
            TR+4, TR+6, TR+5, TR+7,
            BR+4, BR+6, BR+5, BR+7,
            BL+4, BL+6, BL+5, BL+7,
            TL+4, TL+6,
            TL+6, TL+8, TL+7, TL+7, TR+8,
            TR+6, TR+8, TR+7, TR+7, BR+8,
            BR+6, BR+8, BR+7, BR+7, BL+8,
            BL+6, BL+8, BL+7, BL+7, TL+8,
            TL+6,
        ]
    };

    /// A vertex's outputs: device position, then the varyings.
    #[derive(Clone, Copy, Debug, Default)]
    pub struct Varyings {
        pub pos: [f32; 2],
        pub jacobian: [f32; 4],
        pub edge: [f32; 4],
        pub x_radii: [f32; 4],
        pub y_radii: [f32; 4],
        pub stroke: [f32; 2],
        pub ppc: [f32; 2],
        pub local: [f32; 2],
    }

    type V2 = [f32; 2];
    type V4 = [f32; 4];
    fn rot(v: V4) -> V4 {
        // .wxyz
        [v[3], v[0], v[1], v[2]]
    }
    fn rot2(v: V4) -> V4 {
        // .yzwx
        [v[1], v[2], v[3], v[0]]
    }
    fn perp(v: V2) -> V2 {
        [-v[1], v[0]]
    }
    fn norm(v: V2) -> V2 {
        let l = 1.0 / (v[0] * v[0] + v[1] * v[1]).sqrt();
        [v[0] * l, v[1] * l]
    }
    /// v * M (row vector), M column-major [c0.x, c0.y, c1.x, c1.y].
    fn vm(v: V2, m: V4) -> V2 {
        [v[0] * m[0] + v[1] * m[1], v[0] * m[2] + v[1] * m[3]]
    }

    /// `analytic_rrect_vertex_fn`.
    pub fn vertex(corner: usize, t: ([f32; 2], [f32; 2], f32, f32), inst: &RRectInstance) -> Varyings {
        let (position, normal, normal_scale, center_weight) = t;
        let next = (corner + 1) % 4;
        let (xrf, rq, lq, center) = (inst.xr, inst.rq, inst.lq, inst.center);
        let bidirectional = center[2] <= 0.0;
        let mut device_space = false;
        let (xs, ys);
        let mut edge_aa = [1.0f32; 4];
        let mut stroked_line = false;
        let (x_radii, y_radii, mut stroke_params);
        let mut join_scale = 1.0f32;
        const ROUND: f32 = 0.414_213_57;
        if xrf[0] < -1.0 {
            stroked_line = xrf[1] > 0.0;
            xs = if stroked_line { [lq[0], lq[0], lq[2], lq[2]] } else { [lq[0], lq[2], lq[2], lq[0]] };
            ys = [lq[1], lq[1], lq[3], lq[3]];
            if xrf[1] < 0.0 {
                x_radii = xrf.map(|v| -v - 2.0);
                y_radii = rq;
                stroke_params = [0.0, 1.0];
            } else {
                x_radii = rq;
                y_radii = x_radii;
                stroke_params = [xrf[2], xrf[3]];
                join_scale = if stroke_params[1] < 0.0 { ROUND } else { stroke_params[1].signum() * (stroke_params[1] != 0.0) as i32 as f32 };
            }
        } else if xrf.iter().any(|v| *v > 0.0) {
            xs = [lq[0], lq[2], lq[2], lq[0]];
            ys = [lq[1], lq[1], lq[3], lq[3]];
            x_radii = xrf;
            y_radii = rq;
            stroke_params = [0.0, -1.0];
        } else {
            xs = rq;
            ys = lq;
            edge_aa = xrf.map(|v| -v);
            x_radii = [0.0; 4];
            y_radii = [0.0; 4];
            stroke_params = [0.0, 1.0];
            device_space = true;
        }
        let mut corner_radii = [x_radii[corner], y_radii[corner]];
        if corner % 2 != 0 {
            corner_radii = [corner_radii[1], corner_radii[0]];
        }
        let mut aspect = [1.0f32, 1.0];
        if corner_radii[0] > 0.0 && corner_radii[1] > 0.0 {
            join_scale = ROUND;
            aspect = [corner_radii[1], corner_radii[0]];
        }
        let mut dx: V4 = std::array::from_fn(|i| xs[i] - rot(xs)[i]);
        let mut dy: V4 = std::array::from_fn(|i| ys[i] - rot(ys)[i]);
        let inv_mag: V4 = std::array::from_fn(|i| 1.0 / dx[i].abs().max(dy[i].abs().max(1.0)));
        for i in 0..4 {
            dx[i] *= inv_mag[i];
            dy[i] *= inv_mag[i];
        }
        let mut sq: V4 = std::array::from_fn(|i| dx[i] * dx[i] + dy[i] * dy[i]);
        let mask: V4 = sq.map(|v| if v > 0.0 { 1.0 } else { 0.0 });
        let mut edge_bias = [0.0f32; 4];
        let mut stroke_radius = [stroke_params[0]; 2];
        if mask.iter().any(|m| *m == 0.0) {
            if mask.iter().all(|m| *m == 0.0) {
                dx = [0.0, 1.0, 0.0, -1.0];
                dy = [-1.0, 0.0, 1.0, 0.0];
                sq = [1.0; 4];
            } else {
                let triangle = mask.iter().sum::<f32>() > 2.5;
                let ex = if triangle { rot2(dx) } else { rot2(dy) };
                let ey = if triangle { rot2(dy) } else { rot2(dx).map(|v| -v) };
                let mix = |a: V4, b: V4| -> V4 { std::array::from_fn(|i| a[i] + (b[i] - a[i]) * mask[i]) };
                dx = mix(ex, dx);
                dy = mix(ey, dy);
                sq = mix(rot2(sq), sq);
                edge_aa = mix(rot2(edge_aa), edge_aa);
                if !triangle && join_scale == 0.0 {
                    stroke_radius = [stroke_radius[0] * mask[corner], stroke_radius[1] * mask[next]];
                    edge_bias = mask.map(|m| (m - 1.0) * stroke_params[0]);
                    stroke_params[1] = 1.0;
                    join_scale = 1.0;
                }
            }
        }
        for i in 0..4 {
            let inv = 1.0 / sq[i].sqrt();
            dx[i] *= inv;
            dy[i] *= inv;
        }
        let x_axis = [-dx[next], -dy[next]];
        let y_axis = [dx[corner], dy[corner]];
        let mut local = [0.0f32; 2];
        let mut snap = false;
        if normal_scale < 0.0 {
            if center[3] < 0.0 || center_weight * center[2] != 0.0 {
                snap = true;
            } else {
                let aa = center[3];
                let s = if bidirectional { -1.0 } else { 1.0 };
                let inset = [corner_radii[0] + s * stroke_radius[0], corner_radii[1] + s * stroke_radius[1]];
                if join_scale == 1.0 || inset[0] <= aa || inset[1] <= aa {
                    local = [inset[0] - aa, inset[1] - aa];
                } else {
                    local = [inset[0] * position[0] - aa * normal[0], inset[1] * position[1] - aa * normal[1]];
                }
            }
        } else {
            local = [
                (corner_radii[0] + stroke_radius[0]) * (position[0] + join_scale * position[1]),
                (corner_radii[1] + stroke_radius[1]) * (position[1] + join_scale * position[0]),
            ];
        }
        if snap {
            local = [center[0], center[1]];
        } else {
            local = [local[0] - corner_radii[0], local[1] - corner_radii[1]];
            local = [xs[corner] + x_axis[0] * local[0] + y_axis[0] * local[1], ys[corner] + x_axis[1] * local[0] + y_axis[1] * local[1]];
        }
        let mut edge: V4 = std::array::from_fn(|i| dy[i] * (xs[i] - local[0]) - dx[i] * (ys[i] - local[1]) + edge_bias[i]);
        let [m0, m1, m2] = inst.mat;
        // inverse of the 3×3 (columns m0, m1, m2).
        let inv = inverse3([m0, m1, m2]);
        let dev3 = [
            m0[0] * local[0] + m1[0] * local[1] + m2[0],
            m0[1] * local[0] + m1[1] * local[1] + m2[1],
            m0[2] * local[0] + m1[2] * local[1] + m2[2],
        ];
        let mut jac = [inv[0][0] - inv[0][2] * local[0], inv[0][1] - inv[0][2] * local[1], inv[1][0] - inv[1][2] * local[0], inv[1][1] - inv[1][2] * local[1]];
        let mut ppc = [0.0f32; 2];
        if device_space {
            let gx: V4 = std::array::from_fn(|i| -dy[i] * (inv[0][0] - inv[0][2] * xs[i]) + dx[i] * (inv[0][1] - inv[0][2] * ys[i]));
            let gy: V4 = std::array::from_fn(|i| -dy[i] * (inv[1][0] - inv[1][2] * xs[i]) + dx[i] * (inv[1][1] - inv[1][2] * ys[i]));
            for i in 0..4 {
                edge[i] *= 1.0 / (gx[i] * gx[i] + gy[i] * gy[i]).sqrt();
                edge[i] += (1.0 - edge_aa[i]) * dev3[2].abs();
            }
            let dotv: f32 = (0..4).map(|i| (dx[i] * rot2(dx)[i] + dy[i] * rot2(dy)[i]).abs()).sum();
            let subpixel = edge_aa == [1.0; 4] && dotv < 0.00024;
            ppc[1] = if subpixel {
                let dim = [edge[0] + edge[2], edge[1] + edge[3]];
                1.0 + dim[0].min(dim[1]).min(dev3[2].abs())
            } else {
                1.0 + dev3[2].abs()
            };
        }
        let mut dev = [dev3[0], dev3[1]];
        if normal_scale > 0.0 && dev3[2] > 0.0 {
            let j = jac;
            let eaan = [edge_aa[corner] * normal[0], edge_aa[next] * normal[1]];
            let px = vm(perp([-y_axis[0], -y_axis[1]]), j);
            let py = vm(perp(x_axis), j);
            let mut nx = [aspect[0] * eaan[0] * px[0], aspect[0] * eaan[0] * px[1]];
            let mut ny = [aspect[1] * eaan[1] * py[0], aspect[1] * eaan[1] * py[1]];
            let mid = eaan[0] != 0.0 && eaan[1] != 0.0;
            if join_scale == 1.0 && mid {
                nx = norm(nx);
                ny = norm(ny);
                if nx[0] * ny[0] + nx[1] * ny[1] < -0.8 {
                    let s = (nx[0] * ny[1] - nx[1] * ny[0]).signum();
                    let (a, b) = (perp(nx), perp(ny));
                    nx = [s * a[0], s * a[1]];
                    ny = [-s * b[0], -s * b[1]];
                }
            }
            let n = norm([nx[0] + ny[0], nx[1] + ny[1]]);
            dev = [dev[0] + dev3[2] * n[0], dev[1] + dev3[2] * n[1]];
            if device_space {
                for e in edge.iter_mut() {
                    *e -= dev3[2];
                }
            } else {
                ppc[1] = -dev3[2];
            }
        } else if !device_space {
            ppc[1] = 0.0;
        }
        ppc[0] = if center_weight != 0.0 { 1.0 } else if bidirectional { -1.0 } else { 0.0 };
        if stroked_line {
            // J' = float2x2(dy0, -dy1, -dx0, dx1) * J (column-major).
            let b = [dy[0], -dy[1], -dx[0], dx[1]];
            let a = jac;
            jac = [b[0] * a[0] + b[2] * a[1], b[1] * a[0] + b[3] * a[1], b[0] * a[2] + b[2] * a[3], b[1] * a[2] + b[3] * a[3]];
        }
        Varyings { pos: dev, jacobian: jac, edge, x_radii, y_radii, stroke: stroke_params, ppc, local }
    }

    fn inverse3(m: [[f32; 3]; 3]) -> [[f32; 3]; 3] {
        // Columns c0, c1, c2; returns columns of the inverse.
        let [a, b, c] = m;
        let (a00, a01, a02) = (a[0], a[1], a[2]);
        let (a10, a11, a12) = (b[0], b[1], b[2]);
        let (a20, a21, a22) = (c[0], c[1], c[2]);
        let b01 = a22 * a11 - a12 * a21;
        let b11 = -a22 * a10 + a12 * a20;
        let b21 = a21 * a10 - a11 * a20;
        let det = a00 * b01 + a01 * b11 + a02 * b21;
        let id = 1.0 / det;
        [
            [b01 * id, (-a22 * a01 + a02 * a21) * id, (a12 * a01 - a02 * a11) * id],
            [b11 * id, (a22 * a00 - a02 * a20) * id, (-a12 * a00 + a02 * a10) * id],
            [b21 * id, (-a21 * a00 + a01 * a20) * id, (a11 * a00 - a01 * a10) * id],
        ]
    }

    fn inv_grad_len(g: V2, j: V4) -> f32 {
        let d = vm(g, j);
        1.0 / (d[0] * d[0] + d[1] * d[1]).sqrt()
    }

    fn elliptical_distance(uv: V2, radii: V2, sr: f32, j: V4) -> V2 {
        let inv_r2 = [1.0 / (radii[0] * radii[0] + sr * sr), 1.0 / (radii[1] * radii[1] + sr * sr)];
        let n = [inv_r2[0] * uv[0], inv_r2[1] * uv[1]];
        let igl = inv_grad_len(n, j);
        let f = 0.5 * igl * (uv[0] * n[0] + uv[1] * n[1] - 1.0);
        let width = radii[0] * sr * inv_r2[0] * igl;
        [width - f, width + f]
    }

    fn corner_distance(d: &mut V2, j: V4, sp: V2, ced: V2, flip: V2, radii: V2) {
        let uv = [radii[0] - ced[0], radii[1] - ced[1]];
        if uv[0] > 0.0 && uv[1] > 0.0 {
            if (radii[0] > 0.0 && radii[1] > 0.0) || (sp[0] > 0.0 && sp[1] < 0.0) {
                let mut e = elliptical_distance([uv[0] * flip[0], uv[1] * flip[1]], radii, sp[0], j);
                e[1] = if radii[0] - sp[0] <= 0.0 { 1.0 } else { -e[1] };
                *d = [d[0].min(e[0]), d[1].min(e[1])];
            } else if sp[1] == 0.0 {
                let bevel = (sp[0] - uv[0] - uv[1]) * inv_grad_len(flip, j);
                d[0] = d[0].min(bevel);
            }
        }
    }

    /// `analytic_rrect_coverage_fn` (w = 1).
    pub fn coverage(v: &Varyings) -> f32 {
        let (j, e, sp, ppc) = (v.jacobian, v.edge, v.stroke, v.ppc);
        let sat = |x: f32| x.clamp(0.0, 1.0);
        if ppc[0] > 0.0 {
            return 1.0;
        }
        if ppc[1] > 1.0 {
            let c = e[0].min(e[2]).min(e[1].min(e[3]));
            let scale = ppc[1] - 1.0;
            let bias = 1.0 - 0.5 * scale;
            return sat(scale * (c + bias));
        }
        let igl = [inv_grad_len([1.0, 0.0], j), inv_grad_len([0.0, 1.0], j)];
        let outer = [igl[0] * (sp[0] + e[0].min(e[2])), igl[1] * (sp[0] + e[1].min(e[3]))];
        let mut d = [outer[0].min(outer[1]), -1.0f32];
        let (scale, bias);
        if ppc[0] > -0.95 {
            let dim = [igl[0] * (e[0] + e[2] + 2.0 * sp[0]), igl[1] * (e[1] + e[3] + 2.0 * sp[0])];
            scale = dim[0].min(dim[1]).min(1.0);
            bias = 1.0 - 0.5 * scale;
        } else {
            let sw = [2.0 * sp[0] * igl[0], 2.0 * sp[0] * igl[1]];
            let inner = [sw[0] - outer[0], sw[1] - outer[1]];
            d[1] = -inner[0].max(inner[1]);
            if sp[0] > 0.0 {
                let narrow = sw[0].min(sw[1]);
                let dim = [if inner[0] >= -0.5 { sw[0] } else { narrow }, if inner[1] >= -0.5 { sw[1] } else { narrow }];
                scale = sat(dim[0].max(dim[1]));
                bias = 1.0 - 0.5 * scale;
            } else {
                scale = 1.0;
                bias = 1.0;
            }
        }
        let (xr, yr) = (v.x_radii, v.y_radii);
        corner_distance(&mut d, j, sp, [e[0], e[1]], [-1.0, -1.0], [xr[0], yr[0]]);
        corner_distance(&mut d, j, sp, [e[2], e[1]], [1.0, -1.0], [xr[1], yr[1]]);
        corner_distance(&mut d, j, sp, [e[2], e[3]], [1.0, 1.0], [xr[2], yr[2]]);
        corner_distance(&mut d, j, sp, [e[0], e[3]], [-1.0, 1.0], [xr[3], yr[3]]);
        let outset = ppc[1].min(0.0);
        sat(scale * ((d[0] + outset).min(-d[1]) + bias))
    }

    /// `sk_analytic_clip` at a device pixel centre.
    pub(crate) fn analytic_clip_alpha(c: &super::AnalyticClip, frag: [f32; 2]) -> f32 {
        let x = c.xform;
        let coords = [x[0] * frag[0] + x[2] * frag[1], x[1] * frag[0] + x[3] * frag[1]];
        let signs = c.radii_with_inverse.map(|v| if v > 0.0 { 1.0 } else if v < 0.0 { -1.0 } else { 0.0 });
        let (scale, bias) = (signs[0], 0.5 * (signs[1] + signs[2]));
        let radii = c.radii_with_inverse.map(|v| v.abs() - 1.0);
        let r = c.rect;
        let lrrl = [r[0], r[2], r[2], r[0]];
        let ttbb = [r[1], r[1], r[3], r[3]];
        let sx = [-1.0, 1.0, 1.0, -1.0];
        let sy = [-1.0, -1.0, 1.0, 1.0];
        let mut dxs: [f32; 4] = std::array::from_fn(|i| coords[0] + sx[i] * radii[i] - lrrl[i]);
        let mut dys: [f32; 4] = std::array::from_fn(|i| coords[1] + sy[i] * radii[i] - ttbb[i]);
        let edge = [dxs[0] >= 0.0 || dys[0] >= 0.0, dxs[1] <= 0.0 || dys[1] >= 0.0, dxs[2] <= 0.0 || dys[2] <= 0.0, dxs[3] >= 0.0 || dys[3] <= 0.0];
        let ex = [-0.5, 0.0, 0.5, 0.0];
        let ey = [0.0, -0.5, 0.0, -0.5];
        let lin = [coords[0] - r[0], coords[1] - r[1], r[2] - coords[0], r[3] - coords[1]];
        let mut alpha = 1.0;
        for i in 0..4 {
            if edge[i] {
                dxs[i] = ex[i];
                dys[i] = ey[i];
            }
            let gx = dxs[i] * x[0] + dys[i] * x[1];
            let gy = dxs[i] * x[2] + dys[i] * x[3];
            let igl = 0.5 / (gx.abs() + gy.abs());
            let d = if edge[i] { lin[i] } else { radii[i] * radii[i] - dxs[i] * dxs[i] - dys[i] * dys[i] };
            alpha *= (0.5 + igl * d).clamp(0.0, 1.0);
        }
        bias + scale * alpha
    }

    /// Coverage per pixel of a `w × h` target (`None` where no triangle covers the centre).
    pub fn raster(inst: &RRectInstance, w: u32, h: u32) -> Vec<Option<f32>> {
        let verts: Vec<Varyings> = (0..36).map(|i| vertex(i / 9, TEMPLATE[i % 9], inst)).collect();
        let snap = |p: [f32; 2]| [(p[0] * 256.0).round() / 256.0, (p[1] * 256.0).round() / 256.0];
        let mut out = vec![None; (w * h) as usize];
        let cross = |a: [f32; 2], b: [f32; 2], c: [f32; 2]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        for k in 0..INDICES.len() - 2 {
            let mut tri = [INDICES[k], INDICES[k + 1], INDICES[k + 2]].map(|i| i as usize);
            let p = |i: usize| snap(verts[i].pos);
            if !p(tri[0]).iter().chain(p(tri[1]).iter()).chain(p(tri[2]).iter()).all(|v| v.is_finite()) {
                continue;
            }
            let area = cross(p(tri[0]), p(tri[1]), p(tri[2]));
            if area == 0.0 {
                continue;
            }
            if area < 0.0 {
                tri.swap(1, 2);
            }
            let [a, b, c] = tri.map(p);
            let area = area.abs();
            let top_left = |a: [f32; 2], b: [f32; 2]| (b[1] == a[1] && b[0] > a[0]) || b[1] < a[1];
            let inside = |e: f32, a: [f32; 2], b: [f32; 2]| e > 0.0 || (e == 0.0 && top_left(a, b));
            let (x0, x1) = (a[0].min(b[0]).min(c[0]).floor().max(0.0) as u32, (a[0].max(b[0]).max(c[0]).ceil().max(0.0) as u32).min(w));
            let (y0, y1) = (a[1].min(b[1]).min(c[1]).floor().max(0.0) as u32, (a[1].max(b[1]).max(c[1]).ceil().max(0.0) as u32).min(h));
            for y in y0..y1 {
                for x in x0..x1 {
                    let q = [x as f32 + 0.5, y as f32 + 0.5];
                    let (w0, w1, w2) = (cross(b, c, q), cross(c, a, q), cross(a, b, q));
                    if !(inside(w0, b, c) && inside(w1, c, a) && inside(w2, a, b)) {
                        continue;
                    }
                    let slot = &mut out[(y * w + x) as usize];
                    if slot.is_some() {
                        continue;
                    }
                    let bw = [w0 / area, w1 / area, w2 / area];
                    let [va, vb, vc] = tri.map(|i| verts[i]);
                    let m4 = |f: fn(&Varyings) -> [f32; 4]| -> [f32; 4] { std::array::from_fn(|i| bw[0] * f(&va)[i] + bw[1] * f(&vb)[i] + bw[2] * f(&vc)[i]) };
                    let m2 = |f: fn(&Varyings) -> [f32; 2]| -> [f32; 2] { std::array::from_fn(|i| bw[0] * f(&va)[i] + bw[1] * f(&vb)[i] + bw[2] * f(&vc)[i]) };
                    // Flat varyings come from the provoking (first) vertex: constant anyway.
                    let v = Varyings {
                        pos: q,
                        jacobian: m4(|v| v.jacobian),
                        edge: m4(|v| v.edge),
                        x_radii: va.x_radii,
                        y_radii: va.y_radii,
                        stroke: va.stroke,
                        ppc: m2(|v| v.ppc),
                        local: m2(|v| v.local),
                    };
                    *slot = Some(coverage(&v));
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transforms_classify_as_graphite() {
        assert_eq!(Xf::new(Matrix::IDENTITY).kind, Kind::Identity);
        assert_eq!(Xf::new(Matrix::scale(3.0, 3.0)).kind, Kind::SimpleRectStaysRect);
        assert_eq!(Xf::new(Matrix::scale(-3.0, 3.0)).kind, Kind::RectStaysRect);
        assert_eq!(Xf::new(Matrix::rotate(std::f32::consts::FRAC_PI_2).then(Matrix::IDENTITY)).kind, Kind::Affine);
        let r = Xf::new(Matrix::rotate(0.3).then(Matrix::scale(2.0, 3.0)));
        assert_eq!(r.kind, Kind::Affine);
        assert!((r.min_scale - 2.0).abs() < 0.2 && r.max_scale <= 3.0 + 1e-4);
        assert!((Xf::new(Matrix::scale(3.0, 3.0)).local_aa_radius() - 1.0 / 3.0).abs() < 1e-7);
    }

    #[test]
    fn rrects_set_their_radii_as_skia() {
        let rr = RRect::xy([0.0, 0.0, 10.0, 20.0], 8.0, 8.0);
        assert_eq!(rr.radii[0], [5.0, 5.0]);
        let oval = RRect::xy([0.0, 0.0, 10.0, 10.0], 8.0, 8.0);
        assert_eq!(oval.radii[0], [5.0, 5.0]);
        assert!(RRect::xy([0.0, 0.0, 10.0, 10.0], 0.0, 0.0).is_rect());
        // A rect ∩ a rounded rect inside it is the rounded rect.
        let inner = RRect::xy([2.0, 2.0, 8.0, 8.0], 2.0, 2.0);
        let outer = RRect::xy([0.0, 0.0, 10.0, 10.0], 0.0, 0.0);
        assert_eq!(conservative_intersect(&outer, &inner), Some(inner));
        // A rect cutting through the corners' curves is not an rrect.
        let cut = RRect::xy([0.0, 0.0, 3.0, 3.0], 0.0, 0.0);
        assert_eq!(conservative_intersect(&cut, &RRect::xy([0.0, 0.0, 10.0, 10.0], 5.0, 5.0)), None);
    }

    #[test]
    fn a_line_flattens_to_its_end_points() {
        let verbs = [Verb::Move(point(0.0, 0.0)), Verb::Line(point(10.0, 0.0)), Verb::Line(point(10.0, 10.0)), Verb::Close];
        let mut got = Vec::new();
        let mut s = Vec::new();
        flatten(&verbs, &Matrix::IDENTITY, |fan, pts| got.push((fan, pts.to_vec())), &mut s);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].1, vec![point(0.0, 0.0), point(10.0, 0.0), point(10.0, 10.0)]);
        // The mean of (10,0), (10,10) and the start.
        assert!((got[0].0.x - 20.0 / 3.0).abs() < 1e-5 && (got[0].0.y - 10.0 / 3.0).abs() < 1e-5);
    }

    #[test]
    fn curves_take_wangs_segment_count() {
        // A quarter circle of radius 100 px as a conic: n² = |dp|·4 / (4w) with the bounding box
        // centred; it must give 2^L chords with every chord within 1/4 px of the circle.
        let w = std::f32::consts::FRAC_1_SQRT_2;
        let verbs = [Verb::Move(point(100.0, 0.0)), Verb::Conic(point(100.0, 100.0), point(0.0, 100.0), w), Verb::Close];
        let mut s = Vec::new();
        let mut pts = Vec::new();
        flatten(&verbs, &Matrix::IDENTITY, |_, p| pts = p.to_vec(), &mut s);
        let n = pts.len() - 1;
        assert!(n.is_power_of_two() && (8..=32).contains(&n), "{n}");
        for p in &pts {
            let d = (p.x.hypot(p.y) - 100.0).abs();
            assert!(d < 1e-3, "{p:?} is on the circle");
        }
        for k in 0..n {
            let m = point((pts[k].x + pts[k + 1].x) / 2.0, (pts[k].y + pts[k + 1].y) / 2.0);
            assert!(100.0 - m.x.hypot(m.y) < 0.25, "chord {k} sags");
        }
        // The cubic count: ceil(log2(sqrt(sqrt(9 m)))).
        let c = Patch { p: [point(0.0, 0.0), point(0.0, 50.0), point(50.0, 50.0), point(50.0, 0.0)], w: -1.0 };
        let mm = (50.0f32 * 50.0 + 50.0 * 50.0).max(50.0 * 50.0 + 50.0 * 50.0);
        let want = ((9.0 * mm).log2() * 0.25).ceil() as i32;
        assert_eq!(shader_level(&Matrix::IDENTITY, &c), want.min(5));
    }

    #[test]
    fn analytic_clips_encode_as_skia() {
        let c = analytic_clip([10.0, 20.0, 30.0, 40.0], None, &Xf::new(Matrix::IDENTITY)).unwrap();
        assert_eq!(c.radii_with_inverse, [1.0, 1.0, -1.0, 1.0]);
        assert_eq!(c.rect, [10.0, 20.0, 30.0, 40.0]);
        let rr = RRect::xy([0.0, 0.0, 10.0, 10.0], 3.0, 3.0);
        let c = analytic_clip(rr.rect, Some(&rr), &Xf::new(Matrix::translate(5.0, 0.0))).unwrap();
        assert_eq!(c.radii_with_inverse, [4.0, 4.0, -4.0, 4.0]);
        assert_eq!(c.rect, [5.0, 0.0, 15.0, 10.0]);
    }
}
