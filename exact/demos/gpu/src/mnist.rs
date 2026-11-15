//! Draw a digit on a 28 × 28 grid and a small network classifies it on every new cell. The
//! network (784 → 55 sigmoid → 50 relu → 11 softmax) lights its nodes by their activations, and
//! the eleven guesses sit below it.
//!
//! - The weights are stored as f64, and the prediction runs in f64, so the numbers match the
//!   reference model exactly.
//! - A guess's colour fades to cyan (300 ms) when its output passes 0.5.
//! - The eraser clears every touched cell.
//!
//! No inputs.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture, Phase};
use pressto::{PressEvent, Pressable};
use motion::{Easing, Timing};
use draw2d::blur::GRAPHITE_FORMAT;
use draw2d::{point, Canvas, Color, Font, Matrix, Paint, Renderer};

use crate::gfx;

const GRID: usize = 28;
const CELL: f32 = 10.0;
const GRID_PX: f32 = GRID as f32 * CELL;
const NET_H: f32 = 240.0;
const THRESHOLD: f64 = 0.35;
const BUTTON: f32 = 64.0;
const ERASER: &str = "\u{F01FE}";
const LABELS: [&str; 11] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "N/A"];

static WEIGHTS: &[u8] = include_bytes!("../images/mnist/weights.f64");
static MCI: &[u8] = include_bytes!("../fonts/mci-eraser-subset.ttf");

/// The model: weight_0 (784 × 55), weight_1 (55), weight_2 (55 × 50), weight_3 (50), weight_4
/// (50 × 11), weight_5 (11).
pub struct Model {
    w: Vec<f64>,
}

/// The activations of one prediction.
#[derive(Clone, Debug, Default)]
pub struct Prediction {
    /// sigmoid(input · W0 + b0).
    pub hidden1: Vec<f64>,
    /// relu(hidden1 · W2 + b2).
    pub hidden2: Vec<f64>,
    /// softmax(hidden2 · W4 + b4).
    pub output: Vec<f64>,
}

impl Model {
    fn load() -> Model {
        Model { w: WEIGHTS.chunks_exact(8).map(|b| f64::from_le_bytes(b.try_into().unwrap())).collect() }
    }
    const W0: usize = 0;
    const B0: usize = 784 * 55;
    const W2: usize = Self::B0 + 55;
    const B2: usize = Self::W2 + 55 * 50;
    const W4: usize = Self::B2 + 50;
    const B4: usize = Self::W4 + 50 * 11;

    fn hidden_weight(&self, i: usize, j: usize) -> f64 {
        self.w[Self::W2 + i * 50 + j]
    }
    fn output_weight(&self, i: usize, j: usize) -> f64 {
        self.w[Self::W4 + i * 11 + j]
    }

    /// `vector · matrix`: result[i] += matrix[j][i] · vector[j], summed in ascending j.
    fn layer(&self, at: usize, rows: usize, cols: usize, v: &[f64]) -> Vec<f64> {
        let mut r = vec![0.0; cols];
        for (i, out) in r.iter_mut().enumerate() {
            for (j, x) in v.iter().enumerate().take(rows) {
                *out += self.w[at + j * cols + i] * x;
            }
        }
        r
    }

    /// Predicts from the grid (row-major, 1 for a touched cell).
    pub fn predict(&self, input: &[f64]) -> Prediction {
        let h1 = self.layer(Self::W0, 784, 55, input);
        let hidden1: Vec<f64> = h1.iter().enumerate().map(|(i, v)| 1.0 / (1.0 + (-(v + self.w[Self::B0 + i])).exp())).collect();
        let h2 = self.layer(Self::W2, 55, 50, &hidden1);
        let hidden2: Vec<f64> = h2.iter().enumerate().map(|(i, v)| (v + self.w[Self::B2 + i]).max(0.0)).collect();
        let o = self.layer(Self::W4, 50, 11, &hidden2);
        let pre: Vec<f64> = o.iter().enumerate().map(|(i, v)| v + self.w[Self::B4 + i]).collect();
        let max = pre.iter().cloned().fold(f64::MIN, f64::max);
        let exp: Vec<f64> = pre.iter().map(|x| (x - max).exp()).collect();
        let sum: f64 = exp.iter().fold(0.0, |a, b| a + b);
        Prediction { hidden1, hidden2, output: exp.iter().map(|e| e / sum).collect() }
    }
}

