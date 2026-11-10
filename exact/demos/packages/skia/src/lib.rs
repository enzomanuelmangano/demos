//! @shopify/react-native-skia's drawing for the Demos app's GPU surfaces.
//!
//! A demo records its Skia `<Canvas>` into a [`Canvas`] each frame, as its JSX declares it:
//! paths (fill or stroke), circles, rects and rounded rects, with a [`Paint`] (a colour or a
//! linear, radial or sweep gradient), under transforms, opacity and clips. [`Renderer::draw`]
//! puts the frame into the surface's target: one vertex buffer, one pipeline, MSAA 4×.
//!
//! Paths are tessellated by lyon on the CPU (in local space, then transformed), so nothing
//! needs compute or indirect dispatch: it runs the same on a phone and in the iOS Simulator.
//! Gradients are evaluated per pixel in the shader, interpolated as Skia does (unpremultiplied
//! sRGB). Clips are stencil levels.
//!
//! Text is [`Font`] + [`Canvas::draw_text`] (glyph outlines filled as paths); SVG path strings
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
use lyon::tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, LineCap, LineJoin, StrokeOptions, StrokeTessellator,
    StrokeVertex, VertexBuffers,
};

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

/// One vertex: a device-pixel position and the paint it is coloured with.
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct Vertex {
    pub pos: [f32; 2],
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
    /// Each stop's offset, in two vec4s.
    pub offsets: [[f32; 4]; 2],
    /// Each stop's straight sRGB colour.
    pub colors: [[f32; 4]; MAX_STOPS],
}

/// A batch of triangles, a stencil step, or a change of clip level.
#[derive(Clone, Debug)]
pub(crate) enum Op {
    /// Indices `start..end`, drawn where the stencil equals `level`.
    Draw { start: u32, end: u32, level: u32 },
    /// Indices `start..end`, drawn where the stencil equals `level`, each sample once (it steps
    /// the stencil to `level + 1`; a `ClipOut` of the same indices steps it back): a stroke's
    /// overlapping triangles cover a pixel once, as Skia's coverage does.
    DrawOnce { start: u32, end: u32, level: u32 },
    /// Indices `start..end`, incrementing the stencil where it equals `level`.
    ClipIn { start: u32, end: u32, level: u32 },
    /// Indices `start..end`, decrementing the stencil where it equals `level + 1`.
    ClipOut { start: u32, end: u32, level: u32 },
}

#[derive(Clone)]
struct State {
    matrix: Matrix,
    opacity: f32,
    /// The clips pushed since this save: index ranges to undo at restore.
    clips: Vec<(u32, u32)>,
}

/// One frame's drawing, in canvas points; the renderer scales it to device pixels.
pub struct Canvas {
    pub(crate) vertices: Vec<Vertex>,
    pub(crate) indices: Vec<u32>,
    pub(crate) paints: Vec<GpuPaint>,
    pub(crate) ops: Vec<Op>,
    level: u32,
    state: State,
    saved: Vec<State>,
    fill: FillTessellator,
    stroke: StrokeTessellator,
    /// The path a shape draw ([`Canvas::draw_circle`], …) is built into, kept between draws.
    scratch: lyon::path::PathBuffer,
    buffers: VertexBuffers<Point, u32>,
}

impl Default for Canvas {
    fn default() -> Self {
        Canvas {
            vertices: Vec::new(),
            indices: Vec::new(),
            paints: Vec::new(),
            ops: Vec::new(),
            level: 0,
            state: State { matrix: Matrix::IDENTITY, opacity: 1.0, clips: Vec::new() },
            saved: Vec::new(),
            fill: FillTessellator::new(),
            stroke: StrokeTessellator::new(),
            buffers: VertexBuffers::new(),
            scratch: lyon::path::PathBuffer::new(),
        }
    }
}

impl Canvas {
    /// Starts a frame at `scale` device pixels per point. Buffers are kept between frames.
    pub fn begin(&mut self, scale: f32) {
        self.vertices.clear();
        self.indices.clear();
        self.paints.clear();
        self.ops.clear();
        self.level = 0;
        self.saved.clear();
        self.state = State { matrix: Matrix::scale(scale, scale), opacity: 1.0, clips: Vec::new() };
    }

