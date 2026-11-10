//! @shopify/react-native-skia's drawing for the Demos app's GPU surfaces.
//!
//! A demo records its Skia `<Canvas>` into a [`Canvas`] each frame, as its JSX declares it:
//! paths (fill or stroke), circles, rects and rounded rects, with a [`Paint`] (a colour or a
//! linear, radial or sweep gradient), under transforms, opacity and clips. [`Renderer::draw`]
//! puts the frame into the surface's target, antialiased as RN Skia's Graphite (Skia m157 on
//! Dawn/Metal) does it ([`graphite`]): rects, rounded rects, circles, ovals and lines, filled
//! or stroked, through AnalyticRRectRenderStep's mesh and coverage; paths through its curve
//! subdivision, stencil-and-cover fills and stroke tessellator with 4× MSAA, the pass
//! multisampled only when such a draw is in it; clips folded into the draw, scissored, one
//! analytic, or drawn into depth. Everything is tessellated on the CPU, so nothing needs compute
//! or indirect dispatch: it runs the same on a phone and in the iOS Simulator. Gradients are
//! evaluated per pixel in the shader, interpolated as Skia does (unpremultiplied sRGB).
//!
//! Text is [`Font`] + [`Canvas::draw_text`]: as Graphite's direct-mask text, glyph masks that
//! CoreText rasterises as RN Skia's iOS scaler does, drawn from an atlas (no MSAA); runs of 162
//! device pixels and more (SDFT and path sizes in Graphite) and non-Apple targets fill the glyph
//! outlines as paths. SVG path strings
//! are [`path_from_svg`]; `<FitBox>` is [`fit_box`]; `<CornerPathEffect>` on a polyline is
//! [`corner_polyline`]. A `<Group transform>` with `perspective`,
//! `rotateX` or `rotateY` is [`Matrix4`] (its plane's [`Matrix3`] inverted in a demo's shader).
//!
//! Images are [`Images`] (decoded once, one mipmapped texture array) painted with
//! [`Shader::Image`] (`<Image fit>`, an image shader) or [`Canvas::draw_atlas`] (`<Atlas>`); a
//! view's Gaussian box shadow is [`Canvas::draw_rrect_shadow`], evaluated per pixel (no pass); a
//! rotated or scaled view's is [`Canvas::draw_rrect_shadow_local`], in its own space.
//!
//! What a demo needs beyond this (Skia's image filters, runtime shaders) is its own wgpu pass.

#![deny(missing_docs)]

pub use exact_gpu::wgpu;
pub use lyon::math::{point, vector, Point, Vector};
pub use lyon::path::{Path, PathBuffer, PathEvent, PathSlice};

pub mod backdrop;
pub mod blur;
pub mod color;
mod conics;
#[cfg(target_vendor = "apple")]
mod coretext;
mod glyphs;
pub mod graphite;
pub mod image;
pub mod matrix4;
pub mod render;
pub mod svg;
pub mod text;

pub use color::Color;
pub use matrix4::{Matrix3, Matrix4};
pub use blur::Blur;
pub use image::{Image, ImageRef, Images};
pub use render::Renderer;
pub use svg::path_from_svg;
pub use text::{match_system_font, match_ui_font, Font, FontMetrics};

use lyon::path::builder::BorderRadii;
use lyon::path::Winding;
use lyon::tessellation::{LineCap, LineJoin};

/// A 2D affine transform: `[a, b, c, d, e, f]` maps (x, y) to (a x + c y + e, b x + d y + f).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Matrix(pub [f32; 6]);

impl Matrix {
    /// The identity.
    pub const IDENTITY: Matrix = Matrix([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    /// A translation.
    pub fn translate(x: f32, y: f32) -> Matrix {
        Matrix([1.0, 0.0, 0.0, 1.0, x, y])
    }
    /// A scale about the origin.
    pub fn scale(x: f32, y: f32) -> Matrix {
        Matrix([x, 0.0, 0.0, y, 0.0, 0.0])
    }
    /// A rotation about the origin, radians (clockwise on screen, as Skia's).
    pub fn rotate(radians: f32) -> Matrix {
        let (s, c) = radians.sin_cos();
        Matrix([c, s, -s, c, 0.0, 0.0])
    }
    /// `self` then `next` (a point goes through `self` first): Skia's `concat` order is the
    /// reverse, so `canvas.concat(m)` is `m.then(current)`.
    pub fn then(self, next: Matrix) -> Matrix {
        let [a, b, c, d, e, f] = self.0;
        let [a2, b2, c2, d2, e2, f2] = next.0;
        Matrix([
            a2 * a + c2 * b,
            b2 * a + d2 * b,
            a2 * c + c2 * d,
            b2 * c + d2 * d,
            a2 * e + c2 * f + e2,
            b2 * e + d2 * f + f2,
        ])
    }
    /// Maps a point.
    pub fn apply(&self, p: Point) -> Point {
        let [a, b, c, d, e, f] = self.0;
        point(a * p.x + c * p.y + e, b * p.x + d * p.y + f)
    }
    /// The inverse (the identity where it does not exist).
    pub fn invert(&self) -> Matrix {
        let [a, b, c, d, e, f] = self.0;
        let det = a * d - b * c;
        if det.abs() < 1e-12 {
            return Matrix::IDENTITY;
        }
        let (ia, ib, ic, id) = (d / det, -b / det, -c / det, a / det);
        Matrix([ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)])
    }
    /// How much it scales lengths, at most.
    pub fn max_scale(&self) -> f32 {
        let [a, b, c, d, ..] = self.0;
        (a * a + b * b).sqrt().max((c * c + d * d).sqrt())
    }
}

/// `rect(x, y, width, height)`.
#[allow(missing_docs)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    /// `rect(x, y, width, height)`.
    pub const fn new(x: f32, y: f32, width: f32, height: f32) -> Rect {
        Rect { x, y, width, height }
    }
}

/// `<FitBox src dst>` with its default `fit="contain"`: `src` scaled uniformly to fit inside
/// `dst`, centred (Skia's `fitRects` / `rect2rect` for "contain").
pub fn fit_box(src: Rect, dst: Rect) -> Matrix {
    let s = (dst.width / src.width).min(dst.height / src.height);
    let tx = dst.x + (dst.width - src.width * s) / 2.0 - src.x * s;
    let ty = dst.y + (dst.height - src.height * s) / 2.0 - src.y * s;
    Matrix([s, 0.0, 0.0, s, tx, ty])
}

/// `fit="cover"` (`contentFit="cover"`, `resizeMode="cover"`): `src` scaled uniformly to cover
/// `dst`, centred (the part outside `dst` is the caller's clip).
pub fn fit_cover(src: Rect, dst: Rect) -> Matrix {
    let s = (dst.width / src.width).max(dst.height / src.height);
    let tx = dst.x + (dst.width - src.width * s) / 2.0 - src.x * s;
    let ty = dst.y + (dst.height - src.height * s) / 2.0 - src.y * s;
    Matrix([s, 0.0, 0.0, s, tx, ty])
}

/// A gradient stop: an offset in 0…1 and its colour.
pub type Stop = (f32, Color);

/// What a shape is filled or stroked with (positions in canvas points).
#[allow(missing_docs)]
#[derive(Clone, Debug, PartialEq)]
pub enum Shader {
    /// A colour.
    Solid(Color),
    /// `<LinearGradient start end colors positions>`.
    Linear { start: Point, end: Point, stops: Vec<Stop> },
    /// `<RadialGradient c r colors positions>`.
    Radial { center: Point, radius: f32, stops: Vec<Stop> },
    /// `<SweepGradient c colors positions>`: from the +x axis, clockwise.
    Sweep { center: Point, stops: Vec<Stop> },
    /// An image of the renderer's [`Images`]: `to_image` maps the shape's local points to the
    /// image's pixels (the inverse of where the image is drawn: `fit_cover(…).invert()`).
    /// Outside the image its edge repeats (clamp).
    Image { image: ImageRef, to_image: Matrix },
    /// [`Shader::Image`] sampled nearest, as `canvas.drawImageRect(image, src, dst, paint)`
    /// samples in RN Skia (`SkSamplingOptions()`: no filtering, no mipmaps, and
    /// `kStrict_SrcRectConstraint`): Graphite's `sk_image_shader` nearest path, the texel under
    /// the local point, clamped to `subset` (the src rect, image pixels `[l, t, r, b]`).
    ImageNearest { image: ImageRef, to_image: Matrix, subset: [f32; 4] },
}

/// Evenly spaced stops for `colors`, as Skia places them without `positions`.
pub fn stops(colors: &[Color]) -> Vec<Stop> {
    let n = colors.len().max(2) - 1;
    colors.iter().enumerate().map(|(i, c)| (i as f32 / n as f32, *c)).collect()
}

/// A Skia paint: a shader, fill or stroke, and the stroke's width, cap and join.
#[derive(Clone, Debug, PartialEq)]
pub struct Paint {
    /// What it paints with.
    pub shader: Shader,
    /// `style="stroke"` with this width; `None` fills.
    pub stroke: Option<f32>,
    /// `strokeCap`.
    pub cap: LineCap,
    /// `strokeJoin`.
    pub join: LineJoin,
    /// The paint's own opacity (`opacity` on the shape), times the colour's alpha.
    pub opacity: f32,
}

impl Paint {
    /// A fill with a colour.
    pub fn fill(color: Color) -> Paint {
        Paint { shader: Shader::Solid(color), stroke: None, cap: LineCap::Butt, join: LineJoin::Miter, opacity: 1.0 }
    }
    /// A stroke of `width` with a colour.
    pub fn stroke(color: Color, width: f32) -> Paint {
        Paint { stroke: Some(width), ..Paint::fill(color) }
    }
    /// A fill with an image, `to_image` from the shape's points to the image's pixels.
    pub fn image(image: ImageRef, to_image: Matrix) -> Paint {
        Paint::shader(Shader::Image { image, to_image })
    }
    /// A fill with a shader.
    pub fn shader(shader: Shader) -> Paint {
        Paint { shader, ..Paint::fill(Color::BLACK) }
    }
    /// This paint stroked at `width`.
    pub fn stroked(mut self, width: f32) -> Paint {
        self.stroke = Some(width);
        self
    }
    /// This paint with `strokeCap` / `strokeJoin`.
    pub fn caps(mut self, cap: LineCap, join: LineJoin) -> Paint {
        self.cap = cap;
        self.join = join;
        self
    }
    /// This paint at `opacity`.
    pub fn with_opacity(mut self, opacity: f32) -> Paint {
        self.opacity = opacity;
        self
    }
}

pub use lyon::tessellation::{LineCap as Cap, LineJoin as Join};

/// One vertex: a device-pixel position, the draw's depth and the paint it is coloured with.
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct Vertex {
    pub pos: [f32; 2],
    /// The draw's depth (painter's order: later draws are nearer).
    pub depth: f32,
    pub paint: u32,
    /// A straight RGBA8 colour the paint is multiplied by (an atlas sprite's), white otherwise.
    pub color: u32,
    /// Image pixels (image paints and atlas sprites).
    pub uv: [f32; 2],
}

/// A straight sRGB colour as encoded Display P3 (same white, same transfer curve).
fn srgb_to_p3(c: [f32; 4]) -> [f32; 4] {
    let lin = |v: f32| if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) };
    let enc = |v: f32| {
        let v = v.clamp(0.0, 1.0);
        if v <= 0.0031308 { 12.92 * v } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    [
        enc(0.8225 * r + 0.1774 * g),
        enc(0.0332 * r + 0.9669 * g),
        enc(0.0171 * r + 0.0724 * g + 0.9108 * b),
        c[3],
    ]
}

/// Up to this many stops per gradient.
pub(crate) const MAX_STOPS: usize = 8;

/// A paint as the shader reads it.
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct GpuPaint {
    /// kind (0 solid, 1 linear, 2 radial, 3 sweep, 4 image, 5 shadow), stop count, opacity,
    /// 1 when the stops are encoded Display P3 (gradients).
    pub head: [f32; 4],
    /// Linear: start, end. Radial: centre, radius, unused. Sweep: centre. Device pixels.
    /// Image: its width, height, layer, and 1 for `srcIn` (the vertex colour in the image's
    /// alpha) else 0. Shadow: the rect's top-left and bottom-right (device pixels).
    pub geometry: [f32; 4],
    /// Each stop's offset, in two vec4s. Image: the shape's local points to the image's pixels
    /// (a, b, c, d, e, f), read by the analytic step.
    pub offsets: [[f32; 4]; 2],
    /// Each stop's straight sRGB colour.
    pub colors: [[f32; 4]; MAX_STOPS],
    /// The draw's analytic clip (`sk_analytic_clip`'s xform, rect, radiiWithInverse); radii all
    /// 0 for none.
    pub clip: [[f32; 4]; 3],
}