/// A colour eased over 300 ms, each channel in gamma 2.2 space, rounded to 8 bits.
struct Fade {
    from: [f64; 3],
    to: [f64; 3],
    t: Timing,
    current: [u8; 3],
}

impl Fade {
    fn at(c: [u8; 3]) -> Fade {
        let l = c.map(|v| (v as f64 / 255.0).powf(2.2));
        Fade { from: l, to: l, t: Timing::at(1.0), current: c }
    }
    fn to(&mut self, c: [u8; 3]) {
        self.from = self.current.map(|v| (v as f64 / 255.0).powf(2.2));
        self.to = c.map(|v| (v as f64 / 255.0).powf(2.2));
        self.t.set(0.0);
        self.t.to(1.0, 300.0, Easing::timing_default());
    }
    fn step(&mut self, now: f64) -> bool {
        if !self.t.running {
            return false;
        }
        let moving = self.t.step(now);
        for k in 0..3 {
            let x = (self.from[k] + (self.to[k] - self.from[k]) * self.t.value).clamp(0.0, 1.0);
            self.current[k] = (x.powf(1.0 / 2.2) * 255.0).round() as u8;
        }
        moving
    }
}

const ACTIVE: [u8; 3] = [0x5c, 0xd1, 0xff];
const WHITE: [u8; 3] = [255, 255, 255];

/// The surface. Takes no inputs.
pub fn surface() -> Box<dyn Surface> {
    let model = Model::load();
    let prediction = model.predict(&[0.0; GRID * GRID]);
    let fades = std::array::from_fn(|i| Fade::at(if prediction.output[i] > 0.5 { ACTIVE } else { WHITE }));
    let active = std::array::from_fn(|i| prediction.output[i] > 0.5);
    Box::new(Mnist {
        size: (0.0, 0.0),
        scale: 1.0,
        model,
        prediction,
        touched: Vec::new(),
        pan: PanGesture::new(),
        press: Pressable::new(),
        fades,
        active,
        messages: Vec::new(),
        label: draw2d::match_ui_font(14.0, 400.0),
        icon: Font::new(MCI, 28.0).map(Font::with_ui_layout),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        overlay_renderer: Renderer::default(),
        p3: gfx::P3Layer::default(),
        gpu: None,
    })
}

struct Gpu {
    format: wgpu::TextureFormat,
    px: (u32, u32),
    overlay: wgpu::TextureView,
    pipeline: wgpu::RenderPipeline,
    bind: wgpu::BindGroup,
    buffer: wgpu::Buffer,
}

struct Mnist {
    size: (f32, f32),
    scale: f32,
    model: Model,
    prediction: Prediction,
    /// Touched cells in the order they were drawn: (column, row).
    touched: Vec<(usize, usize)>,
    pan: PanGesture,
    press: Pressable,
    fades: [Fade; 11],
    active: [bool; 11],
    messages: Vec<String>,
    label: Option<Font>,
    icon: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
    overlay_renderer: Renderer,
    p3: gfx::P3Layer,
    gpu: Option<Gpu>,
}

/// Where the views sit, in points.
struct Layout {
    net_top: f32,
    row_top: f32,
    grid: (f32, f32),
    /// Each guess's item: left, width.
    items: [(f32, f32); 11],
    text_h: f32,
}

impl Mnist {
    fn round(&self, v: f32) -> f32 {
        (v * self.scale + 1e-4).round() / self.scale
    }
    fn ceil(&self, v: f32) -> f32 {
        (v * self.scale - 1e-4).ceil() / self.scale
    }
    fn layout(&self) -> Layout {
        let (w, h) = self.size;
        let half = h / 2.0;
        let text_h = self.label.as_ref().map(|f| self.ceil(gfx::line_height(f))).unwrap_or(17.0);
        let row_h = text_h + 4.0 + 20.0;
        let net_top = self.round((half - (NET_H + row_h)) / 2.0);
        let mut items = [(0.0, 0.0); 11];
        let widths: Vec<f32> = LABELS.iter().map(|l| self.label.as_ref().map(|f| self.ceil(f.advance_width(l))).unwrap_or(20.0).max(20.0)).collect();
        let total: f32 = widths.iter().sum::<f32>() + 8.0 * 10.0;
        let mut x = (w - total) / 2.0;
        for (i, item) in items.iter_mut().enumerate() {
            *item = (self.round(x), widths[i]);
            x += widths[i] + 8.0;
        }
        Layout { net_top, row_top: net_top + NET_H, grid: (self.round((w - GRID_PX) / 2.0), self.round(half)), items, text_h }
    }
    fn button(&self) -> (f32, f32) {
        (self.size.0 - 40.0 - BUTTON, self.size.1 - 40.0 - BUTTON)
    }
    fn in_button(&self, x: f32, y: f32) -> bool {
        let (bx, by) = self.button();
        let half = BUTTON / 2.0 * self.press.scale() as f32;
        (x - bx - BUTTON / 2.0).abs() <= half && (y - by - BUTTON / 2.0).abs() <= half
    }