    /// `canvas.save()` / a `<Group>`'s start.
    pub fn save(&mut self) {
        let mut next = self.state.clone();
        next.clips.clear();
        self.saved.push(std::mem::replace(&mut self.state, next));
    }

    /// `canvas.restore()` / a `<Group>`'s end: its transform, opacity and clips undone.
    pub fn restore(&mut self) {
        for (start, end) in std::mem::take(&mut self.state.clips).into_iter().rev() {
            self.level -= 1;
            self.ops.push(Op::ClipOut { start, end, level: self.level });
        }
        if let Some(state) = self.saved.pop() {
            self.state = state;
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
    /// path a demo refills every frame without allocating).
    pub fn draw_path_events<I: IntoIterator<Item = lyon::path::PathEvent>>(&mut self, path: I, paint: &Paint) {
        let scale = self.state.matrix.max_scale().max(1e-3);
        // A stroke thinner than a device pixel is drawn a pixel wide at its share of the
        // alpha, as Skia covers a hairline: MSAA alone breaks it into dashes.
        let thin = paint.stroke.filter(|w| w * scale < 1.0);
        let thinned;
        let paint = match thin {
            Some(w) => {
                thinned = Paint { stroke: Some(1.0 / scale), opacity: paint.opacity * (w * scale).max(0.0), ..paint.clone() };
                &thinned
            }
            None => paint,
        };
        let tolerance = 0.2 / scale;
        self.buffers.vertices.clear();
        self.buffers.indices.clear();
        let ok = match paint.stroke {
            Some(width) => self
                .stroke
                .tessellate(
                    path,
                    &StrokeOptions::tolerance(tolerance).with_line_width(width).with_line_cap(paint.cap).with_line_join(paint.join),
                    &mut BuffersBuilder::new(&mut self.buffers, |v: StrokeVertex| v.position()),
                )
                .is_ok(),
            None => self
                .fill
                .tessellate(
                    path,
                    &FillOptions::tolerance(tolerance).with_fill_rule(FillRule::NonZero),
                    &mut BuffersBuilder::new(&mut self.buffers, |v: FillVertex| v.position()),
                )
                .is_ok(),
        };
        if !ok || self.buffers.indices.is_empty() {
            return;
        }
        let paint_index = self.push_paint(paint);
        let start = self.indices.len() as u32;
        let to_image = match &paint.shader {
            Shader::Image { to_image, .. } => Some(*to_image),
            _ => None,
        };
        self.emit(paint_index, to_image);
        let end = self.indices.len() as u32;
        if paint.stroke.is_some() {
            // Stroke triangles overlap at joins and crossings: blend each sample once.
            self.ops.push(Op::DrawOnce { start, end, level: self.level });
            self.ops.push(Op::ClipOut { start, end, level: self.level });
            return;
        }
        match self.ops.last_mut() {
            Some(Op::Draw { end: e, level, .. }) if *e == start && *level == self.level => *e = end,
            _ => self.ops.push(Op::Draw { start, end, level: self.level }),
        }
    }

    /// `<Circle cx cy r paint>`.
    pub fn draw_circle(&mut self, cx: f32, cy: f32, r: f32, paint: &Paint) {
        self.draw_with(paint, |b| add_circle(b, cx, cy, r));
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
        self.draw_with(paint, |b| add_rect(b, x, y, w, h));
    }

    /// `<RoundedRect x y width height r paint>`.
    pub fn draw_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, paint: &Paint) {
        self.draw_with(paint, |b| add_rrect(b, x, y, w, h, r));
    }

    /// `<Fill color>`: the whole canvas (under the current clip).
    pub fn fill(&mut self, color: Color) {
        let inverse_huge = 1.0e5;
        self.save();
        self.state.matrix = Matrix::IDENTITY;
        self.draw_rect(-inverse_huge, -inverse_huge, 2.0 * inverse_huge, 2.0 * inverse_huge, &Paint::fill(color));
        self.restore();
    }

    /// `<Group clip={path}>` (until the matching restore): later draws only inside `path`.
    pub fn clip_path(&mut self, path: &Path) {
        self.clip_events(path.iter());
    }

    /// [`Canvas::clip_path`] of a path given as its events.
    pub fn clip_events<I: IntoIterator<Item = lyon::path::PathEvent>>(&mut self, path: I) {
        let tolerance = 0.2 / self.state.matrix.max_scale().max(1e-3);
        self.buffers.vertices.clear();
        self.buffers.indices.clear();
        if self
            .fill
            .tessellate(path, &FillOptions::tolerance(tolerance).with_fill_rule(FillRule::NonZero), &mut BuffersBuilder::new(&mut self.buffers, |v: FillVertex| v.position()))
            .is_err()
        {
            return;
        }
        let start = self.indices.len() as u32;
        self.emit(0, None);
        let end = self.indices.len() as u32;
        self.ops.push(Op::ClipIn { start, end, level: self.level });
        self.level += 1;
        self.state.clips.push((start, end));
    }

    /// A rounded-rect clip.
    pub fn clip_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32) {
        self.clip_with(|b| add_rrect(b, x, y, w, h, r));
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

    fn emit(&mut self, paint: u32, to_image: Option<Matrix>) {
        let base = self.vertices.len() as u32;
        let m = self.state.matrix;
        let t = to_image.unwrap_or(Matrix::IDENTITY);
        self.vertices.extend(self.buffers.vertices.iter().map(|p| {
            let q = m.apply(*p);
            let uv = t.apply(*p);
            Vertex { pos: [q.x, q.y], paint, color: u32::MAX, uv: [uv.x, uv.y] }
        }));
        self.indices.extend(self.buffers.indices.iter().map(|i| base + i));
    }

    fn push_paint(&mut self, paint: &Paint) -> u32 {
        let m = self.state.matrix;
        let opacity = paint.opacity * self.state.opacity;
        let mut gpu = GpuPaint { head: [0.0, 0.0, opacity, 0.0], geometry: [0.0; 4], offsets: [[0.0; 4]; 2], colors: [[0.0; 4]; MAX_STOPS] };
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
            Shader::Image { image, .. } => {
                gpu.head[0] = 4.0;
                gpu.geometry = [image.width, image.height, image.layer as f32, 0.0];
            }
        }
        self.paints.push(gpu);
        (self.paints.len() - 1) as u32
    }
}

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
/// 'continuous'`, iOS's squircle) to a builder, clockwise from the top edge.
pub fn add_continuous_rrect<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let r = continuous_radius(w, h, r);
    if r <= 0.0 {
        add_rect(b, x, y, w, h);
        return;
    }
    let e = CONTINUOUS_EXTENT * r;
    // Each corner: its point, the incoming side's direction (unit), the outgoing side's.
    let corners = [
        (point(x + w, y), vector(1.0, 0.0), vector(0.0, 1.0)),
        (point(x + w, y + h), vector(0.0, 1.0), vector(-1.0, 0.0)),
        (point(x, y + h), vector(-1.0, 0.0), vector(0.0, -1.0)),
        (point(x, y), vector(0.0, -1.0), vector(1.0, 0.0)),
    ];
    b.begin(point(x + e, y));
    for (corner, incoming, outgoing) in corners {
        let at = |[a, c]: [f32; 2]| corner - incoming * (a * r) + outgoing * (c * r);
        // The side's straight part (backwards when the corners overlap, as Apple's path).
        b.line_to(at([CONTINUOUS_EXTENT, 0.0]));
        for [c1, c2, to] in CONTINUOUS_CORNER {
            b.cubic_bezier_to(at(c1), at(c2), at(to));
        }
    }
    b.end(true);
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
/// inscribed in the rect.
pub fn add_oval<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32) {
    b.add_ellipse(point(x + w / 2.0, y + h / 2.0), vector(w / 2.0, h / 2.0), lyon::math::Angle::radians(0.0), Winding::Positive);
}