/// One step of the frame, in order.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Op {
    /// Painted triangles `start..end` (indices): non-AA rects and floods, convex path fills,
    /// atlases, shadows (depth LEQUAL: they may overlap themselves), or with `once` a path's
    /// stroke (depth LESS: each sample takes the draw once).
    Tri { start: u32, end: u32, scissor: Option<[u32; 4]>, once: bool },
    /// A path's winding into the stencil (fan triangles `start..end`), not painted.
    Stencil { start: u32, end: u32, scissor: Option<[u32; 4]> },
    /// The stencilled path's bounds, painted where the winding isn't 0 (resetting it).
    Cover { start: u32, end: u32, scissor: Option<[u32; 4]> },
    /// A clip element's outside written into depth (after its `Stencil`).
    ClipCover { start: u32, end: u32 },
    /// AnalyticRRectRenderStep instances `first..first + count`.
    RRects { first: u32, count: u32, scissor: Option<[u32; 4]> },
    /// BitmapTextRenderStep: glyph quads `start..end` (indices), each vertex's `color` its atlas
    /// texel (x | y << 16), the mask sampled nearest (depth LEQUAL: a run may overlap itself).
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    Glyphs { start: u32, end: u32, scissor: Option<[u32; 4]> },
}

/// A clip element's shape, as the clip stack keeps it.
#[derive(Clone, Copy, Debug)]
enum ElemShape {
    Rect([f32; 4]),
    RRect(graphite::RRect),
    /// Verbs `start..end` of [`Canvas::clip_verbs`].
    Path(u32, u32),
}

/// A clip element (always an intersection).
#[derive(Clone, Copy, Debug)]
struct ClipElem {
    shape: ElemShape,
    /// Its transform to device space (the identity once a rect or rrect is pre-transformed).
    xf: graphite::Xf,
    outer: [f32; 4],
    inner: [f32; 4],
    /// Its depth-only MSAA draw once a draw needed it: the vertex range whose depth follows the
    /// last draw that used it, and that draw's painter's depth.
    drawn: Option<(u32, u32)>,
    max_z: u32,
}

#[derive(Clone, Copy)]
struct State {
    matrix: Matrix,
    opacity: f32,
    /// How many clip elements (and clip verbs) are on the stack.
    clips: usize,
    clip_verbs: usize,
}

/// What a draw is, before Graphite picks its renderer.
#[derive(Clone, Copy, Debug)]
enum Geo {
    Rect([f32; 4]),
    RRect(graphite::RRect),
    Line(Point, Point),
    /// `drawPaint`: everything under the clip.
    Flood,
    /// The verbs in [`Canvas::verbs`].
    Path,
}

/// What the clip stack decided for one draw.
#[derive(Clone, Copy, Debug, Default)]
struct DrawClip {
    analytic: Option<graphite::AnalyticClip>,
    scissor: Option<[u32; 4]>,
    /// Indices of elements drawn with MSAA into depth, `count` of them.
    msaa: [u16; 8],
    count: usize,
}

const INFINITE: [f32; 4] = [f32::NEG_INFINITY, f32::NEG_INFINITY, f32::INFINITY, f32::INFINITY];
const EMPTY: [f32; 4] = [f32::INFINITY, f32::INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY];

fn intersects(a: [f32; 4], b: [f32; 4]) -> bool {
    a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}
fn contains(outer: [f32; 4], inner: [f32; 4]) -> bool {
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3] && inner[0] < inner[2] && inner[1] < inner[3]
}
fn intersect(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [a[0].max(b[0]), a[1].max(b[1]), a[2].min(b[2]), a[3].min(b[3])]
}

/// One frame's drawing, in canvas points; the renderer scales it to device pixels.
pub struct Canvas {
    pub(crate) vertices: Vec<Vertex>,
    pub(crate) indices: Vec<u32>,
    pub(crate) paints: Vec<GpuPaint>,
    pub(crate) ops: Vec<Op>,
    pub(crate) rrects: Vec<graphite::RRectInstance>,
    /// Whether a draw needs MSAA: the pass is 4× then, single-sampled otherwise.
    pub(crate) msaa: bool,
    /// The last draw's painter's depth (0 is the clear).
    z: u32,
    state: State,
    saved: Vec<State>,
    clip_elems: Vec<ClipElem>,
    clip_verbs: Vec<graphite::Verb>,
    /// The path being drawn, as verbs (kept between draws).
    verbs: Vec<graphite::Verb>,
    /// Flattening scratch.
    points: Vec<Point>,
    /// The path a shape draw ([`Canvas::draw_circle`], …) is built into, kept between draws.
    scratch: lyon::path::PathBuffer,
    /// A text run's glyphs and their quads (scratch, kept between draws).
    glyph_run: Vec<(u16, f32)>,
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    glyph_quads: Vec<([f32; 4], glyphs::Slot)>,
    /// The glyph atlas's epoch the frame's glyph quads point into (0: none).
    pub(crate) atlas_epoch: u64,
}

impl Default for Canvas {
    fn default() -> Self {
        Canvas {
            vertices: Vec::new(),
            indices: Vec::new(),
            paints: Vec::new(),
            ops: Vec::new(),
            rrects: Vec::new(),
            msaa: false,
            z: 0,
            state: State { matrix: Matrix::IDENTITY, opacity: 1.0, clips: 0, clip_verbs: 0 },
            saved: Vec::new(),
            clip_elems: Vec::new(),
            clip_verbs: Vec::new(),
            verbs: Vec::new(),
            points: Vec::new(),
            scratch: lyon::path::PathBuffer::new(),
            glyph_run: Vec::new(),
            glyph_quads: Vec::new(),
            atlas_epoch: 0,
        }
    }
}

/// The verbs of lyon path events (curves kept; `End { close }` becomes a close).
/// A cubic that [`conics`] made from a conic (an arc, an oval) is that conic again.
fn push_verbs<I: IntoIterator<Item = PathEvent>>(events: I, out: &mut Vec<graphite::Verb>) {
    use graphite::Verb;
    for e in events {
        match e {
            PathEvent::Begin { at } => out.push(Verb::Move(at)),
            PathEvent::Line { to, .. } => out.push(Verb::Line(to)),
            PathEvent::Quadratic { ctrl, to, .. } => out.push(Verb::Quad(ctrl, to)),
            PathEvent::Cubic { from, ctrl1, ctrl2, to } => out.push(match conics::lookup(from, ctrl1, ctrl2, to) {
                Some((c, w)) => Verb::Conic(c, to, w),
                None => Verb::Cubic(ctrl1, ctrl2, to),
            }),
            PathEvent::End { close, .. } => {
                if close {
                    out.push(Verb::Close)
                }
            }
        }
    }
}

/// A lyon builder that compares what it is given with recorded verbs (no allocation).
struct Matcher<'a> {
    verbs: &'a [graphite::Verb],
    at: usize,
    tol: f32,
    ok: bool,
}

impl Matcher<'_> {
    fn next(&mut self, f: impl FnOnce(&graphite::Verb, f32) -> bool) {
        self.ok = self.ok && self.verbs.get(self.at).is_some_and(|v| f(v, self.tol));
        self.at += 1;
    }
}

fn near(p: Point, q: Point, tol: f32) -> bool {
    (p.x - q.x).abs() <= tol && (p.y - q.y).abs() <= tol
}

impl lyon::path::builder::PathBuilder for Matcher<'_> {
    fn num_attributes(&self) -> usize {
        0
    }
    fn begin(&mut self, at: Point, _: lyon::path::Attributes) -> lyon::path::EndpointId {
        self.next(|v, t| matches!(*v, graphite::Verb::Move(p) if near(p, at, t)));
        lyon::path::EndpointId(0)
    }
    fn end(&mut self, close: bool) {
        if close {
            self.next(|v, _| matches!(v, graphite::Verb::Close));
        }
    }
    fn line_to(&mut self, to: Point, _: lyon::path::Attributes) -> lyon::path::EndpointId {
        self.next(|v, t| matches!(*v, graphite::Verb::Line(p) if near(p, to, t)));
        lyon::path::EndpointId(0)
    }
    fn quadratic_bezier_to(&mut self, ctrl: Point, to: Point, _: lyon::path::Attributes) -> lyon::path::EndpointId {
        self.next(|v, t| matches!(*v, graphite::Verb::Quad(c, p) if near(c, ctrl, t) && near(p, to, t)));
        lyon::path::EndpointId(0)
    }
    fn cubic_bezier_to(&mut self, ctrl1: Point, ctrl2: Point, to: Point, _: lyon::path::Attributes) -> lyon::path::EndpointId {
        self.next(|v, t| matches!(*v, graphite::Verb::Cubic(a, b, p) if near(a, ctrl1, t) && near(b, ctrl2, t) && near(p, to, t)));
        lyon::path::EndpointId(0)
    }
}

/// What `SkPath::isLine`, `isOval`, `isRRect` and `isRect` find in a path: Skia's `isOval` and
/// `isRRect` are true for the paths `addOval`/`addCircle`/`addRRect` build, which here are the
/// curves lyon's `add_circle`, `add_ellipse` and `add_rounded_rectangle` emit (matched within
/// 1e-5 of their size); `isRect` is geometric. The second value: the contour is closed.
fn detect(verbs: &[graphite::Verb]) -> Option<(Geo, bool)> {
    use graphite::Verb;
    let n = verbs.len();
    let Some(&Verb::Move(start)) = verbs.first() else { return None };
    if verbs[1..].iter().any(|v| matches!(v, Verb::Move(_))) {
        return None;
    }
    let closed = matches!(verbs.last(), Some(Verb::Close));
    let body = &verbs[1..if closed { n - 1 } else { n }];
    // isLine: a move and a line, not closed.
    if !closed && body.len() == 1 {
        if let Verb::Line(to) = body[0] {
            return Some((Geo::Line(start, to), false));
        }
    }
    // isRect: 3 or 4 axis-aligned lines around a rect (a 4th back to the start or the close).
    if body.iter().all(|v| matches!(v, Verb::Line(_))) && (body.len() == 3 || body.len() == 4) {
        let mut pts = [start; 5];
        for (i, v) in body.iter().enumerate() {
            if let Verb::Line(p) = v {
                pts[i + 1] = *p;
            }
        }
        let (a, b, c, d) = (pts[0], pts[1], pts[2], pts[3]);
        let back = body.len() == 3 || pts[4] == start;
        let axis = |p: Point, q: Point| (p.x == q.x) != (p.y == q.y);
        if back && axis(a, b) && axis(b, c) && axis(c, d) && axis(d, a) && (a.x == b.x) != (b.x == c.x) {
            let r = [a.x.min(c.x), a.y.min(c.y), a.x.max(c.x), a.y.max(c.y)];
            if r[0] < r[2] && r[1] < r[3] {
                return Some((Geo::Rect(r), closed || body.len() == 4));
            }
        }
    }
    if !closed {
        return None;
    }
    let same = |built: &mut dyn FnMut(&mut lyon::path::builder::NoAttributes<Matcher<'_>>), tol: f32| {
        let mut b = lyon::path::builder::NoAttributes::wrap(Matcher { verbs, at: 0, tol, ok: true });
        built(&mut b);
        let m = b.into_inner();
        m.ok && m.at == n
    };
    // addOval / addCircle (conics::add_oval): four quarter conics of the on-curve points' box,
    // from one of its four starts, either way round.
    if body.len() == 4 && body.iter().all(|v| matches!(v, Verb::Conic(_, _, w) if *w == conics::ROOT2_OVER2)) {
        let mut r = [start.x, start.y, start.x, start.y];
        for v in body {
            if let Verb::Conic(_, p, _) = *v {
                r = [r[0].min(p.x), r[1].min(p.y), r[2].max(p.x), r[3].max(p.y)];
            }
        }
        if r[0] < r[2] && r[1] < r[3] {
            let tol = 1e-5 * (r[2] - r[0]).max(r[3] - r[1]).max(1.0);
            for ccw in [false, true] {
                for index in 0..4 {
                    let (s0, q) = conics::oval_conics(r, ccw, index);
                    let same = near(s0, start, tol)
                        && q.iter().zip(body).all(|((c, p), v)| matches!(*v, Verb::Conic(vc, vp, _) if near(vc, *c, tol) && near(vp, *p, tol)));
                    if same {
                        return Some((Geo::RRect(graphite::RRect::oval(r)), true));
                    }
                }
            }
        }
    }
    // add_circle: begins at (cx − r, cy), four cubics, the second ending at (cx + r, cy).
    if body.len() == 4 && body.iter().all(|v| matches!(v, Verb::Cubic(..))) {
        if let Verb::Cubic(_, _, right) = body[1] {
            let (cx, cy, r) = ((start.x + right.x) * 0.5, start.y, (right.x - start.x).abs() * 0.5);
            let tol = 1e-5 * r.max(1.0);
            for w in [Winding::Positive, Winding::Negative] {
                if r > 0.0 && same(&mut |b| b.add_circle(point(cx, cy), r, w), tol) {
                    return Some((Geo::RRect(graphite::RRect::oval([cx - r, cy - r, cx + r, cy + r])), true));
                }
            }
        }
    }
    let mut bb = [f32::INFINITY, f32::INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY];
    let mut on = bb;
    let grow = |b: &mut [f32; 4], p: Point| *b = [b[0].min(p.x), b[1].min(p.y), b[2].max(p.x), b[3].max(p.y)];
    for v in verbs {
        match *v {
            Verb::Move(p) | Verb::Line(p) => {
                grow(&mut bb, p);
                grow(&mut on, p);
            }
            Verb::Quad(c, p) => {
                grow(&mut bb, c);
                grow(&mut bb, p);
                grow(&mut on, p);
            }
            Verb::Cubic(c1, c2, p) => {
                grow(&mut bb, c1);
                grow(&mut bb, c2);
                grow(&mut bb, p);
                grow(&mut on, p);
            }
            _ => {}
        }
    }
    let (w, h) = (bb[2] - bb[0], bb[3] - bb[1]);
    if !(w > 0.0 && h > 0.0) {
        return None;
    }
    let tol = 1e-5 * w.max(h).max(1.0);
    // add_ellipse: quadratics around the centre of the on-curve points.
    if body.iter().all(|v| matches!(v, Verb::Quad(..))) {
        let (cx, cy) = ((on[0] + on[2]) * 0.5, (on[1] + on[3]) * 0.5);
        let r = vector((on[2] - on[0]) * 0.5, (on[3] - on[1]) * 0.5);
        for wd in [Winding::Positive, Winding::Negative] {
            if same(&mut |b| b.add_ellipse(point(cx, cy), r, lyon::math::Angle::radians(0.0), wd), tol) {
                return Some((Geo::RRect(graphite::RRect::oval([cx - r.x, cy - r.y, cx + r.x, cy + r.y])), true));
            }
        }
    }
    // add_rounded_rectangle with one radius: it begins at (left, top + r).
    if matches!(body.first(), Some(Verb::Cubic(..))) && (start.x - bb[0]).abs() <= tol {
        let r = start.y - bb[1];
        let rect = lyon::math::Box2D::new(point(bb[0], bb[1]), point(bb[2], bb[3]));
        for wd in [Winding::Positive, Winding::Negative] {
            if r > 0.0 && same(&mut |b| b.add_rounded_rectangle(&rect, &BorderRadii::new(r), wd), tol) {
                return Some((Geo::RRect(graphite::RRect::xy(bb, r, r)), true));
            }
        }
    }
    None
}