    /// Marks the cell under (x, y) as touched, once.
    fn touch(&mut self, x: f32, y: f32, now: f64) {
        let l = self.layout();
        let (lx, ly) = (x - l.grid.0, y - l.grid.1);
        let (i, j) = ((lx / CELL).floor(), (ly / CELL).floor());
        if i < 0.0 || j < 0.0 || i >= GRID as f32 || j >= GRID as f32 {
            return;
        }
        let cell = (i as usize, j as usize);
        if self.touched.contains(&cell) {
            return;
        }
        self.touched.push(cell);
        self.update(now);
    }

    /// The reaction on the cells: predict, then the guesses' colours.
    fn update(&mut self, _now: f64) {
        let mut input = [0.0; GRID * GRID];
        for &(x, y) in &self.touched {
            input[y * GRID + x] = 1.0;
        }
        self.prediction = self.model.predict(&input);
        for i in 0..11 {
            let active = self.prediction.output[i] > 0.5;
            if active != self.active[i] {
                self.active[i] = active;
                self.fades[i].to(if active { ACTIVE } else { WHITE });
            }
        }
    }

    /// Draws the network and the grid canvases.
    fn record_canvases(&mut self, l: &Layout) {
        let w = self.size.0;
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(self.scale);
        // Each layer is centred on its own width; the 11 outputs are centred on the 50-node row.
        let layer = |n: usize, padded: usize, y: f32, extra: f32| -> Vec<(f32, f32)> {
            let pad = (w - padded as f32 * 7.0) / 2.0;
            (0..n).map(|i| (i as f32 * 7.0 + pad + extra, l.net_top + y)).collect()
        };
        let first = layer(55, 55, 20.0, 0.0);
        let second = layer(50, 50, 120.0, 0.0);
        let third = layer(11, 50, 220.0, (50.0 - 11.0) * 7.0 / 2.0);
        let hair = 1.0 / self.scale;
        for (positive, color) in [(true, Color::rgb8(0, 0, 255)), (false, Color::rgb8(255, 0, 0))] {
            let keep = |wgt: f64| !((wgt > 0.0 && !positive) || (wgt < 0.0 && positive) || wgt.abs() < THRESHOLD);
            let model = &self.model;
            c.draw_with(&Paint::stroke(color.alpha(0.5), hair), |b| {
                for (i, a) in first.iter().enumerate() {
                    for (j, z) in second.iter().enumerate() {
                        if keep(model.hidden_weight(i, j)) {
                            b.begin(point(a.0, a.1));
                            b.line_to(point(z.0, z.1));
                            b.end(false);
                        }
                    }
                }
                for (i, a) in second.iter().enumerate() {
                    for (j, z) in third.iter().enumerate() {
                        if keep(model.output_weight(i, j)) {
                            b.begin(point(a.0, a.1));
                            b.line_to(point(z.0, z.1));
                            b.end(false);
                        }
                    }
                }
            });
        }
        for (nodes, values) in [(&first, &self.prediction.hidden1), (&second, &self.prediction.hidden2), (&third, &self.prediction.output)] {
            for (k, &(x, y)) in nodes.iter().enumerate() {
                let o = values[k].clamp(0.0, 1.0) as f32;
                c.draw_circle(x, y, 2.5, &Paint::fill(Color::WHITE.alpha(o)));
                c.draw_circle(x, y, 2.5, &Paint::stroke(Color::WHITE, 0.0));
            }
        }
        let (gx, gy) = l.grid;
        let rect = |c: &mut Canvas, i: usize, j: usize, color: u32| {
            c.draw_rect(gx + i as f32 * CELL + 1.0, gy + j as f32 * CELL + 1.0, CELL - 2.0, CELL - 2.0, &Paint::fill(Color::hex(color)));
        };
        for i in 0..GRID {
            for j in 0..GRID {
                rect(&mut c, i, j, 0x181818);
            }
        }
        let mut flags = [false; GRID * GRID];
        for &(x, y) in &self.touched {
            flags[x * GRID + y] = true;
        }
        for &(i, j) in &self.touched {
            for (x, y) in [(i as i64 - 1, j as i64), (i as i64 + 1, j as i64), (i as i64, j as i64 - 1), (i as i64, j as i64 + 1)] {
                if x >= 0 && y >= 0 && (x as usize) < GRID && (y as usize) < GRID && !flags[x as usize * GRID + y as usize] {
                    rect(&mut c, x as usize, y as usize, 0x9e9e9e);
                }
            }
        }
        for &(i, j) in &self.touched {
            rect(&mut c, i, j, 0xd5d5d5);
        }
        self.canvas = c;
    }

