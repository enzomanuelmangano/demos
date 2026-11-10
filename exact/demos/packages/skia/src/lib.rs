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
//! view's Gaussian box shadow is [`Canvas::draw_rrect_shadow`], evaluated per pixel (no pass).
//!
//! What a demo needs beyond this (Skia's image filters, runtime shaders) is its own wgpu pass.

#![deny(missing_docs)]

pub use exact_gpu::wgpu;
pub use lyon::math::{point, vector, Point, Vector};
pub use lyon::path::Path;

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
pub use text::{match_system_font, Font, FontMetrics};

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

/// Up to this many stops per gradient.
pub(crate) const MAX_STOPS: usize = 8;

/// A paint as the shader reads it.
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct GpuPaint {
    /// kind (0 solid, 1 linear, 2 radial, 3 sweep, 4 image, 5 shadow), stop count, opacity,
    /// unused.
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
                .tessellate_path(
                    path,
                    &StrokeOptions::tolerance(tolerance).with_line_width(width).with_line_cap(paint.cap).with_line_join(paint.join),
                    &mut BuffersBuilder::new(&mut self.buffers, |v: StrokeVertex| v.position()),
                )
                .is_ok(),
            None => self
                .fill
                .tessellate_path(
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
        let mut b = Path::builder();
        b.add_circle(point(cx, cy), r, Winding::Positive);
        self.draw_path(&b.build(), paint);
    }

    /// `<Rect x y width height paint>`.
    pub fn draw_rect(&mut self, x: f32, y: f32, w: f32, h: f32, paint: &Paint) {
        self.draw_path(&rect_path(x, y, w, h), paint);
    }

    /// `<RoundedRect x y width height r paint>`.
    pub fn draw_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, paint: &Paint) {
        self.draw_path(&rrect_path(x, y, w, h, r), paint);
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
        let tolerance = 0.2 / self.state.matrix.max_scale().max(1e-3);
        self.buffers.vertices.clear();
        self.buffers.indices.clear();
        if self
            .fill
            .tessellate_path(path, &FillOptions::tolerance(tolerance), &mut BuffersBuilder::new(&mut self.buffers, |v: FillVertex| v.position()))
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
        self.clip_path(&rrect_path(x, y, w, h, r));
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
        let mut put = |stops: &[Stop]| {
            let n = stops.len().min(MAX_STOPS);
            for (i, (o, c)) in stops.iter().take(n).enumerate() {
                gpu.offsets[i / 4][i % 4] = *o;
                gpu.colors[i] = c.0;
            }
            gpu.head[1] = n as f32;
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

/// A path builder, for demos that build paths point by point (Skia's `PathBuilder`).
pub fn path_builder() -> lyon::path::path::Builder {
    Path::builder()
}

/// Appends a rounded rect to a builder (`PathBuilder.addRRect`).
pub fn add_rrect(b: &mut lyon::path::path::Builder, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let r = r.min(w / 2.0).min(h / 2.0).max(0.0);
    b.add_rounded_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), &BorderRadii::new(r), Winding::Positive);
}

/// Appends a rect to a builder (`PathBuilder.addRect`).
pub fn add_rect(b: &mut lyon::path::path::Builder, x: f32, y: f32, w: f32, h: f32) {
    b.add_rectangle(&lyon::math::Box2D::new(point(x, y), point(x + w, y + h)), Winding::Positive);
}

/// Appends an oval to a builder (`<Oval x y width height>`, `PathBuilder.addOval`): the ellipse
/// inscribed in the rect.
pub fn add_oval(b: &mut lyon::path::path::Builder, x: f32, y: f32, w: f32, h: f32) {
    b.add_ellipse(point(x + w / 2.0, y + h / 2.0), vector(w / 2.0, h / 2.0), lyon::math::Angle::radians(0.0), Winding::Positive);
}

/// Appends a circle to a builder (`PathBuilder.addCircle`).
pub fn add_circle(b: &mut lyon::path::path::Builder, cx: f32, cy: f32, r: f32) {
    b.add_circle(point(cx, cy), r, Winding::Positive);
}

/// Appends an arc of the oval inscribed in a rect (`PathBuilder.addArc(oval, startAngle,
/// sweepAngle)`): a new contour from `start_deg`, sweeping `sweep_deg` (degrees, clockwise on
/// screen as Skia's), as cubic Béziers.
pub fn add_arc(b: &mut lyon::path::path::Builder, x: f32, y: f32, w: f32, h: f32, start_deg: f32, sweep_deg: f32) {
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
}