/// Appends a circle to a builder (`PathBuilder.addCircle`).
pub fn add_circle<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, cx: f32, cy: f32, r: f32) {
    b.add_circle(point(cx, cy), r, Winding::Positive);
}

/// Appends an arc of the oval inscribed in a rect (`PathBuilder.addArc(oval, startAngle,
/// sweepAngle)`): a new contour from `start_deg`, sweeping `sweep_deg` (degrees, clockwise on
/// screen as Skia's), as cubic Béziers.
pub fn add_arc<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, start_deg: f32, sweep_deg: f32) {
    let arc = lyon::geom::Arc {
        center: point(x + w / 2.0, y + h / 2.0),
        radii: vector(w / 2.0, h / 2.0),
        start_angle: lyon::math::Angle::degrees(start_deg),
        sweep_angle: lyon::math::Angle::degrees(sweep_deg),
        x_rotation: lyon::math::Angle::radians(0.0),
    };
    b.begin(arc.from());
    arc.for_each_cubic_bezier(&mut |c| {
        b.cubic_bezier_to(c.ctrl1, c.ctrl2, c.to);
    });
    b.end(false);
}

/// Appends `PathBuilder.arcTo(rx, ry, xAxisRotateInDegrees, useSmallArc, isCCW, x, y)` (an SVG
/// arc, Skia's `SkPath::arcTo` with `ArcSize` and `PathDirection`) from `from` to `to`, as cubic
/// Béziers on the current contour; `rArcTo` is the same with `to = from + (dx, dy)`.
#[allow(clippy::too_many_arguments)]
pub fn add_svg_arc<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, from: Point, to: Point, rx: f32, ry: f32, x_rotation_deg: f32, small_arc: bool, ccw: bool) {
    let arc = lyon::geom::SvgArc {
        from,
        to,
        radii: vector(rx, ry),
        x_rotation: lyon::math::Angle::degrees(x_rotation_deg),
        // Clockwise on screen (y down) is lyon's positive angle.
        flags: lyon::geom::ArcFlags { large_arc: !small_arc, sweep: !ccw },
    };
    if arc.is_straight_line() {
        b.line_to(to);
        return;
    }
    arc.for_each_cubic_bezier(&mut |c| {
        b.cubic_bezier_to(c.ctrl1, c.ctrl2, c.to);
    });
}