    /// The views over the canvases: the guesses and the eraser.
    fn record_views(&mut self, l: &Layout) {
        let s = self.scale;
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(s);
        if let Some(font) = self.label.as_ref() {
            for (i, &(x, w)) in l.items.iter().enumerate() {
                let tw = self.ceil(font.advance_width(LABELS[i]));
                let tx = x + ((w - tw) / 2.0 * s + 1e-4).floor() / s;
                let base = ((l.row_top + gfx::baseline(font, 0.0)) * s - 1e-3).ceil() / s;
                c.draw_text(LABELS[i], tx, base, font, &Paint::fill(Color::view_hex(0xd2d2d2)));
                let sx = x + self.round((w - 20.0) / 2.0);
                let sy = l.row_top + l.text_h + 4.0;
                c.draw_circle(sx + 10.0, sy + 10.0, 9.5, &Paint::stroke(Color::WHITE, 1.0));
                let [r, g, b] = self.fades[i].current;
                let o = self.prediction.output[i].clamp(0.0, 1.0) as f32;
                let hex = ((r as u32) << 16) | ((g as u32) << 8) | b as u32;
                c.draw_circle(sx + 10.0, sy + 10.0, 7.0, &Paint::fill(Color::view_hex(hex).alpha(o)));
            }
        }
        let (bx, by) = self.button();
        let k = self.press.scale() as f32;
        let (cx, cy) = (bx + BUTTON / 2.0, by + BUTTON / 2.0);
        c.save();
        c.concat(Matrix::translate(-cx, -cy).then(Matrix::scale(k, k)).then(Matrix::translate(cx, cy)));
        c.draw_rrect_shadow(bx, by, BUTTON, BUTTON, BUTTON / 2.0, 16.0, Color::WHITE.alpha(0.1));
        c.draw_circle(cx, cy, BUTTON / 2.0, &Paint::fill(Color::view_hex(0x111111)));
        if let Some(icon) = self.icon.as_ref() {
            let w = self.ceil(icon.advance_width(ERASER));
            let h = self.ceil(gfx::line_height(icon));
            let gl = ((BUTTON - w) / 2.0 * s + 1e-4).floor() / s;
            let gt = ((BUTTON - h) / 2.0 * s + 1e-4).floor() / s;
            let base = gfx::baseline(icon, gt + icon.metrics().leading / 2.0);
            c.draw_text(ERASER, bx + gl, by + (base * s - 1e-3).ceil() / s, icon, &Paint::fill(Color::WHITE));
        }
        c.restore();
        self.canvas = c;
    }
}

const BLIT_WGSL: &str = r#"
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var<uniform> srgb: vec4<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var c = textureLoad(t, vec2<i32>(pos.xy), 0);
    if (srgb.x > 0.5 && c.a > 0.0) { c = vec4<f32>(lin(c.rgb / c.a) * c.a, c.a); }
    return c;
}
"#;

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, px: (u32, u32)) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("mnist"), source: wgpu::ShaderSource::Wgsl(BLIT_WGSL.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("mnist"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
        ],
    });
    let pipeline = draw2d::render::fullscreen_pipeline(device, &module, &layout, "fs", format, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING));
    let overlay = draw2d::render::sampled_target(device, "mnist views", GRAPHITE_FORMAT, px.0, px.1);
    let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("mnist"), size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("mnist"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&overlay) }, wgpu::BindGroupEntry { binding: 1, resource: buffer.as_entire_binding() }],
    });
    Gpu { format, px, overlay, pipeline, bind, buffer }
}

