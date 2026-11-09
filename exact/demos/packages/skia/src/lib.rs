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
//! What a demo needs beyond this (Skia's image filters, runtime shaders) is its own wgpu pass.

#![deny(missing_docs)]

pub use exact_gpu::wgpu;
pub use lyon::math::{point, vector, Point, Vector};
pub use lyon::path::Path;

pub mod blur;
pub mod color;
pub mod render;

pub use color::Color;
pub use blur::Blur;
pub use render::Renderer;

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
    /// How much it scales lengths, at most.
    pub fn max_scale(&self) -> f32 {
        let [a, b, c, d, ..] = self.0;
        (a * a + b * b).sqrt().max((c * c + d * d).sqrt())
    }
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
    pub _pad: u32,
}

/// Up to this many stops per gradient.
pub(crate) const MAX_STOPS: usize = 8;

/// A paint as the shader reads it.
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct GpuPaint {
    /// kind (0 solid, 1 linear, 2 radial, 3 sweep), stop count, opacity, unused.
    pub head: [f32; 4],
    /// Linear: start, end. Radial: centre, radius, unused. Sweep: centre. Device pixels.
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
        self.emit(paint_index);
        let end = self.indices.len() as u32;
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
        self.emit(0);
        let end = self.indices.len() as u32;
        self.ops.push(Op::ClipIn { start, end, level: self.level });
        self.level += 1;
        self.state.clips.push((start, end));
    }

    /// A rounded-rect clip.
    pub fn clip_rrect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32) {
        self.clip_path(&rrect_path(x, y, w, h, r));
    }

    fn emit(&mut self, paint: u32) {
        let base = self.vertices.len() as u32;
        let m = self.state.matrix;
        self.vertices.extend(self.buffers.vertices.iter().map(|p| {
            let q = m.apply(*p);
            Vertex { pos: [q.x, q.y], paint, _pad: 0 }
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

/// Appends a circle to a builder (`PathBuilder.addCircle`).
pub fn add_circle(b: &mut lyon::path::path::Builder, cx: f32, cy: f32, r: f32) {
    b.add_circle(point(cx, cy), r, Winding::Positive);
}