/// Appends a rounded rect wound the other way (a hole: with a rect around it, the nonzero fill
/// of the two is everything outside the rounded rect, as an inverted clip or an even-odd mask).
pub fn add_rrect_hole<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Negative);
}

/// Appends a circle as sixteen cubic arcs of 22.5° (within 1e-7 r of the circle, where
/// [`add_circle`]'s four cubics are 2e-4 r off: 0.19 pt on a 950 pt circle; Skia's `addCircle`
/// is conics, exact). `hole` winds it the other way (an inverted clip with a rect around it).
pub fn add_circle_fine<B: lyon::path::traits::PathBuilder>(b: &mut lyon::path::builder::NoAttributes<B>, cx: f32, cy: f32, r: f32, hole: bool) {
    const N: usize = 16;
    let (cx, cy, r) = (cx as f64, cy as f64, r.abs() as f64);
    let step = std::f64::consts::TAU / N as f64 * if hole { -1.0 } else { 1.0 };
    let k = 4.0 / 3.0 * (step / 4.0).tan() * r;
    let at = |a: f64| point((cx + r * a.cos()) as f32, (cy + r * a.sin()) as f32);
    b.begin(at(0.0));
    for i in 0..N {
        let (a0, a1) = (step * i as f64, step * (i + 1) as f64);
        let c1 = point((cx + r * a0.cos() - k * a0.sin()) as f32, (cy + r * a0.sin() + k * a0.cos()) as f32);
        let c2 = point((cx + r * a1.cos() + k * a1.sin()) as f32, (cy + r * a1.sin() - k * a1.cos()) as f32);
        b.cubic_bezier_to(c1, c2, at(a1));
    }
    b.end(true);
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
        let mut worst: f64 = 0.0;
        for e in p.iter() {
            if let PathEvent::Cubic { from, ctrl1, ctrl2, to } = e {
                let c = lyon::geom::CubicBezierSegment { from, ctrl1, ctrl2, to };
                for k in 0..=32 {
                    let q = c.sample(k as f32 / 32.0);
                    let d = (((q.x - 10.0) as f64).powi(2) + ((q.y - 20.0) as f64).powi(2)).sqrt();
                    worst = worst.max((d - 950.0).abs());
                }
            }
        }
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
    fn quad(&mut self, corners: [Point; 4], uv: [Point; 4], paint: u32, color: u32) {
        let base = self.vertices.len() as u32;
        let m = self.state.matrix;
        for (p, t) in corners.iter().zip(uv.iter()) {
            let q = m.apply(*p);
            self.vertices.push(Vertex { pos: [q.x, q.y], paint, color, uv: [t.x, t.y] });
        }
        self.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    fn push_draw(&mut self, start: u32) {
        let end = self.indices.len() as u32;
        match self.ops.last_mut() {
            Some(Op::Draw { end: e, level, .. }) if *e == start && *level == self.level => *e = end,
            _ => self.ops.push(Op::Draw { start, end, level: self.level }),
        }
    }

    /// `<Atlas image sprites transforms colors colorBlendMode>`: each sprite (a rect of the
    /// image's pixels) drawn by its [`RsXform`]. With `colors`, each sprite's colour is blended
    /// with it: `src_in` (`colorBlendMode="srcIn"`) paints the colour in the image's alpha;
    /// otherwise it multiplies the image (`modulate`).
    pub fn draw_atlas(&mut self, image: ImageRef, sprites: &[Rect], transforms: &[RsXform], colors: Option<&[Color]>, src_in: bool) {
        let paint = self.push_paint(&Paint::image(image, Matrix::IDENTITY));
        if src_in {
            self.paints[paint as usize].geometry[3] = 1.0;
        }
        let start = self.indices.len() as u32;
        for (i, (s, x)) in sprites.iter().zip(transforms.iter()).enumerate() {
            let color = colors.and_then(|c| c.get(i)).map_or(u32::MAX, |c| {
                let [r, g, b, a] = c.0.map(|v| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u32);
                r | (g << 8) | (b << 16) | (a << 24)
            });
            let at = |px: f32, py: f32| point(x.scos * px - x.ssin * py + x.tx, x.ssin * px + x.scos * py + x.ty);
            let corners = [at(0.0, 0.0), at(s.width, 0.0), at(s.width, s.height), at(0.0, s.height)];
            let uv = [point(s.x, s.y), point(s.x + s.width, s.y), point(s.x + s.width, s.y + s.height), point(s.x, s.y + s.height)];
            self.quad(corners, uv, paint, color);
        }
        self.push_draw(start);
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
        let mut gpu = GpuPaint { head: [5.0, 1.0, self.state.opacity, 0.0], geometry: [a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y)], offsets: [[0.0; 4]; 2], colors: [[0.0; 4]; MAX_STOPS] };
        gpu.offsets[0] = [r.min(w / 2.0).min(h / 2.0).max(0.0) * s, sigma * s, 0.0, 0.0];
        gpu.colors[0] = color.0;
        self.paints.push(gpu);
        let paint = (self.paints.len() - 1) as u32;
        let e = 3.0 * sigma;
        let (x0, y0, x1, y1) = (x - e, y - e, x + w + e, y + h + e);
        let start = self.indices.len() as u32;
        let corners = [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
        self.quad(corners, corners, paint, u32::MAX);
        self.push_draw(start);
    }

    /// [`Canvas::draw_rrect_shadow`] under any transform: the shadow is evaluated in the rounded
    /// rect's own space (σ and `r` in its units) and drawn through the current transform, as Core
    /// Animation draws a rotated or scaled layer's shadow (RN's `boxShadow` on a view with a
    /// `rotate` / `scale` transform: RCTBoxShadow's shadow layer is a sublayer of the view's).
    #[allow(clippy::too_many_arguments)]
    pub fn draw_rrect_shadow_local(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, sigma: f32, color: Color) {
        let sigma = sigma.max(1e-3);
        let mut gpu = GpuPaint { head: [5.0, 1.0, self.state.opacity, 0.0], geometry: [x, y, x + w, y + h], offsets: [[0.0; 4]; 2], colors: [[0.0; 4]; MAX_STOPS] };
        gpu.offsets[0] = [r.min(w / 2.0).min(h / 2.0).max(0.0), sigma, 1.0, 0.0];
        gpu.colors[0] = color.0;
        self.paints.push(gpu);
        let paint = (self.paints.len() - 1) as u32;
        let e = 3.0 * sigma;
        let (x0, y0, x1, y1) = (x - e, y - e, x + w + e, y + h + e);
        let start = self.indices.len() as u32;
        let corners = [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
        self.quad(corners, corners, paint, u32::MAX);
        self.push_draw(start);
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