impl Canvas {
    /// Starts a frame at `scale` device pixels per point. Buffers are kept between frames.
    pub fn begin(&mut self, scale: f32) {
        self.vertices.clear();
        self.indices.clear();
        self.paints.clear();
        self.ops.clear();
        self.rrects.clear();
        self.msaa = false;
        self.z = 0;
        self.saved.clear();
        self.clip_elems.clear();
        self.clip_verbs.clear();
        self.state = State { matrix: Matrix::scale(scale, scale), opacity: 1.0, clips: 0, clip_verbs: 0 };
        if self.atlas_epoch != 0 {
            glyphs::Atlas::with(|a| a.begin_frame());
        }
        self.atlas_epoch = 0;
    }

    /// `canvas.save()` / a `<Group>`'s start.
    pub fn save(&mut self) {
        self.saved.push(self.state);
    }

    /// `canvas.restore()` / a `<Group>`'s end: its transform, opacity and clips undone (a clip
    /// is depth: the draws after it are nearer than what it wrote, so nothing is undrawn).
    pub fn restore(&mut self) {
        if let Some(state) = self.saved.pop() {
            self.state = state;
            // Draws after a clip element come after its depth (`updateNextDepthForClipping`).
            for e in &self.clip_elems[state.clips.min(self.clip_elems.len())..] {
                if e.drawn.is_some() {
                    self.z = self.z.max(e.max_z + 1);
                }
            }
            self.clip_elems.truncate(state.clips);
            self.clip_verbs.truncate(state.clip_verbs);
        }
    }

    /// Pre-multiplies the current transform by `m` (Skia's `concat`: `m` applies first).
    pub fn concat(&mut self, m: Matrix) {
        self.state.matrix = m.then(self.state.matrix);
    }
    /// `translate`.
    pub fn translate(&mut self, x: f32, y: f32) {
        self.concat(Matrix::translate(x, y));
    }
    /// `scale`.
    pub fn scale(&mut self, x: f32, y: f32) {
        self.concat(Matrix::scale(x, y));
    }
    /// `rotate`, radians.
    pub fn rotate(&mut self, radians: f32) {
        self.concat(Matrix::rotate(radians));
    }
    /// A `<Group opacity>`: multiplies every later draw's alpha (each shape on its own, not
    /// the group as one layer).
    pub fn opacity(&mut self, opacity: f32) {
        self.state.opacity *= opacity;
    }
    /// The current transform (canvas points to device pixels).
    pub fn matrix(&self) -> Matrix {
        self.state.matrix
    }
    /// Replaces the current transform (one taken from [`Canvas::matrix`]), without a save.
    pub fn set_matrix(&mut self, m: Matrix) {
        self.state.matrix = m;
    }

    /// `<Path path paint>`.
    pub fn draw_path(&mut self, path: &Path, paint: &Paint) {
        self.draw_path_events(path.iter(), paint);
    }

    /// [`Canvas::draw_path`] of a path given as its events (a `lyon` `PathBuffer`'s slice, a
    /// path a demo refills every frame without allocating). As Graphite's `Device::drawPath`, a
    /// path that is a line, an oval, a rounded rect or a rect is drawn as that shape.
    pub fn draw_path_events<I: IntoIterator<Item = lyon::path::PathEvent>>(&mut self, path: I, paint: &Paint) {
        let mut verbs = std::mem::take(&mut self.verbs);
        verbs.clear();
        push_verbs(path, &mut verbs);
        self.verbs = verbs;
        let geo = match detect(&self.verbs) {
            Some((Geo::Line(a, b), _)) => {
                if paint.stroke.is_none() {
                    return;
                }
                Geo::Line(a, b)
            }
            Some((Geo::Rect(r), closed)) if paint.stroke.is_none() || closed => Geo::Rect(r),
            Some((Geo::RRect(rr), _)) => Geo::RRect(rr),
            _ => Geo::Path,
        };
        self.draw_geo(geo, paint);
    }

    /// `<Circle cx cy r paint>`: `drawCircle` → `drawOval` → `drawRRect(MakeOval)`.
    pub fn draw_circle(&mut self, cx: f32, cy: f32, r: f32, paint: &Paint) {
        let rect = [cx - r, cy - r, cx + r, cy + r];
        if !(rect[0] < rect[2]) {
            return;
        }
        self.draw_geo(Geo::RRect(graphite::RRect::oval(rect)), paint);
    }