impl Surface for Mnist {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.messages))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (best, p) = self.prediction.output.iter().enumerate().fold((0, 0.0), |a, (i, &v)| if v > a.1 { (i, v) } else { a });
        Some(format!("{{\"cells\":{},\"guess\":\"{}\",\"confidence\":{:.3},\"held\":{}}}", self.touched.len(), LABELS[best], p, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        let phase = gfx::phase(phase);
        let on_button = self.in_button(x, y);
        match self.press.pointer(id, phase, on_button) {
            Some(PressEvent::Press(press)) => {
                self.messages.extend(press.global_message().map(String::from));
                // The eraser clears the touched cells.
                self.touched.clear();
                self.update(at_ms);
                return;
            }
            Some(_) => return,
            None => {}
        }
        let l = self.layout();
        let inside = x >= l.grid.0 && y >= l.grid.1 && x < l.grid.0 + GRID_PX && y < l.grid.1 + GRID_PX;
        match self.pan.event(id, phase, x, y, at_ms, phase == Phase::Down && inside && !on_button) {
            Event::Begin { x, y } => self.touch(x, y, at_ms),
            Event::Start(p) | Event::Update(p) => self.touch(p.x, p.y, at_ms),
            _ => {}
        }
    }

    fn render(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        let now = frame.now_ms;
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        let mut moving = self.press.step(now);
        for f in self.fades.iter_mut() {
            moving |= f.step(now);
        }
        let px = frame.pixels();
        let l = self.layout();
        self.record_canvases(&l);
        self.p3.draw(&mut self.renderer, device, queue, encoder, &self.canvas, target, format, px.0, px.1, wgpu::Color::BLACK);
        if self.gpu.as_ref().map(|g| (g.format, g.px)) != Some((format, px)) {
            self.gpu = Some(build(device, format, px));
        }
        self.record_views(&l);
        let gpu = self.gpu.as_ref().unwrap();
        self.overlay_renderer.draw(device, queue, encoder, &self.canvas, &gpu.overlay, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        queue.write_buffer(&gpu.buffer, 0, &[gfx::srgb_flag(format), 0.0, 0.0, 0.0].iter().flat_map(|f: &f32| f.to_le_bytes()).collect::<Vec<u8>>());
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("mnist views"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: target, resolve_target: None, depth_slice: None, ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store } })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.draw(0..3, 0..1);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn the_model_reads_the_examples_as_the_demo() {
        let model = Model::load();
        let none = model.predict(&[0.0; 784]);
        let sum: f64 = none.output.iter().sum();
        assert!((sum - 1.0).abs() < 1e-9);
        // An empty grid is "N/A".
        assert!(none.output[10] > 0.5, "{:?}", none.output);
        let one = include_str!("../../../../src/animations/mnist/find-weights/examples/1.json");
        let cells: Vec<f64> = one.split(|c: char| !(c.is_ascii_digit() || c == '.')).filter_map(|t| t.parse::<f64>().ok()).collect();
        assert_eq!(cells.len(), 784);
        let p = model.predict(&cells);
        let best = p.output.iter().enumerate().fold((0, 0.0), |a, (i, &v)| if v > a.1 { (i, v) } else { a }).0;
        assert_eq!(best, 1, "{:?}", p.output);
    }

    #[test]
    fn drawing_a_stroke_lights_its_cells_and_the_eraser_clears_them() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "mnist-rest", [0, 0, 0]);
        // The grid at (70, 456): an untouched cell #181818.
        assert_eq!(&rest.at(3 * 75, 3 * 461)[..3], &[0x18, 0x18, 0x18]);
        // A vertical stroke down the grid's middle column.
        let p = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 215.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&p(PointerPhase::Down, 480.0, 0.0));
        let mut ms = 0.0;
        for k in 1..=40 {
            ms += 16.0;
            s.input(&p(PointerPhase::Move, 480.0 + 5.0 * k as f32, ms));
        }
        s.input(&p(PointerPhase::Up, 680.0, ms));
        let (drawn, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&drawn, "mnist-drawn", [0, 0, 0]);
        let agent = s.agent("{}").unwrap();
        assert!(agent.starts_with("{\"cells\":21,"), "{agent}");
        // A touched cell (column 14, row 3: x 70 + 141, y 456 + 31).
        assert_eq!(&drawn.at(3 * 215, 3 * 490)[..3], &[0xd5, 0xd5, 0xd5]);
        // The eraser (centre 340, 808).
        let b = |phase, at_ms| InputEvent::Pointer { id: 2, phase, x: 340.0, y: 808.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&b(PointerPhase::Down, ms + 100.0));
        s.input(&b(PointerPhase::Up, ms + 150.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert!(s.agent("{}").unwrap().starts_with("{\"cells\":0,\"guess\":\"N/A\""));
    }
}