    /// `<Oval x y width height paint>`.
    pub fn draw_oval(&mut self, x: f32, y: f32, w: f32, h: f32, paint: &Paint) {
        let rect = [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)];
        self.draw_geo(Geo::RRect(graphite::RRect::oval(rect)), paint);
    }

    /// `<Line p1 p2 paint>` (`drawLine`: always a stroke).
    pub fn draw_line(&mut self, p1: Point, p2: Point, paint: &Paint) {
        let width = paint.stroke.unwrap_or(0.0);
        self.draw_geo(Geo::Line(p1, p2), &Paint { stroke: Some(width), ..paint.clone() });
    }

    /// Draws the path `build` appends to a builder, built in a buffer the canvas keeps (no
    /// allocation once warm): the same geometry as building a [`Path`] and [`Canvas::draw_path`].
    pub fn draw_with(&mut self, paint: &Paint, build: impl FnOnce(&mut lyon::path::builder::NoAttributes<lyon::path::path_buffer::Builder<'_>>)) {
        let mut buffer = std::mem::take(&mut self.scratch);
        buffer.clear();
        {
            let mut b = lyon::path::builder::NoAttributes::wrap(buffer.builder());
            build(&mut b);
            b.build();
        }
        self.draw_path_events(buffer.get(0).iter(), paint);
        self.scratch = buffer;
    }

    /// `<Rect x y width height paint>`.
    pub fn draw_rect(&mut self, x: f32, y: f32, w: f32, h: f32, paint: &Paint) {
        let r = [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)];
        self.draw_geo(Geo::Rect(r), paint);
    }

    /// `<RoundedRect x y width height r paint>` (`SkRRect::setRectXY(r, r)`).
    pub fn draw_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, paint: &Paint) {
        let rect = [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)];
        let rr = graphite::RRect::xy(rect, r, r);
        self.draw_geo(if rr.is_rect() { Geo::Rect(rect) } else { Geo::RRect(rr) }, paint);
    }

    /// `<Fill color>`: the whole canvas (under the current clip).
    pub fn fill(&mut self, color: Color) {
        self.draw_geo(Geo::Flood, &Paint::fill(color));
    }

    /// `<Group clip={path}>` (until the matching restore): later draws only inside `path`.
    pub fn clip_path(&mut self, path: &Path) {
        self.clip_events(path.iter());
    }

    /// [`Canvas::clip_path`] of a path given as its events. As `SkCanvas::clipPath`, under a
    /// rect-stays-rect transform a path that is a rect, an oval or a rounded rect clips as one.
    pub fn clip_events<I: IntoIterator<Item = lyon::path::PathEvent>>(&mut self, path: I) {
        let start = self.clip_verbs.len();
        let mut verbs = std::mem::take(&mut self.clip_verbs);
        push_verbs(path, &mut verbs);
        self.clip_verbs = verbs;
        let xf = graphite::Xf::new(self.state.matrix);
        if xf.kind <= graphite::Kind::RectStaysRect {
            match detect(&self.clip_verbs[start..]) {
                Some((Geo::Rect(r), _)) => {
                    self.clip_verbs.truncate(start);
                    return self.add_clip(ElemShape::Rect(r));
                }
                Some((Geo::RRect(rr), _)) => {
                    self.clip_verbs.truncate(start);
                    return self.add_clip(ElemShape::RRect(rr));
                }
                _ => {}
            }
        }
        let end = self.clip_verbs.len();
        self.add_clip(ElemShape::Path(start as u32, end as u32));
    }

    /// A rounded-rect clip (`clipRRect`).
    pub fn clip_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32) {
        let rect = [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)];
        let rr = graphite::RRect::xy(rect, r, r);
        self.add_clip(if rr.is_rect() { ElemShape::Rect(rect) } else { ElemShape::RRect(rr) });
    }

    /// A rect clip (`clipRect`).
    pub fn clip_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.add_clip(ElemShape::Rect([x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)]));
    }

    /// A clip to the path `build` appends, built in the canvas's kept buffer (no allocation).
    pub fn clip_with(&mut self, build: impl FnOnce(&mut lyon::path::builder::NoAttributes<lyon::path::path_buffer::Builder<'_>>)) {
        let mut buffer = std::mem::take(&mut self.scratch);
        buffer.clear();
        {
            let mut b = lyon::path::builder::NoAttributes::wrap(buffer.builder());
            build(&mut b);
            b.build();
        }
        self.clip_events(buffer.get(0).iter());
        self.scratch = buffer;
    }

    /// `ClipStack::clipShape` for an intersection: the element pre-transformed to device space
    /// when it is a rect or rrect under a rect-stays-rect transform, then simplified against the
    /// elements of the same save.
    fn add_clip(&mut self, shape: ElemShape) {
        let xf = graphite::Xf::new(self.state.matrix);
        let mut elem = ClipElem { shape, xf, outer: EMPTY, inner: EMPTY, drawn: None, max_z: 0 };
        if xf.valid() {
            match shape {
                ElemShape::Rect(r) => {
                    elem.outer = xf.map_rect(r);
                    if xf.kind <= graphite::Kind::RectStaysRect {
                        elem.shape = ElemShape::Rect(elem.outer);
                        elem.xf = graphite::Xf::new(Matrix::IDENTITY);
                        elem.inner = elem.outer;
                    }
                }
                ElemShape::RRect(rr) => {
                    elem.outer = xf.map_rect(rr.rect);
                    if xf.kind <= graphite::Kind::RectStaysRect {
                        if let Some(d) = rr.transform(&xf) {
                            elem.shape = ElemShape::RRect(d);
                            elem.xf = graphite::Xf::new(Matrix::IDENTITY);
                            elem.outer = d.rect;
                            elem.inner = d.inner_bounds();
                        }
                    }
                }
                ElemShape::Path(s, e) => {
                    let mut b = EMPTY;
                    for v in &self.clip_verbs[s as usize..e as usize] {
                        let mut add = |p: Point| {
                            let q = xf.m.apply(p);
                            b = [b[0].min(q.x), b[1].min(q.y), b[2].max(q.x), b[3].max(q.y)];
                        };
                        match *v {
                            graphite::Verb::Move(p) | graphite::Verb::Line(p) => add(p),
                            graphite::Verb::Quad(c, p) | graphite::Verb::Conic(c, p, _) => {
                                add(c);
                                add(p)
                            }
                            graphite::Verb::Cubic(c1, c2, p) => {
                                add(c1);
                                add(c2);
                                add(p)
                            }
                            graphite::Verb::Close => {}
                        }
                    }
                    elem.outer = b;
                }
            }
        }
        // Combine with the newest element of this save: a device rect into a device rect; drop
        // an element the other contains.
        let base = self.saved.last().map_or(0, |s| s.clips);
        if self.clip_elems.len() > base {
            let last = *self.clip_elems.last().unwrap();
            if last.drawn.is_none() {
                if let (ElemShape::Rect(a), ElemShape::Rect(b)) = (last.shape, elem.shape) {
                    if last.xf.kind == graphite::Kind::Identity && elem.xf.kind == graphite::Kind::Identity {
                        let r = intersect(a, b);
                        let l = self.clip_elems.last_mut().unwrap();
                        l.shape = ElemShape::Rect(r);
                        l.outer = r;
                        l.inner = r;
                        self.state.clips = self.clip_elems.len();
                        self.state.clip_verbs = self.clip_verbs.len();
                        return;
                    }
                }
                if contains(elem.inner, last.outer) {
                    // The new element clips nothing the last doesn't.
                    self.state.clip_verbs = self.clip_verbs.len();
                    return;
                }
            }
        }
        self.clip_elems.push(elem);
        self.state.clips = self.clip_elems.len();
        self.state.clip_verbs = self.clip_verbs.len();
    }

    /// The device bounds of the surface's drawing (for floods and clip covers).
    fn device_bounds(&self) -> [f32; 4] {
        [-1.0e6, -1.0e6, 1.0e6, 1.0e6]
    }

    /// `ClipStack::visitClipStackForDraw` for a draw whose device bounds are `outer` (and,
    /// when its geometry may be replaced, `inner`): clips folded into `geo`, a scissor, one
    /// analytic clip, the rest drawn into depth with MSAA. `false` when it is clipped out.
    fn visit_clips(&mut self, geo: &mut Geo, xf: &graphite::Xf, modifiable: bool, outer: [f32; 4], inner: [f32; 4], out: &mut DrawClip) -> bool {
        let mut outer = outer;
        let mut inner = inner;
        let mut modifiable = modifiable;
        for i in (0..self.clip_elems.len()).rev() {
            let e = self.clip_elems[i];
            let flood = matches!(geo, Geo::Flood);
            if !flood && !intersects(e.outer, outer) {
                return false;
            }
            if !flood && contains(e.inner, outer) {
                continue;
            }
            // The draw covers the element: the element's shape replaces it.
            if modifiable && !flood && contains(inner, e.outer) {
                *geo = Geo::Flood;
                outer = INFINITE;
                inner = INFINITE;
            }
            if modifiable && self.intersect_shape(&e, geo, xf) {
                outer = intersect(outer, e.outer);
                inner = intersect(inner, e.inner);
                continue;
            }
            modifiable = false;
            if let (ElemShape::Rect(r), graphite::Kind::Identity) = (e.shape, e.xf.kind) {
                if graphite::nearly_pixel_aligned(r) {
                    let r = r.map(|v| (v + 0.5).floor().max(0.0));
                    let s = [r[0] as u32, r[1] as u32, (r[2] - r[0]).max(0.0) as u32, (r[3] - r[1]).max(0.0) as u32];
                    out.scissor = Some(match out.scissor {
                        None => s,
                        Some(o) => {
                            let (x0, y0) = (o[0].max(s[0]), o[1].max(s[1]));
                            let (x1, y1) = ((o[0] + o[2]).min(s[0] + s[2]), (o[1] + o[3]).min(s[1] + s[3]));
                            [x0, y0, x1.saturating_sub(x0), y1.saturating_sub(y0)]
                        }
                    });
                    continue;
                }
            }
            if out.analytic.is_none() {
                let a = match e.shape {
                    ElemShape::Rect(r) => graphite::analytic_clip(r, None, &e.xf),
                    ElemShape::RRect(rr) => graphite::analytic_clip(rr.rect, Some(&rr), &e.xf),
                    ElemShape::Path(..) => None,
                };
                if a.is_some() {
                    out.analytic = a;
                    continue;
                }
            }
            if out.count < out.msaa.len() {
                out.msaa[out.count] = i as u16;
                out.count += 1;
            }
        }
        true
    }

    /// `intersect_shape`: the element folded into a rect, rrect or flood draw when their
    /// relative transform keeps rects rects.
    fn intersect_shape(&self, e: &ClipElem, geo: &mut Geo, xf: &graphite::Xf) -> bool {
        if !matches!(geo, Geo::Rect(_) | Geo::RRect(_) | Geo::Flood) {
            return false;
        }
        let (other_rect, other_rr) = match e.shape {
            ElemShape::Rect(r) => (r, None),
            ElemShape::RRect(rr) => (rr.rect, Some(rr)),
            ElemShape::Path(..) => return false,
        };
        // localToOther: the element in the draw's space.
        let to_local = if e.xf.m == xf.m {
            graphite::Xf::new(Matrix::IDENTITY)
        } else if e.xf.kind == graphite::Kind::Identity && xf.kind <= graphite::Kind::RectStaysRect {
            graphite::Xf::new(xf.m.invert())
        } else {
            return false;
        };
        let mut local = to_local.map_rect(other_rect);
        let back = graphite::Xf::new(to_local.m.invert()).map_rect(local);
        let tol = graphite::PIXEL_TOLERANCE * e.xf.local_aa_radius();
        if !(local[0] < local[2] && local[1] < local[3]) || back.iter().zip(other_rect.iter()).any(|(a, b)| (a - b).abs() > tol) {
            return false;
        }
        let bounds = match *geo {
            Geo::Rect(r) => Some(r),
            Geo::RRect(rr) => Some(rr.rect),
            _ => None,
        };
        if let Some(b) = bounds {
            local = intersect(local, b);
        }
        let aa = xf.local_aa_radius();
        if !aa.is_finite() || local[2] - local[0] <= aa || local[3] - local[1] <= aa {
            return false;
        }
        match (other_rr, *geo) {
            (None, Geo::Rect(_) | Geo::Flood) => {
                *geo = Geo::Rect(local);
                true
            }
            (Some(rr), Geo::Flood) => match rr.transform(&to_local) {
                Some(l) => {
                    *geo = Geo::RRect(l);
                    true
                }
                None => false,
            },
            (other, draw) => {
                let a = match other {
                    None => graphite::RRect { rect: local, radii: [[0.0; 2]; 4] },
                    Some(rr) => match rr.transform(&to_local) {
                        Some(l) => l,
                        None => return false,
                    },
                };
                let b = match draw {
                    Geo::Rect(r) => graphite::RRect { rect: r, radii: [[0.0; 2]; 4] },
                    Geo::RRect(rr) => rr,
                    _ => return false,
                };
                match graphite::conservative_intersect(&a, &b) {
                    Some(r) if r.is_rect() => {
                        *geo = Geo::Rect(r.rect);
                        true
                    }
                    Some(r) => {
                        *geo = Geo::RRect(r);
                        true
                    }
                    None => false,
                }
            }
        }
    }

    /// The depth of painter's depth `z` (`DrawOrder::depthAsFloat`: decreasing, tested LESS).
    fn depth_of(z: u32) -> f32 {
        1.0 - z as f32 * (1.0 / 1_048_576.0)
    }

    /// The next draw's depth.
    fn next_depth(&mut self) -> f32 {
        self.z += 1;
        Self::depth_of(self.z)
    }

    /// Draws (once) or re-depths the MSAA clip elements a draw uses: an element writes the depth
    /// one past the last draw that uses it (`fMaxZ.next()`), so those draws fail outside it.
    fn use_msaa_clips(&mut self, clip: &DrawClip, _draw_depth: f32) {
        let depth = Self::depth_of(self.z + 1);
        for &i in &clip.msaa[..clip.count] {
            let i = i as usize;
            self.clip_elems[i].max_z = self.z;
            let e = self.clip_elems[i];
            if let Some((s, t)) = e.drawn {
                for v in &mut self.vertices[s as usize..t as usize] {
                    v.depth = depth;
                }
                continue;
            }
            let v0 = self.vertices.len() as u32;
            let mut verbs = std::mem::take(&mut self.verbs);
            verbs.clear();
            match e.shape {
                ElemShape::Rect(r) => verbs.extend([
                    graphite::Verb::Move(point(r[0], r[1])),
                    graphite::Verb::Line(point(r[2], r[1])),
                    graphite::Verb::Line(point(r[2], r[3])),
                    graphite::Verb::Line(point(r[0], r[3])),
                    graphite::Verb::Close,
                ]),
                ElemShape::RRect(rr) => graphite::rrect_verbs(&rr, &mut verbs),
                ElemShape::Path(s, t) => verbs.extend_from_slice(&self.clip_verbs[s as usize..t as usize]),
            }
            let start = self.indices.len() as u32;
            self.fan(&verbs, &e.xf.m, depth, 0, None);
            let mid = self.indices.len() as u32;
            self.verbs = verbs;
            if mid > start {
                self.ops.push(Op::Stencil { start, end: mid, scissor: None });
                let b = self.device_bounds();
                self.quad_device(b, depth, 0);
                let end = self.indices.len() as u32;
                self.ops.push(Op::ClipCover { start: mid, end });
                self.msaa = true;
            }
            self.clip_elems[i].drawn = Some((v0, self.vertices.len() as u32));
        }
    }

    /// Fan triangles (wedges) of `verbs` under `m`, as Graphite's TessellateWedgesRenderStep
    /// subdivides them. Returns the device bounds.
    fn fan(&mut self, verbs: &[graphite::Verb], m: &Matrix, depth: f32, paint: u32, to_image: Option<Matrix>) -> ([f32; 4], bool) {
        let mut points = std::mem::take(&mut self.points);
        let mut bounds = EMPTY;
        let mut contours = 0;
        let mut convex = true;
        let uv_of = to_image.map(|t| m.invert().then(t));
        let (vertices, indices) = (&mut self.vertices, &mut self.indices);
        graphite::flatten(
            verbs,
            m,
            |fan, pts| {
                if pts.len() < 2 {
                    return;
                }
                contours += 1;
                convex = convex && contours == 1 && graphite::convex(pts);
                let vert = |p: Point| {
                    let uv = uv_of.map_or(point(0.0, 0.0), |t| t.apply(p));
                    Vertex { pos: [p.x, p.y], depth, paint, color: u32::MAX, uv: [uv.x, uv.y] }
                };
                let base = vertices.len() as u32;
                vertices.push(vert(fan));
                for &p in pts {
                    vertices.push(vert(p));
                    bounds = [bounds[0].min(p.x), bounds[1].min(p.y), bounds[2].max(p.x), bounds[3].max(p.y)];
                }
                let n = pts.len() as u32;
                for k in 0..n {
                    let (a, b) = (base + 1 + k, base + 1 + (k + 1) % n);
                    indices.extend_from_slice(&[base, a, b]);
                }
            },
            &mut points,
        );
        self.points = points;
        (bounds, convex && contours == 1)
    }

    /// A device-space rect as two triangles.
    fn quad_device(&mut self, r: [f32; 4], depth: f32, paint: u32) {
        let base = self.vertices.len() as u32;
        for (x, y) in [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3])] {
            self.vertices.push(Vertex { pos: [x, y], depth, paint, color: u32::MAX, uv: [x, y] });
        }
        self.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    fn push_tri(&mut self, start: u32, scissor: Option<[u32; 4]>) {
        self.push_tris(start, scissor, false);
    }

    fn push_tris(&mut self, start: u32, scissor: Option<[u32; 4]>, once: bool) {
        let end = self.indices.len() as u32;
        if end == start {
            return;
        }
        match self.ops.last_mut() {
            Some(Op::Tri { end: e, scissor: s, once: o, .. }) if *e == start && *s == scissor && *o == once => *e = end,
            _ => self.ops.push(Op::Tri { start, end, scissor, once }),
        }
    }

    /// One draw: the clip stack's decisions, then Graphite's renderer for what remains.
    fn draw_geo(&mut self, mut geo: Geo, paint: &Paint) {
        let m = self.state.matrix;
        let xf = graphite::Xf::new(m);
        if !xf.valid() {
            return;
        }
        let aa = xf.local_aa_radius();
        // The draw's local bounds and whether the clip stack may replace its geometry.
        let local = match geo {
            Geo::Rect(r) => r,
            Geo::RRect(rr) => rr.rect,
            Geo::Line(a, b) => [a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y)],
            Geo::Flood => INFINITE,
            Geo::Path => {
                let mut b = EMPTY;
                for v in &self.verbs {
                    let mut add = |p: Point| b = [b[0].min(p.x), b[1].min(p.y), b[2].max(p.x), b[3].max(p.y)];
                    match *v {
                        graphite::Verb::Move(p) | graphite::Verb::Line(p) => add(p),
                        graphite::Verb::Quad(c, p) | graphite::Verb::Conic(c, p, _) => {
                            add(c);
                            add(p)
                        }
                        graphite::Verb::Cubic(c1, c2, p) => {
                            add(c1);
                            add(c2);
                            add(p)
                        }
                        graphite::Verb::Close => {}
                    }
                }
                b
            }
        };
        if !matches!(geo, Geo::Flood | Geo::Path) {
            let size = [local[2] - local[0], local[3] - local[1]];
            if paint.stroke.is_none() && (matches!(geo, Geo::Line(..)) || size[0] <= 0.0 || size[1] <= 0.0) {
                return;
            }
        }
        let (outset, modifiable) = match paint.stroke {
            None => {
                let small = !matches!(geo, Geo::Flood) && (local[2] - local[0] < aa || local[3] - local[1] < aa);
                (if small { 0.5 * aa } else { 0.0 }, !small && matches!(geo, Geo::Rect(_) | Geo::RRect(_) | Geo::Flood))
            }
            Some(w) => {
                let w = w.max(aa);
                let mut r = w * 0.5;
                if matches!(geo, Geo::Path) && matches!(paint.join, LineJoin::Miter | LineJoin::MiterClip) {
                    r *= 4.0;
                }
                if matches!(paint.cap, LineCap::Square) {
                    r *= std::f32::consts::SQRT_2;
                }
                (r, false)
            }
        };
        let (outer, inner) = if matches!(geo, Geo::Flood) {
            (INFINITE, INFINITE)
        } else {
            let l = [local[0] - outset, local[1] - outset, local[2] + outset, local[3] + outset];
            let outer = xf.map_rect(l);
            let inner = if modifiable && xf.kind <= graphite::Kind::RectStaysRect {
                match geo {
                    Geo::Rect(_) => outer,
                    Geo::RRect(rr) => xf.map_rect(rr.inner_bounds()),
                    _ => EMPTY,
                }
            } else {
                EMPTY
            };
            (outer, inner)
        };
        let mut clip = DrawClip::default();
        if !self.visit_clips(&mut geo, &xf, modifiable, outer, inner, &mut clip) {
            return;
        }
        let stroke = paint.stroke.map(|w| graphite::Stroke {
            half_width: w * 0.5,
            join_limit: match paint.join {
                LineJoin::Round => -1.0,
                LineJoin::Bevel => 0.0,
                _ => MITER_LIMIT,
            },
            cap: match paint.cap {
                LineCap::Butt => 0,
                LineCap::Round => 1,
                LineCap::Square => 2,
            },
        });
        let depth = self.next_depth();
        self.use_msaa_clips(&clip, depth);
        let paint_index = self.push_paint(paint, clip.analytic.as_ref());
        let to_image = match &paint.shader {
            Shader::Image { to_image, .. } | Shader::ImageNearest { to_image, .. } => Some(*to_image),
            _ => None,
        };
        let scissor = clip.scissor;
        // nonAABounds: a flood, or a filled rect on whole pixels.
        let bounds_draw = match geo {
            Geo::Flood => Some(self.device_bounds()),
            Geo::Rect(r) if stroke.is_none() && xf.kind <= graphite::Kind::RectStaysRect => {
                let d = xf.map_rect(r);
                graphite::nearly_pixel_aligned(d).then_some(d)
            }
            _ => None,
        };
        if let Some(d) = bounds_draw {
            let start = self.indices.len() as u32;
            let base = self.vertices.len() as u32;
            self.quad_device(d, depth, paint_index);
            if let Some(t) = to_image {
                let inv = m.invert().then(t);
                for v in &mut self.vertices[base as usize..] {
                    let uv = inv.apply(point(v.pos[0], v.pos[1]));
                    v.uv = [uv.x, uv.y];
                }
            }
            self.push_tri(start, scissor);
            return;
        }
        // is_simple_shape → analyticRRect.
        let simple = match geo {
            Geo::Rect(r) => Some(graphite::Simple::Rect(r)),
            Geo::Line(a, b) => Some(graphite::Simple::Line(a, b)),
            Geo::RRect(rr) => {
                let circular = rr.all_corners_circular(aa * graphite::PIXEL_TOLERANCE);
                (stroke.is_none_or(|s| s.half_width == 0.0) || circular).then_some(graphite::Simple::RRect(rr))
            }
            _ => None,
        };
        if let Some(shape) = simple {
            let inst = graphite::rrect_instance(&shape, stroke, &xf, depth, paint_index);
            let first = self.rrects.len() as u32;
            self.rrects.push(inst);
            match self.ops.last_mut() {
                Some(Op::RRects { first: f, count, scissor: s }) if *f + *count == first && *s == scissor => *count += 1,
                _ => self.ops.push(Op::RRects { first, count: 1, scissor }),
            }
            return;
        }
        // The path renderers (kTessellation): MSAA.
        self.msaa = true;
        let mut verbs = std::mem::take(&mut self.verbs);
        match geo {
            Geo::Path => {}
            Geo::Rect(r) => {
                verbs.clear();
                verbs.extend([
                    graphite::Verb::Move(point(r[0], r[1])),
                    graphite::Verb::Line(point(r[2], r[1])),
                    graphite::Verb::Line(point(r[2], r[3])),
                    graphite::Verb::Line(point(r[0], r[3])),
                    graphite::Verb::Close,
                ]);
            }
            Geo::RRect(rr) => {
                verbs.clear();
                graphite::rrect_verbs(&rr, &mut verbs);
            }
            Geo::Line(a, b) => {
                verbs.clear();
                verbs.extend([graphite::Verb::Move(a), graphite::Verb::Line(b)]);
            }
            Geo::Flood => unreachable!(),
        }
        match paint.stroke {
            None => {
                let start = self.indices.len() as u32;
                let (bounds, convex) = self.fan(&verbs, &m, depth, paint_index, to_image);
                let mid = self.indices.len() as u32;
                // One convex contour: convexTessellatedWedges, shaded directly.
                if convex {
                    self.push_tri(start, scissor);
                } else if mid > start {
                    self.ops.push(Op::Stencil { start, end: mid, scissor });
                    let b = [bounds[0].floor() - 1.0, bounds[1].floor() - 1.0, bounds[2].ceil() + 1.0, bounds[3].ceil() + 1.0];
                    let vb = self.vertices.len();
                    self.quad_device(b, depth, paint_index);
                    if let Some(t) = to_image {
                        let inv = m.invert().then(t);
                        for v in &mut self.vertices[vb..] {
                            let uv = inv.apply(point(v.pos[0], v.pos[1]));
                            v.uv = [uv.x, uv.y];
                        }
                    }
                    let end = self.indices.len() as u32;
                    self.ops.push(Op::Cover { start: mid, end, scissor });
                }
            }
            Some(_) => {
                // tessellatedStrokes: Graphite's stroke tessellator, each sample once (LESS).
                let s = stroke.unwrap();
                let start = self.indices.len() as u32;
                let t = to_image.unwrap_or(Matrix::IDENTITY);
                let (vertices, indices) = (&mut self.vertices, &mut self.indices);
                graphite::stroke(&verbs, &m, s.half_width, s.join_limit, s.cap, |strip| {
                    let base = vertices.len() as u32;
                    for (dev, local) in strip {
                        let uv = t.apply(point(local[0], local[1]));
                        vertices.push(Vertex { pos: dev, depth, paint: paint_index, color: u32::MAX, uv: [uv.x, uv.y] });
                    }
                    let n = vertices.len() as u32 - base;
                    for k in 0..n.saturating_sub(2) {
                        indices.extend_from_slice(&[base + k, base + k + 1, base + k + 2]);
                    }
                });
                self.push_tris(start, scissor, true);
            }
        }
        self.verbs = verbs;
    }

    fn push_paint(&mut self, paint: &Paint, clip: Option<&graphite::AnalyticClip>) -> u32 {
        let m = self.state.matrix;
        let opacity = paint.opacity * self.state.opacity;
        let mut gpu = GpuPaint { head: [0.0, 0.0, opacity, 0.0], geometry: [0.0; 4], offsets: [[0.0; 4]; 2], colors: [[0.0; 4]; MAX_STOPS], clip: [[0.0; 4]; 3] };
        if let Some(c) = clip {
            gpu.clip = [c.xform, c.rect, c.radii_with_inverse];
        }
        // RN Skia on iOS draws into a Display P3 surface (the app's colour space), so a gradient
        // interpolates between its stops' P3 values: the stops go in as encoded P3 and the
        // shader turns each interpolated colour back into sRGB (`head.w` = 1). Measured on
        // Blur Circles' sweep: within 2.3 levels of RN, against 23 for an sRGB ramp.
        let mut put = |stops: &[Stop]| {
            let n = stops.len().min(MAX_STOPS);
            for (i, (o, c)) in stops.iter().take(n).enumerate() {
                gpu.offsets[i / 4][i % 4] = *o;
                gpu.colors[i] = srgb_to_p3(c.0);
            }
            gpu.head[1] = n as f32;
            gpu.head[3] = 1.0;
        };
        match &paint.shader {
            Shader::Solid(c) => {
                gpu.head[0] = 0.0;
                gpu.colors[0] = c.0;
                gpu.head[1] = 1.0;
            }
            Shader::Linear { start, end, stops } => {
                put(stops);
                let (a, b) = (m.apply(*start), m.apply(*end));
                gpu.head[0] = 1.0;
                gpu.geometry = [a.x, a.y, b.x, b.y];
            }
            Shader::Radial { center, radius, stops } => {
                put(stops);
                let c = m.apply(*center);
                gpu.head[0] = 2.0;
                gpu.geometry = [c.x, c.y, radius * m.max_scale(), 0.0];
            }
            Shader::Sweep { center, stops } => {
                put(stops);
                let c = m.apply(*center);
                gpu.head[0] = 3.0;
                gpu.geometry = [c.x, c.y, 0.0, 0.0];
            }
            Shader::Image { image, to_image } => {
                gpu.head[0] = 4.0;
                gpu.geometry = [image.width, image.height, image.layer as f32, 0.0];
                let [a, b, c, d, e, f] = to_image.0;
                gpu.offsets = [[a, b, c, d], [e, f, 0.0, 0.0]];
            }
            Shader::ImageNearest { image, to_image, subset } => {
                gpu.head[0] = 4.0;
                gpu.geometry = [image.width, image.height, image.layer as f32, 2.0];
                let [a, b, c, d, e, f] = to_image.0;
                gpu.offsets = [[a, b, c, d], [e, f, 0.0, 0.0]];
                gpu.colors[1] = *subset;
            }
        }
        self.paints.push(gpu);
        (self.paints.len() - 1) as u32
    }
}

/// `SkPaint`'s default miter limit.
const MITER_LIMIT: f32 = 4.0;

/// A rect as a path.
pub fn rect_path(x: f32, y: f32, w: f32, h: f32) -> Path {
    let mut b = Path::builder();
    b.add_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), Winding::Positive);
    b.build()
}

/// A rounded rect as a path (Skia's `rrect`: circular corners of radius `r`).
pub fn rrect_path(x: f32, y: f32, w: f32, h: f32, r: f32) -> Path {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    let mut b = Path::builder();
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Positive);
    b.build()
}

/// How far along each side a continuous corner of radius `r` reaches: 1.52866483 r (the
/// extent of Apple's continuous corner: CoreAnimation's `kCACornerCurveContinuous`, RN's
/// `borderCurve: 'continuous'`, UIKit's and SwiftUI's continuous rounded rects).
pub const CONTINUOUS_EXTENT: f32 = 1.528_665;

/// One continuous corner, in its own frame: `(a, b)` is `a` radii back along the side coming
/// into the corner and `b` radii along the side leaving it, from the corner's point. Three
/// cubics from the incoming side to the outgoing one: the elements of Apple's path (dumped from
/// SwiftUI's `RoundedRectangle(cornerRadius:style: .continuous)` on macOS 27, which Core
/// Animation's continuous layer fills to within 0.001 pt: see the tests).
const CONTINUOUS_CORNER: [[[f32; 2]; 3]; 3] = [
    [[1.088_493, 0.0], [0.868_407, 0.0], [0.631_494, 0.074_911]],
    [[0.372_824, 0.169_060], [0.169_060, 0.372_824], [0.074_911, 0.631_494]],
    [[0.0, 0.868_407], [0.0, 1.088_493], [0.0, CONTINUOUS_EXTENT]],
];

/// The radius a continuous corner is drawn at: `r`, at most half the shorter side (RN's
/// `resolveBorderMetrics` scales radii so adjacent ones don't overlap, which for one radius is
/// this). Core Animation does not shorten the curve past `min(w, h) / 2 / 1.52866483`: the
/// corners' curves then overlap along the side, and the path fills with the nonzero rule.
pub fn continuous_radius(w: f32, h: f32, r: f32) -> f32 {
    r.min(w.min(h).max(0.0) / 2.0).max(0.0)
}

/// Appends a rounded rect with continuous corners (RN's `borderRadius` + `borderCurve:
/// 'continuous'`, iOS's squircle) to a builder, clockwise from the top edge, for a fill or a
/// clip.
///
/// When the corners overlap along a side (a circle or a pill: the side shorter than 2 ×
/// 1.52866 r), Apple's path runs that side's straight part backwards and Core Animation fills
/// it with the nonzero rule. That region is drawn here as its own outline, which fills the same
/// points without the overlap: per such side, the main contour goes from one corner's curve to
/// the next at the point where they cross (the side's middle, by symmetry), and a second
/// contour is the strip between the side and the two curves' outer halves (the backward line's
/// part of the fill). Tessellating the overlap as it stands left a crack of MSAA samples just
/// inside the side, where the two curves' chords cross.
pub fn add_continuous_rrect<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    continuous_rrect_wound(b, x, y, w, h, r, false);
}

/// [`add_continuous_rrect`] wound the other way (mirrored about its horizontal centre line, the
/// same shape): a hole under the nonzero rule, as the inner edge of a Core Animation border
/// (the continuous rounded rect less the one inset by the border's width).
pub fn add_continuous_rrect_hole<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    continuous_rrect_wound(b, x, y, w, h, r, true);
}

fn continuous_rrect_wound<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32, hole: bool) {
    let r = continuous_radius(w, h, r);
    if r <= 0.0 {
        if hole {
            b.add_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), Winding::Negative);
        } else {
            add_rect(b, x, y, w, h);
        }
        return;
    }
    let flip = |p: Point| if hole { point(p.x, 2.0 * y + h - p.y) } else { p };
    let e = CONTINUOUS_EXTENT * r;
    // Each corner: its point, the incoming side's direction (unit), the outgoing side's, and
    // the outgoing side's length.
    let corners = [
        (point(x + w, y), vector(1.0, 0.0), vector(0.0, 1.0), h),
        (point(x + w, y + h), vector(0.0, 1.0), vector(-1.0, 0.0), w),
        (point(x, y + h), vector(-1.0, 0.0), vector(0.0, -1.0), h),
        (point(x, y), vector(0.0, -1.0), vector(1.0, 0.0), w),
    ];
    // Every point goes through `flip` (a hole is the mirror image, wound the other way); the
    // cuts below are in curve parameters, which an affine flip keeps.
    let frame = |k: usize, [a, c]: [f32; 2]| {
        let (corner, incoming, outgoing, _) = corners[k];
        flip(corner - incoming * (a * r) + outgoing * (c * r))
    };
    let cubic = |k: usize, i: usize| -> [Point; 4] {
        let start = if i == 0 { [CONTINUOUS_EXTENT, 0.0] } else { CONTINUOUS_CORNER[i - 1][2] };
        let [c1, c2, to] = CONTINUOUS_CORNER[i];
        [frame(k, start), frame(k, c1), frame(k, c2), frame(k, to)]
    };
    // Where corner k's last curve meets corner k + 1's first one on their side (overlapping
    // only): the parameter on the last curve (the first one's is 1 − t, mirrored).
    let crossing = |k: usize| -> Option<f32> {
        let side = corners[k].3;
        if 2.0 * e <= side {
            return None;
        }
        // The last curve's coordinate along the outgoing side runs 0.6315 r → 1.5287 r.
        let [_, c1, c2, to] = [CONTINUOUS_CORNER[1][2], CONTINUOUS_CORNER[2][0], CONTINUOUS_CORNER[2][1], CONTINUOUS_CORNER[2][2]];
        let p0 = CONTINUOUS_CORNER[1][2];
        let along = |t: f64| {
            let mt = 1.0 - t;
            mt * mt * mt * p0[1] as f64 + 3.0 * mt * mt * t * c1[1] as f64 + 3.0 * mt * t * t * c2[1] as f64 + t * t * t * to[1] as f64
        };
        let target = side as f64 / 2.0 / r as f64;
        let (mut lo, mut hi) = (0.0f64, 1.0f64);
        for _ in 0..60 {
            let mid = 0.5 * (lo + hi);
            if along(mid) < target {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        Some((0.5 * (lo + hi)) as f32)
    };
    let cross: [Option<f32>; 4] = std::array::from_fn(crossing);
    // `p` cut to [t0, t1] (de Casteljau).
    let cut = |p: [Point; 4], t0: f32, t1: f32| -> [Point; 4] {
        let split = |p: [Point; 4], t: f32| -> ([Point; 4], [Point; 4]) {
            let l = |a: Point, b: Point| a.lerp(b, t);
            let (a, bb, c) = (l(p[0], p[1]), l(p[1], p[2]), l(p[2], p[3]));
            let (d, f) = (l(a, bb), l(bb, c));
            let m = l(d, f);
            ([p[0], a, d, m], [m, f, c, p[3]])
        };
        let right = if t0 > 0.0 { split(p, t0).1 } else { p };
        if t1 < 1.0 {
            split(right, (t1 - t0) / (1.0 - t0)).0
        } else {
            right
        }
    };
    let prev = |k: usize| (k + 3) % 4;
    // The main contour, from corner 0's first curve.
    match cross[prev(0)] {
        Some(t) => b.begin(cut(cubic(0, 0), 1.0 - t, 1.0)[0]),
        // From the top side's left end, as Apple's path.
        None => b.begin(frame(3, [0.0, CONTINUOUS_EXTENT])),
    };
    for k in 0..4 {
        for i in 0..3 {
            let mut c = cubic(k, i);
            if i == 0 {
                match cross[prev(k)] {
                    Some(t) => c = cut(c, 1.0 - t, 1.0),
                    // The side's straight part.
                    None => {
                        b.line_to(c[0]);
                    }
                }
            }
            if i == 2 {
                if let Some(t) = cross[k] {
                    c = cut(c, 0.0, t);
                }
            }
            b.cubic_bezier_to(c[1], c[2], c[3]);
        }
    }
    b.end(true);
    // The strips the backward lines fill: the next corner's first curve to the crossing, this
    // corner's last curve from it, the side back.
    for k in 0..4 {
        if let Some(t) = cross[k] {
            let n = (k + 1) % 4;
            let into = cut(cubic(n, 0), 0.0, 1.0 - t);
            let out = cut(cubic(k, 2), t, 1.0);
            b.begin(into[0]);
            b.cubic_bezier_to(into[1], into[2], into[3]);
            b.cubic_bezier_to(out[1], out[2], out[3]);
            b.end(true);
        }
    }
}

/// A rounded rect with continuous corners as a path ([`add_continuous_rrect`]).
pub fn continuous_rrect_path(x: f32, y: f32, w: f32, h: f32, r: f32) -> Path {
    let mut b = Path::builder();
    add_continuous_rrect(&mut b, x, y, w, h, r);
    b.build()
}

impl Canvas {
    /// A view with `borderRadius` and `borderCurve: 'continuous'`: [`continuous_rrect_path`].
    pub fn draw_continuous_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, paint: &Paint) {
        self.draw_with(paint, |b| add_continuous_rrect(b, x, y, w, h, r));
    }

    /// A continuous rounded-rect clip (`overflow: 'hidden'` on a continuous view).
    pub fn clip_continuous_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32) {
        self.clip_with(|b| add_continuous_rrect(b, x, y, w, h, r));
    }
}

/// A border RN draws itself (RCTBorderDrawing's border image, used when a view's border is not
/// Core Animation's: translucent and not clipping): the ring between the rounded rect of radius
/// `r` and the one inset by `width` with radius `r − width`, both with circular corners
/// (`RCTPathCreateWithRoundedRect`), whatever the view's `borderCurve`.
pub fn border_ring_path(x: f32, y: f32, w: f32, h: f32, r: f32, width: f32) -> Path {
    let mut b = Path::builder();
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Positive);
    let (iw, ih) = (w - 2.0 * width, h - 2.0 * width);
    if iw > 0.0 && ih > 0.0 {
        let ir = (r - width).max(0.0).min(iw / 2.0).min(ih / 2.0);
        b.add_rounded_rectangle(
            &lyon::math::Box2D::new(point(x + width, y + width), point(x + w - width, y + h - width)),
            &BorderRadii::new(ir),
            Winding::Negative,
        );
    }
    b.build()
}

/// What [`path_builder`] returns.
pub type PathBuilder = lyon::path::path::Builder;
/// The builder [`Canvas::draw_with`] and [`Canvas::clip_with`] hand out.
pub type ScratchBuilder<'a> = lyon::path::builder::NoAttributes<lyon::path::path_buffer::Builder<'a>>;

/// A path builder, for demos that build paths point by point (Skia's `PathBuilder`).
pub fn path_builder() -> lyon::path::path::Builder {
    Path::builder()
}

/// Appends a rounded rect to a builder (`PathBuilder.addRRect`).
pub fn add_rrect<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Positive);
}

/// Appends a rect to a builder (`PathBuilder.addRect`).
pub fn add_rect<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32) {
    b.add_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), Winding::Positive);
}

/// Appends an oval to a builder (`<Oval x y width height>`, `PathBuilder.addOval`): the ellipse
/// inscribed in the rect, as Skia builds it (four quarter conics from the right, clockwise).
pub fn add_oval<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32) {
    conics::add_oval(b, [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)], false, 1);
}

/// [`add_oval`] from Skia's start point `index` of the box (0 top, 1 right, 2 bottom, 3 left),
/// clockwise (`addOval(oval, kCW, index)`). `PathBuilder.addRRect` of a rounded rect whose radii
/// make it an oval (`rrect(rect, r, r)` with r ≥ half of each side: `SkRRect::setRectXY` clamps
/// it to an oval) is this with index 3: addRRect's clockwise start 6, halved by
/// `SkPathPriv::SimplifyRRect`.
pub fn add_oval_from<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, index: u32) {
    conics::add_oval(b, [x.min(x + w), y.min(y + h), x.max(x + w), y.max(y + h)], false, index);
}

/// Appends a circle to a builder (`PathBuilder.addCircle`): Skia's four quarter conics from
/// (cx + r, cy), clockwise.
pub fn add_circle<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, cx: f32, cy: f32, r: f32) {
    if r >= 0.0 {
        conics::add_oval(b, [cx - r, cy - r, cx + r, cy + r], false, 1);
    }
}

/// Appends an arc of the oval inscribed in a rect (`PathBuilder.addArc(oval, startAngle,
/// sweepAngle)`): a new contour from `start_deg`, sweeping `sweep_deg` (degrees, clockwise on
/// screen as Skia's), as Skia's conics (a quadrant each, the rest in one more); a full turn from
/// a quadrant is the oval.
pub fn add_arc<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, start_deg: f32, sweep_deg: f32) {
    conics::add_arc(b, [x, y, x + w, y + h], start_deg, sweep_deg);
}

/// Appends `PathBuilder.arcTo(rx, ry, xAxisRotateInDegrees, useSmallArc, isCCW, x, y)` (an SVG
/// arc, Skia's `SkPath::arcTo` with `ArcSize` and `PathDirection`) from `from` to `to`, as
/// Skia's conics (at most 120° each) on the current contour; `rArcTo` is the same with
/// `to = from + (dx, dy)`.
#[allow(clippy::too_many_arguments)]
pub fn add_svg_arc<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, from: Point, to: Point, rx: f32, ry: f32, x_rotation_deg: f32, small_arc: bool, ccw: bool) {
    conics::svg_arc_to(b, from, rx, ry, x_rotation_deg, !small_arc, ccw, to);
}

/// Appends a rounded rect wound the other way (a hole: with a rect around it, the nonzero fill
/// of the two is everything outside the rounded rect, as an inverted clip or an even-odd mask).
pub fn add_rrect_hole<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Negative);
}

/// Appends a circle exactly as Skia's `addCircle` draws it: its four quarter conics (in a lyon
/// reader's eyes, their cubics). `hole` winds it the other way (`SkPathDirection::kCCW`: an
/// inverted clip with a rect around it).
pub fn add_circle_fine<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, cx: f32, cy: f32, r: f32, hole: bool) {
    let r = r.abs();
    conics::add_oval(b, [cx - r, cy - r, cx + r, cy + r], hole, 1);
}

/// A path measured once, to be drawn trimmed every frame without allocating
/// ([`Canvas::draw_trimmed`], `<Path path start end>` with an animated `end`).
pub struct MeasuredPath {
    path: Path,
    measurements: lyon::algorithms::measure::PathMeasurements,
}

impl MeasuredPath {
    /// `path`, measured as [`trim`] measures it.
    pub fn new(path: Path) -> MeasuredPath {
        let measurements = lyon::algorithms::measure::PathMeasurements::from_path(&path, 0.01);
        MeasuredPath { path, measurements }
    }
    /// The whole path.
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Canvas {
    /// `<Path path start end paint>` ([`trim`]) of a [`MeasuredPath`], built in the canvas's kept
    /// buffer: nothing when `end <= start`.
    pub fn draw_trimmed(&mut self, path: &MeasuredPath, start: f32, end: f32, paint: &Paint) {
        let (start, end) = (start.clamp(0.0, 1.0), end.clamp(0.0, 1.0));
        if end <= start {
            return;
        }
        let mut sampler = path.measurements.create_sampler(&path.path, lyon::algorithms::measure::SampleType::Normalized);
        self.draw_with(paint, |b| sampler.split_range(start..end, b));
    }
}

/// `<Path path start end>`: the part of `path` between the fractions `start` and `end` of its
/// length (Skia's trim path effect, `SkTrimPathEffect` in normal mode), as a new path; empty
/// when `end <= start`.
pub fn trim(path: &Path, start: f32, end: f32) -> Path {
    let (start, end) = (start.clamp(0.0, 1.0), end.clamp(0.0, 1.0));
    let mut b = Path::builder();
    if end > start {
        let measurements = lyon::algorithms::measure::PathMeasurements::from_path(path, 0.01);
        let mut sampler = measurements.create_sampler(path, lyon::algorithms::measure::SampleType::Normalized);
        sampler.split_range(start..end, &mut b);
    }
    b.build()
}

/// `<CornerPathEffect r>` on an open polyline (`moveTo(points[0])`, then `lineTo` each of
/// `points[1..]`), as `SkCornerPathEffect` filters it: each corner becomes a quadratic whose
/// control point is the corner, from `radius` before it to `radius` after it along the
/// segments (half a segment when it is shorter than `2 × radius`, which then has no straight
/// part), and the last segment runs on to the last point.
pub fn corner_polyline(points: &[Point], radius: f32) -> Path {
    let mut b = Path::builder();
    let Some(&first) = points.first() else { return b.build() };
    b.begin(first);
    if radius <= 0.0 {
        for &p in &points[1..] {
            b.line_to(p);
        }
        b.end(false);
        return b.build();
    }
    for pair in points.windows(2) {
        let (a, c) = (pair[0], pair[1]);
        // ComputeStep.
        let d = c - a;
        let dist = d.length();
        let (step, segment) = if dist <= radius * 2.0 { (d * 0.5, false) } else { (d * (radius / dist), true) };
        // The previous corner (a first segment's start is the moveTo, already valid).
        b.quadratic_bezier_to(a, a + step);
        if segment {
            b.line_to(c - step);
        }
    }
    if points.len() > 1 {
        b.line_to(points[points.len() - 1]);
    }
    b.end(false);
    b.build()
}

#[cfg(test)]
mod path_tests {
    use super::*;

    #[test]
    fn corners_round_as_skia_rounds_them() {
        // A right angle of long legs: straight to 20 before the corner, a quad through it.
        let p = corner_polyline(&[point(0.0, 0.0), point(100.0, 0.0), point(100.0, 100.0)], 20.0);
        let events: Vec<_> = p.iter().collect();
        use lyon::path::Event;
        assert!(matches!(events[1], Event::Quadratic { to, .. } if to == point(20.0, 0.0)));
        assert!(matches!(events[2], Event::Line { to, .. } if to == point(80.0, 0.0)));
        assert!(matches!(events[3], Event::Quadratic { ctrl, to, .. } if ctrl == point(100.0, 0.0) && to == point(100.0, 20.0)));
        assert!(matches!(events[5], Event::Line { to, .. } if to == point(100.0, 100.0)));
        // Short legs: from midpoint to midpoint.
        let q = corner_polyline(&[point(0.0, 0.0), point(10.0, 0.0), point(10.0, 10.0)], 20.0);
        let events: Vec<_> = q.iter().collect();
        assert!(matches!(events[2], Event::Quadratic { ctrl, to, .. } if ctrl == point(10.0, 0.0) && to == point(10.0, 5.0)));
    }

    #[test]
    fn continuous_corners_are_apples_path() {
        use lyon::path::Event;
        // 200 × 100 at (10, 20), radius 20: SwiftUI's continuous RoundedRectangle on macOS 27
        // gives, for its corners (here the top-right), a side ending 1.52866 r from the corner
        // and three cubics: (21.7698, 0) (17.36814, 0) → (12.62988, 1.49823), then
        // (7.45648, 3.38120) (3.38120, 7.45648) → (1.49823, 12.62988), then (0, 17.36814)
        // (0, 21.76980) → (0, 30.57330), as offsets from the corner.
        let p = continuous_rrect_path(10.0, 20.0, 200.0, 100.0, 20.0);
        let events: Vec<_> = p.iter().collect();
        let close = |a: Point, b: Point| (a - b).length() < 1e-3;
        let tr = |a: f32, d: f32| point(210.0 - a, 20.0 + d);
        assert!(matches!(events[0], Event::Begin { at } if close(at, point(10.0 + 30.5733, 20.0))));
        assert!(matches!(events[1], Event::Line { to, .. } if close(to, tr(30.5733, 0.0))));
        let cubics = [
            (tr(21.7698, 0.0), tr(17.36814, 0.0), tr(12.62988, 1.49823)),
            (tr(7.45648, 3.38120), tr(3.38120, 7.45648), tr(1.49823, 12.62988)),
            (tr(0.0, 17.36814), tr(0.0, 21.76980), tr(0.0, 30.57330)),
        ];
        for (k, (c1, c2, to)) in cubics.into_iter().enumerate() {
            match events[2 + k] {
                Event::Cubic { ctrl1, ctrl2, to: t, .. } => assert!(close(ctrl1, c1) && close(ctrl2, c2) && close(t, to), "{k}: {:?}", events[2 + k]),
                ref other => panic!("{other:?}"),
            }
        }
        // Four corners of a side and three cubics, closed.
        assert_eq!(events.len(), 1 + 4 * 4 + 1);
        let bb = lyon::algorithms::aabb::bounding_box(p.iter());
        assert!(close(bb.min, point(10.0, 20.0)) && close(bb.max, point(210.0, 120.0)), "{bb:?}");
    }

    /// The width of `path` along the row at `y` under the nonzero rule: the flattened path's
    /// crossings of the row, by x, summed where the winding isn't 0.
    fn row_width(path: &Path, y: f32) -> f32 {
        use lyon::path::iterator::PathIterator;
        let mut crossings: Vec<(f32, i32)> = Vec::new();
        for e in path.iter().flattened(1e-4) {
            if let lyon::path::Event::Line { from, to } | lyon::path::Event::End { last: from, first: to, .. } = e {
                if (from.y <= y) != (to.y <= y) {
                    let x = from.x + (to.x - from.x) * (y - from.y) / (to.y - from.y);
                    crossings.push((x, if to.y > from.y { 1 } else { -1 }));
                }
            }
        }
        crossings.sort_by(|a, b| a.0.total_cmp(&b.0));
        let (mut winding, mut width, mut start) = (0, 0.0, 0.0);
        for (x, d) in crossings {
            if winding == 0 {
                start = x;
            }
            winding += d;
            if winding == 0 {
                width += x - start;
            }
        }
        width
    }

    #[test]
    fn continuous_corners_fill_as_core_animation() {
        // Rows of a CALayer (cornerCurve .continuous, a white background) rendered by Core
        // Animation on macOS 27 at 64×: (row centre, covered width). 58 × 58 at radius 29 and
        // 200 × 100 at 40 are past min/2/1.52866 (corners overlapping), 96 × 64 at 20 within it.
        let cases: [(f32, f32, f32, &[(f32, f32)]); 3] = [
            (58.0, 58.0, 29.0, &[(0.257812, 0.6505), (1.00781, 12.0493), (3.00781, 25.4397), (8.00781, 40.1782), (15.0078, 50.7338), (25.0078, 56.8257)]),
            (200.0, 100.0, 40.0, &[(0.257812, 115.6765), (1.00781, 131.9961), (3.00781, 149.5420), (8.00781, 168.1822), (15.0078, 182.6141), (25.0078, 193.8216)]),
            (96.0, 64.0, 20.0, &[(0.257812, 57.6890), (1.00781, 67.2327), (3.00781, 77.0929), (8.00781, 88.0700), (15.0078, 94.2721), (25.0078, 95.9604)]),
        ];
        for (w, h, r, rows) in cases {
            let p = continuous_rrect_path(0.0, 0.0, w, h, r);
            for &(y, want) in rows {
                // CA's row is 1/64 pt tall: its width is the mean over it.
                let got = (0..8).map(|k| row_width(&p, y - 0.5 / 64.0 + (k as f32 + 0.5) / 512.0)).sum::<f32>() / 8.0;
                assert!((got - want).abs() < 0.03, "{w}×{h} r {r}, row {y}: {got} vs CA {want}");
            }
        }
    }

    #[test]
    fn continuous_radius_is_rns() {
        assert_eq!(continuous_radius(120.0, 44.0, 22.0), 22.0);
        assert_eq!(continuous_radius(120.0, 44.0, 40.0), 22.0);
        assert_eq!(continuous_radius(120.0, 44.0, -3.0), 0.0);
        assert_eq!(continuous_rrect_path(0.0, 0.0, 10.0, 10.0, 0.0).iter().count(), rect_path(0.0, 0.0, 10.0, 10.0).iter().count());
    }

    #[test]
    fn trim_keeps_the_first_part_of_a_line() {
        let mut b = Path::builder();
        b.begin(point(0.0, 0.0));
        b.line_to(point(100.0, 0.0));
        b.end(false);
        let half = trim(&b.build(), 0.0, 0.25);
        let bb = lyon::algorithms::aabb::bounding_box(half.iter());
        assert!((bb.max.x - 25.0).abs() < 0.01, "{bb:?}");
        assert_eq!(trim(&half, 0.5, 0.5).iter().count(), 0);
    }

    #[test]
    fn a_fine_circle_stays_on_the_circle() {
        let mut b = Path::builder();
        add_circle_fine(&mut b, 10.0, 20.0, 950.0, false);
        let p = b.build();
        // What the canvas draws: Skia's four quarter conics, on the circle.
        let mut verbs = Vec::new();
        push_verbs(p.iter(), &mut verbs);
        let mut worst: f64 = 0.0;
        let mut at = point(0.0, 0.0);
        let mut conics = 0;
        for v in &verbs {
            match *v {
                graphite::Verb::Move(q) => at = q,
                graphite::Verb::Conic(c, to, w) => {
                    conics += 1;
                    for k in 0..=32 {
                        let t = k as f64 / 32.0;
                        let (a, b2, c2) = ((1.0 - t) * (1.0 - t), 2.0 * t * (1.0 - t) * w as f64, t * t);
                        let d = a + b2 + c2;
                        let x = (a * at.x as f64 + b2 * c.x as f64 + c2 * to.x as f64) / d;
                        let y = (a * at.y as f64 + b2 * c.y as f64 + c2 * to.y as f64) / d;
                        worst = worst.max((((x - 10.0).powi(2) + (y - 20.0).powi(2)).sqrt() - 950.0).abs());
                    }
                    at = to;
                }
                _ => {}
            }
        }
        assert_eq!(conics, 4);
        // f32 coordinates near 1000 carry 6e-5 of rounding.
        assert!(worst < 2e-3, "{worst}");
        // Clockwise on screen from (r, 0) (y down: through +y first); the hole the other way.
        assert!(matches!(p.iter().nth(1), Some(PathEvent::Cubic { to, .. }) if to.y > 20.0));
        let mut h = Path::builder();
        add_circle_fine(&mut h, 0.0, 0.0, 1.0, true);
        assert!(matches!(h.build().iter().nth(1), Some(PathEvent::Cubic { to, .. }) if to.y < 0.0));
    }

    #[test]
    fn a_small_clockwise_arc_bulges_out_of_a_corner() {
        // rArcTo(10, 10, 0, true, false, 10, 10) from (0, 0): the quarter circle about (0, 10),
        // through (7.07, 2.93) (clockwise on screen), not the one about (10, 0).
        let mut b = Path::builder();
        b.begin(point(0.0, 0.0));
        add_svg_arc(&mut b, point(0.0, 0.0), point(10.0, 10.0), 10.0, 10.0, 0.0, true, false);
        b.end(false);
        let p = b.build();
        let bb = lyon::algorithms::aabb::bounding_box(p.iter());
        assert!((bb.max.x - 10.0).abs() < 1e-3 && (bb.min.y).abs() < 1e-3, "{bb:?}");
        let measured = MeasuredPath::new(p);
        let mut c = Canvas::default();
        c.begin(1.0);
        c.draw_trimmed(&measured, 0.0, 0.5, &Paint::stroke(Color::BLACK, 1.0));
        assert!(!c.vertices.is_empty());
        let mid = trim(measured.path(), 0.0, 0.5);
        let end = mid.iter().filter(|e| !matches!(e, PathEvent::End { .. })).last().map(|e| e.to()).unwrap();
        // (Lengths are measured on the flattened path, tolerance 0.01, as `trim` measures.)
        assert!((end.x - 7.0711).abs() < 0.02 && (end.y - 2.9289).abs() < 0.02, "{end:?}");
    }

    #[test]
    fn a_quarter_arc_ends_where_skia_ends_it() {
        let mut b = Path::builder();
        add_arc(&mut b, 0.0, 0.0, 20.0, 20.0, 0.0, 90.0);
        let p = b.build();
        let bb = lyon::algorithms::aabb::bounding_box(p.iter());
        // From (20, 10) clockwise on screen to (10, 20).
        assert!((bb.min.x - 10.0).abs() < 0.01 && (bb.max.y - 20.0).abs() < 0.01, "{bb:?}");
    }
}

/// `path.transform(m)` / `PathBuilder.transform(m)`: `path` with every point mapped by `m`.
pub fn transform_path(path: &Path, m: &Matrix) -> Path {
    let [a, b, c, d, e, f] = m.0;
    path.clone().transformed(&lyon::math::Transform::new(a, b, c, d, e, f))
}

/// An `RSXform` (`<Atlas transforms>`): a sprite's point (x, y) lands at
/// (scos·x − ssin·y + tx, ssin·x + scos·y + ty).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RsXform {
    /// scale × cos(rotation).
    pub scos: f32,
    /// scale × sin(rotation).
    pub ssin: f32,
    /// Translation x.
    pub tx: f32,
    /// Translation y.
    pub ty: f32,
}

impl Canvas {
    /// One quad of four local corners (clockwise from the top-left), with their image pixels
    /// and a colour, through the current transform.
    fn quad(&mut self, corners: [Point; 4], uv: [Point; 4], paint: u32, color: u32, depth: f32) {
        let base = self.vertices.len() as u32;
        let m = self.state.matrix;
        for (p, t) in corners.iter().zip(uv.iter()) {
            let q = m.apply(*p);
            self.vertices.push(Vertex { pos: [q.x, q.y], depth, paint, color, uv: [t.x, t.y] });
        }
        self.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    /// The clip stack for a draw that keeps its own geometry (an atlas, a shadow) over the local
    /// rect `local`: its clip and depth, `None` when clipped out.
    fn plain_clip(&mut self, local: [f32; 4]) -> Option<(DrawClip, f32)> {
        let xf = graphite::Xf::new(self.state.matrix);
        if !xf.valid() {
            return None;
        }
        let mut geo = Geo::Path;
        let mut clip = DrawClip::default();
        if !self.visit_clips(&mut geo, &xf, false, xf.map_rect(local), EMPTY, &mut clip) {
            return None;
        }
        let depth = self.next_depth();
        self.use_msaa_clips(&clip, depth);
        Some((clip, depth))
    }

    /// `<Atlas image sprites transforms colors colorBlendMode>`: each sprite (a rect of the
    /// image's pixels) drawn by its [`RsXform`]. With `colors`, each sprite's colour is blended
    /// with it: `src_in` (`colorBlendMode="srcIn"`) paints the colour in the image's alpha;
    /// otherwise it multiplies the image (`modulate`). As Graphite's drawAtlas (vertices), the
    /// sprites are not anti-aliased.
    pub fn draw_atlas(&mut self, image: ImageRef, sprites: &[Rect], transforms: &[RsXform], colors: Option<&[Color]>, src_in: bool) {
        let at = |x: &RsXform, px: f32, py: f32| point(x.scos * px - x.ssin * py + x.tx, x.ssin * px + x.scos * py + x.ty);
        let mut b = EMPTY;
        for (s, x) in sprites.iter().zip(transforms.iter()) {
            for p in [at(x, 0.0, 0.0), at(x, s.width, 0.0), at(x, s.width, s.height), at(x, 0.0, s.height)] {
                b = [b[0].min(p.x), b[1].min(p.y), b[2].max(p.x), b[3].max(p.y)];
            }
        }
        if !(b[0] <= b[2]) {
            return;
        }
        let Some((clip, depth)) = self.plain_clip(b) else { return };
        let paint = self.push_paint(&Paint::image(image, Matrix::IDENTITY), clip.analytic.as_ref());
        let p = &mut self.paints[paint as usize];
        p.offsets = [[0.0; 4]; 2];
        if src_in {
            p.geometry[3] = 1.0;
        }
        let start = self.indices.len() as u32;
        for (i, (s, x)) in sprites.iter().zip(transforms.iter()).enumerate() {
            let color = colors.and_then(|c| c.get(i)).map_or(u32::MAX, |c| {
                let [r, g, b, a] = c.0.map(|v| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u32);
                r | (g << 8) | (b << 16) | (a << 24)
            });
            let corners = [at(x, 0.0, 0.0), at(x, s.width, 0.0), at(x, s.width, s.height), at(x, 0.0, s.height)];
            let uv = [point(s.x, s.y), point(s.x + s.width, s.y), point(s.x + s.width, s.y + s.height), point(s.x, s.y + s.height)];
            self.quad(corners, uv, paint, color, depth);
        }
        self.push_tri(start, clip.scissor);
    }

    /// A view's box shadow (RN's `boxShadow` / iOS `shadow*` on a rounded view, Skia's
    /// `<Shadow>` of a rounded rect): the rounded rect `x, y, w, h, r` blurred by a Gaussian of
    /// σ = `sigma` points, in `color`, evaluated per pixel (Evan Wallace's closed form: exact
    /// across, four samples down). For axis-aligned transforms (scale and translate).
    #[allow(clippy::too_many_arguments)]
    pub fn draw_rrect_shadow(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, sigma: f32, color: Color) {
        let m = self.state.matrix;
        let s = m.max_scale();
        let (a, b) = (m.apply(point(x, y)), m.apply(point(x + w, y + h)));
        let sigma = sigma.max(1e-3);
        let e = 3.0 * sigma;
        let (x0, y0, x1, y1) = (x - e, y - e, x + w + e, y + h + e);
        let Some((clip, depth)) = self.plain_clip([x0, y0, x1, y1]) else { return };
        let mut gpu = GpuPaint {
            head: [5.0, 1.0, self.state.opacity, 0.0],
            geometry: [a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y)],
            offsets: [[0.0; 4]; 2],
            colors: [[0.0; 4]; MAX_STOPS],
            clip: clip.analytic.map_or([[0.0; 4]; 3], |c| [c.xform, c.rect, c.radii_with_inverse]),
        };
        gpu.offsets[0] = [r.min(w / 2.0).min(h / 2.0).max(0.0) * s, sigma * s, 0.0, 0.0];
        gpu.colors[0] = color.0;
        self.paints.push(gpu);
        let paint = (self.paints.len() - 1) as u32;
        let start = self.indices.len() as u32;
        let corners = [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
        self.quad(corners, corners, paint, u32::MAX, depth);
        self.push_tri(start, clip.scissor);
    }

    /// [`Canvas::draw_rrect_shadow`] under any transform: the shadow is evaluated in the rounded
    /// rect's own space (σ and `r` in its units) and drawn through the current transform, as Core
    /// Animation draws a rotated or scaled layer's shadow (RN's `boxShadow` on a view with a
    /// `rotate` / `scale` transform: RCTBoxShadow's shadow layer is a sublayer of the view's).
    #[allow(clippy::too_many_arguments)]
    pub fn draw_rrect_shadow_local(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, sigma: f32, color: Color) {
        let sigma = sigma.max(1e-3);
        let e = 3.0 * sigma;
        let (x0, y0, x1, y1) = (x - e, y - e, x + w + e, y + h + e);
        let Some((clip, depth)) = self.plain_clip([x0, y0, x1, y1]) else { return };
        let mut gpu = GpuPaint {
            head: [5.0, 1.0, self.state.opacity, 0.0],
            geometry: [x, y, x + w, y + h],
            offsets: [[0.0; 4]; 2],
            colors: [[0.0; 4]; MAX_STOPS],
            clip: clip.analytic.map_or([[0.0; 4]; 3], |c| [c.xform, c.rect, c.radii_with_inverse]),
        };
        gpu.offsets[0] = [r.min(w / 2.0).min(h / 2.0).max(0.0), sigma, 1.0, 0.0];
        gpu.colors[0] = color.0;
        self.paints.push(gpu);
        let paint = (self.paints.len() - 1) as u32;
        let start = self.indices.len() as u32;
        let corners = [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
        self.quad(corners, corners, paint, u32::MAX, depth);
        self.push_tri(start, clip.scissor);
    }
}

#[cfg(test)]
mod shadow_tests {
    use super::*;

    #[test]
    fn a_local_shadow_is_evaluated_in_its_own_space() {
        let mut c = Canvas::default();
        c.begin(3.0);
        c.translate(100.0, 50.0);
        c.rotate(0.3);
        c.draw_rrect_shadow_local(0.0, 0.0, 120.0, 120.0, 25.0, 5.0, Color::BLACK.alpha(0.1));
        let p = c.paints[0];
        // The rect, radius and σ in points (not device pixels), flagged local.
        assert_eq!(p.geometry, [0.0, 0.0, 120.0, 120.0]);
        assert_eq!(p.offsets[0], [25.0, 5.0, 1.0, 0.0]);
        // The quad's uv is its local corners; its positions went through the rotation.
        assert_eq!(c.vertices[0].uv, [-15.0, -15.0]);
        let m = c.matrix().apply(point(-15.0, -15.0));
        assert!((c.vertices[0].pos[0] - m.x).abs() < 1e-4 && (c.vertices[0].pos[1] - m.y).abs() < 1e-4);
        // The device-space shadow keeps its flag off.
        c.begin(3.0);
        c.draw_rrect_shadow(0.0, 0.0, 120.0, 120.0, 25.0, 5.0, Color::BLACK);
        assert_eq!(c.paints[0].offsets[0][2], 0.0);
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod graphite_parity;
