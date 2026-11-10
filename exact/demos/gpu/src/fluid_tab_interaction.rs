//! Fluid Tab Interaction (src/animations/fluid-tab-interaction: src/index.tsx, src/constants.ts,
//! src/components/segmented-control/index.tsx, components/animated-blur-view.tsx): a three-cell
//! segmented control (Accounts, Deposits, Funds) whose highlighted pill slides to the cell pressed
//! while the labels' colours cross over and expo-blur's BlurViews pulse. The whole screen.
//!
//! - Layout (RN measure, iPhone Air): the white screen centres the control, `windowWidth − 40` ×
//!   50 (20, 431), baseGray05 #F5F3EE, border 1 baseGray05, radius 30 continuous, padding 5,
//!   a row. Its three cells (PressableScale, flex 1, a centred row, gap 5, zIndex 2) are each
//!   (width − 12) / 3 wide, 38 tall, 6 in. In a cell: MaterialCommunityIcons wallet-outline / bank
//!   / chart-bar at 13 (a 13.333 Text box) and the label (Honk-Regular 14: HonkSans-Medium, a
//!   17 pt box), each Text at Yoga's floored position (icon 20.333, 12.333; "Accounts" 38.667,
//!   10.333; the label's textAlign center sets its line half the ceiled box's slack right: 0.0967
//!   pt for "Accounts"), and an absoluteFill `<BlurView tint="light">` over them (zIndex 1 in the cell).
//! - The pill (zIndex 1): absolute, left 0, alignSelf center: x = 1 + translateX, y 5 in the
//!   border box, cellBackgroundWidth − 5 / 3 × 40 (125 × 40), #F9F8F4, border 1 baseGray05,
//!   radius 30 continuous (20 drawn), boxShadow 0 1 2 rgba(0, 0, 0, 0.1) (RCTBoxShadow: σ 1, the
//!   circular rounded rect, outside the view). translateX = withTiming(cbw · index +
//!   interpolate(index, [0, 2], [5, −5]), TimingConfig), cbw = width / 3.
//! - The blur cell: absolute, left 0, alignSelf center, cbw × 50; its style array ends on
//!   highlightedCellBlurContent's zIndex 1, so it draws over the pill and under the cells (the
//!   recordings: a label over it stays sharp). translateX = withTiming(cbw · index). In it a
//!   `<BlurView tint="light">` of intensity interpolate(blurProgress, [0, 0.5, 1], [0, 15, 0]).
//! - Each cell's BlurView: interpolate(activeIndexes ∋ i ? blurProgress : 0, [0, 0.5, 1],
//!   [0, 10, 0]). Each label's and icon's colour: withTiming(selected ? #312F2D : #9B9893,
//!   TimingConfig), Reanimated's colour timing (each channel in a gamma 2.2 space, rounded).
//!   TimingConfig: 1000 ms, Easing.bezier(0.4, 0, 0.2, 1). RN's colours are Display P3.
//! - onPress(i): setSelected; if i was selected, nothing more. Else activeIndexes = [prev, i];
//!   cancelAnimation(blurProgress) — which runs a running pulse's callback (blurProgress 0,
//!   activeIndexes [] : an interrupting pulse blurs no cell) and puts back the value read before
//!   it — then blurProgress = withTiming(1, TimingConfig, () => { 0; [] }).
//! - Touches: iOS Fabric applies zIndex as the layers' zPosition, which hit-testing ignores: the
//!   pill and the blur cell, later siblings than the cells, take every touch inside them (the
//!   recordings: a held press on the selected cell does not scale it). A cell (RNGH BaseButton,
//!   pressto; the shared `pressto::Pressable`): scale 1 → 0.96 while held (withTiming 250 ms, bezier(0.25, 0.1, 0.25, 1)), onPress
//!   on a lift inside it, with the app's selection haptic.
//! - The blurs (`skia::backdrop`, UIBlurEffect.light at intensity / 100; 0 is none, as measured
//!   at rest): each reads what lies under its frame: the blur cell the screen, the control and
//!   the pill; a cell's the same plus the blur cell's result and its own glyphs.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate, interpolate_color, Easing, Extrapolation, Timing};
use skia::backdrop::{BackdropBlur, Material, BACKDROP_WGSL};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

static HONK: &[u8] = include_bytes!("../fonts/honk-regular-fluid-tab-subset.otf");
static MCI: &[u8] = include_bytes!("../fonts/mci-fluid-tab-subset.ttf");

/// src/index.tsx Data.
const NAMES: [&str; 3] = ["Accounts", "Deposits", "Funds"];
/// MaterialCommunityIcons wallet-outline, bank, chart-bar.
const ICONS: [&str; 3] = ["\u{F0BDD}", "\u{F0070}", "\u{F0128}"];
/// constants.ts Palette.
const BASE_GRAY05: u32 = 0xF5F3EE;
const BACKGROUND: u32 = 0xF9F8F4;
const HIGHLIGHT_LABEL: u32 = 0x312F2D;
const BASE_LABEL: u32 = 0x9B9893;
/// width = windowWidth − 40, height 50, internalPadding 5, the border 1.
const MARGIN: f32 = 40.0;
const HEIGHT: f32 = 50.0;
const PADDING: f32 = 5.0;
const BORDER: f32 = 1.0;
const RADIUS: f32 = 30.0;
const GAP: f32 = 5.0;
const ICON_SIZE: f32 = 13.0;
const LABEL_SIZE: f32 = 14.0;
/// TimingConfig.
const TIMING_MS: f64 = 1000.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const UNIFORM: u64 = 256;

fn timing_easing() -> Easing {
    Easing::bezier(0.4, 0.0, 0.2, 1.0)
}

/// The demo's surface (the whole screen).
pub fn surface() -> Box<dyn Surface> {
    Box::new(FluidTab::new())
}

/// Yoga's rounding of a View edge to the pixel grid: to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// A Text node's relative position: floored to the pixel grid (Yoga's textRounding).
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// A Text's measured side, ceiled to the pixel grid (an exact 13 measures 13.333, as RN's).
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

fn bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

/// `0xRRGGBB` of a rounded `[r, g, b, a]`.
fn packed(c: [f64; 4]) -> u32 {
    ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32
}

fn rgba(hex: u32) -> [f64; 4] {
    [
        ((hex >> 16) & 0xFF) as f64,
        ((hex >> 8) & 0xFF) as f64,
        (hex & 0xFF) as f64,
        1.0,
    ]
}

#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    scale: f32,
    /// The control's border box.
    x: f32,
    y: f32,
    w: f32,
    /// cellBackgroundWidth.
    cbw: f32,
    /// Each cell's left edge, and the last one's right; their top and height.
    cells: [f32; 4],
    cell_y: f32,
    cell_h: f32,
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32) -> Layout {
        let cw = w - MARGIN;
        let x = grid((w - cw) / 2.0, scale);
        let y = grid((h - HEIGHT) / 2.0, scale);
        let inner = cw - 2.0 * (BORDER + PADDING);
        let cells =
            std::array::from_fn(|i| grid(x + BORDER + PADDING + inner * i as f32 / 3.0, scale));
        Layout {
            scale,
            x,
            y,
            w: cw,
            cbw: cw / 3.0,
            cells,
            cell_y: y + BORDER + PADDING,
            cell_h: HEIGHT - 2.0 * (BORDER + PADDING),
        }
    }

    /// rCellMessageStyle's target for `index`.
    fn pill_target(&self, index: usize) -> f64 {
        let i = index as f64;
        self.cbw as f64 * i
            + interpolate(
                i,
                &[0.0, 2.0],
                &[PADDING as f64, -PADDING as f64],
                Extrapolation::Extend,
            )
    }

    /// The pill's frame at translateX `tx`.
    fn pill(&self, tx: f32) -> [f32; 4] {
        let h = HEIGHT - 2.0 * (BORDER + 4.0);
        [
            self.x + BORDER + tx,
            self.y + (HEIGHT - h) / 2.0,
            self.cbw - PADDING / 3.0,
            h,
        ]
    }

    /// The blur cell's frame at translateX `tx`.
    fn blur_cell(&self, tx: f32) -> [f32; 4] {
        [self.x + BORDER + tx, self.y, self.cbw, HEIGHT]
    }

    fn cell(&self, i: usize) -> [f32; 4] {
        [
            self.cells[i],
            self.cell_y,
            self.cells[i + 1] - self.cells[i],
            self.cell_h,
        ]
    }

    fn cell_at(&self, x: f32, y: f32) -> Option<usize> {
        (0..3).find(|&i| inside(self.cell(i), x, y))
    }
}

fn inside(r: [f32; 4], x: f32, y: f32) -> bool {
    x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]
}

/// A frame in device pixels, its edges rounded: `[x0, y0, x1, y1]`.
fn pixels(r: [f32; 4], scale: f32) -> [i32; 4] {
    [
        (r[0] * scale).round() as i32,
        (r[1] * scale).round() as i32,
        ((r[0] + r[2]) * scale).round() as i32,
        ((r[1] + r[3]) * scale).round() as i32,
    ]
}

struct Gpu {
    size: (u32, u32),
    format: wgpu::TextureFormat,
    /// The screen, the control and the pill; the cells' glyphs (premultiplied); both composed.
    under: wgpu::TextureView,
    cells: wgpu::TextureView,
    mid: wgpu::TextureView,
    compose: wgpu::RenderPipeline,
    out: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

struct FluidTab {
    layout: Layout,
    selected: usize,
    /// rCellMessageStyle's and rCellBlurMessageStyle's translateX.
    pill_tx: Timing,
    blur_tx: Timing,
    /// blurProgress, activeIndexes.
    blur: Timing,
    active: Vec<usize>,
    /// Each label's colour: its timing's progress, from, to.
    colour: [(Timing, [f64; 4], [f64; 4]); 3],
    /// Each cell's PressableScale (the shared pressto machine).
    press: [Pressable; 3],
    placed: bool,
    label: Option<Font>,
    icon: Option<Font>,
    posted: Vec<String>,
    canvas: Canvas,
    renderers: [Renderer; 2],
    blurs: [BackdropBlur; 4],
    gpu: Option<Gpu>,
}

impl FluidTab {
    fn new() -> FluidTab {
        let colour = |i: usize| {
            (
                Timing::at(1.0),
                rgba(BASE_LABEL),
                rgba(if i == 0 { HIGHLIGHT_LABEL } else { BASE_LABEL }),
            )
        };
        FluidTab {
            layout: Layout::default(),
            selected: 0,
            pill_tx: Timing::at(0.0),
            blur_tx: Timing::at(0.0),
            blur: Timing::at(0.0),
            active: Vec::new(),
            colour: std::array::from_fn(colour),
            press: std::array::from_fn(|_| Pressable::new()),
            placed: false,
            label: Font::new(HONK, LABEL_SIZE).map(Font::with_ui_layout),
            icon: Font::new(MCI, ICON_SIZE).map(Font::with_ui_layout),
            posted: Vec::new(),
            canvas: Canvas::default(),
            renderers: [Renderer::default(), Renderer::default()],
            blurs: std::array::from_fn(|_| BackdropBlur::default()),
            gpu: None,
        }
    }

    /// A label's colour now: Reanimated's colour timing.
    fn label_colour(&self, i: usize) -> [f64; 4] {
        let (t, from, to) = &self.colour[i];
        interpolate_color(t.value, &[0.0, 1.0], &[*from, *to])
    }

    /// The touch-blocking frames: the pill and the blur cell where they are.
    fn blocked(&self, x: f32, y: f32) -> bool {
        let l = &self.layout;
        inside(l.pill(self.pill_tx.value as f32), x, y)
            || inside(l.blur_cell(self.blur_tx.value as f32), x, y)
    }

    /// The cell's onPress (after the app's selection haptic).
    fn select(&mut self, i: usize) {
        let prev = self.selected;
        if prev == i {
            return;
        }
        self.selected = i;
        let l = self.layout;
        self.pill_tx
            .to(l.pill_target(i), TIMING_MS, timing_easing());
        self.blur_tx
            .to(l.cbw as f64 * i as f64, TIMING_MS, timing_easing());
        for k in [prev, i] {
            let from = self.label_colour(k);
            let to = rgba(if k == i { HIGHLIGHT_LABEL } else { BASE_LABEL });
            let mut t = Timing::at(0.0);
            t.to(1.0, TIMING_MS, timing_easing());
            self.colour[k] = (t, from, to);
        }
        // activeIndexes.set([prev, i]); cancelAnimation(blurProgress): a running pulse's callback
        // clears them and the value read before it is put back.
        self.active = vec![prev, i];
        if self.blur.running {
            self.active.clear();
        }
        let v = self.blur.value;
        self.blur.set(v);
        self.blur.to(1.0, TIMING_MS, timing_easing());
    }

    /// Steps every timing; true while one runs.
    fn step(&mut self, now: f64) -> bool {
        let mut moving = false;
        for t in [&mut self.pill_tx, &mut self.blur_tx] {
            moving |= t.step(now);
        }
        for (t, _, _) in self.colour.iter_mut() {
            moving |= t.step(now);
        }
        for t in self.press.iter_mut() {
            moving |= t.step(now);
        }
        if self.blur.running {
            if self.blur.step(now) {
                moving = true;
            } else {
                // The pulse's callback.
                self.blur.set(0.0);
                self.active.clear();
            }
        }
        moving
    }

    fn intensities(&self) -> (f64, [f64; 3]) {
        let p = self.blur.value;
        let big = interpolate(
            p,
            &[0.0, 0.5, 1.0],
            &[0.0, 15.0, 0.0],
            Extrapolation::Extend,
        );
        let cell = |i: usize| {
            let q = if self.active.contains(&i) { p } else { 0.0 };
            interpolate(
                q,
                &[0.0, 0.5, 1.0],
                &[0.0, 10.0, 0.0],
                Extrapolation::Extend,
            )
        };
        (big, std::array::from_fn(cell))
    }

    fn ensure(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat, size: (u32, u32)) {
        if self
            .gpu
            .as_ref()
            .is_some_and(|g| g.size == size && g.format == format)
        {
            return;
        }
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("fluid tab interaction"),
            source: wgpu::ShaderSource::Wgsl(format!("{BACKDROP_WGSL}{SHADER}").into()),
        });
        let tex = |i: u32| wgpu::BindGroupLayoutEntry {
            binding: i,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("fluid tab"),
            entries: &[
                tex(0),
                tex(1),
                tex(2),
                tex(3),
                tex(4),
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let compose = gfx::fullscreen(
            device, LAYER, &module, &layout, "vs", "compose", None, "compose",
        );
        let out = gfx::fullscreen(device, format, &module, &layout, "vs", "out", None, "out");
        let (w, h) = size;
        self.gpu = Some(Gpu {
            size,
            format,
            under: gfx::target(device, "fluid tab under", LAYER, w, h),
            cells: gfx::target(device, "fluid tab cells", LAYER, w, h),
            mid: gfx::target(device, "fluid tab mid", LAYER, w, h),
            compose,
            out,
            layout,
            uniforms: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("fluid tab"),
                size: 2 * UNIFORM,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            sampler: gfx::linear_sampler(device, "fluid tab"),
        });
        self.renderers = [Renderer::default(), Renderer::default()];
    }

    /// The screen, the control and the pill.
    fn draw_under(&mut self) {
        let l = self.layout;
        let c = &mut self.canvas;
        c.begin(l.scale);
        c.fill(Color::WHITE);
        // backgroundContainer: its border is its own colour.
        c.draw_continuous_rrect(
            l.x,
            l.y,
            l.w,
            HEIGHT,
            RADIUS.min(HEIGHT / 2.0),
            &Paint::fill(Color::view_hex(BASE_GRAY05)),
        );
        let [px, py, pw, ph] = l.pill(self.pill_tx.value as f32);
        let r = RADIUS.min(pw / 2.0).min(ph / 2.0);
        // RCTBoxShadow: the circular rounded rect's shadow (blur 2: σ 1), offset 0 1, outside
        // the view.
        c.save();
        c.clip_with(|b| {
            skia::add_rect(b, px - 20.0, py - 20.0, pw + 40.0, ph + 40.0);
            skia::add_rrect_hole(b, px, py, pw, ph, r);
        });
        c.draw_rrect_shadow(px, py + 1.0, pw, ph, r, 1.0, Color::BLACK.alpha(0.1));
        c.restore();
        // The border (Core Animation's, continuous), then the background inside it.
        c.draw_continuous_rrect(
            px,
            py,
            pw,
            ph,
            r,
            &Paint::fill(Color::view_hex(BASE_GRAY05)),
        );
        c.draw_continuous_rrect(
            px + BORDER,
            py + BORDER,
            pw - 2.0 * BORDER,
            ph - 2.0 * BORDER,
            r - BORDER,
            &Paint::fill(Color::view_hex(BACKGROUND)),
        );
    }

    /// Each cell's icon and label, under its press scale.
    fn draw_cells(&mut self) {
        let l = self.layout;
        let s = l.scale;
        let colours: Vec<u32> = (0..3).map(|i| packed(self.label_colour(i))).collect();
        let scales: Vec<f32> = self
            .press
            .iter()
            .map(|t| t.scale() as f32)
            .collect();
        let c = &mut self.canvas;
        c.begin(s);
        let (Some(label), Some(icon)) = (self.label.as_ref(), self.icon.as_ref()) else {
            return;
        };
        let (ih, lh) = (
            text_side(gfx::line_height(icon), s),
            text_side(gfx::line_height(label), s),
        );
        for i in 0..3 {
            let [cx, cy, cw, ch] = l.cell(i);
            let line = label.advance_width(NAMES[i]);
            let (iw, lw) = (text_side(icon.advance_width(ICONS[i]), s), text_side(line, s));
            let left = (cw - (iw + GAP + lw)) / 2.0;
            let paint = Paint::fill(Color::view_hex(colours[i]));
            c.save();
            c.translate(cx + cw / 2.0, cy + ch / 2.0);
            c.scale(scales[i], scales[i]);
            c.translate(-cw / 2.0, -ch / 2.0);
            c.draw_text(
                ICONS[i],
                text_grid(left, s),
                gfx::baseline(icon, text_grid((ch - ih) / 2.0, s)),
                icon,
                &paint,
            );
            c.draw_text(
                NAMES[i],
                // textAlign 'center': TextKit centres the line in the ceiled box ("Accounts" 0.29 px
                // right, which carries its o, u and s past a pixel edge).
                text_grid(left + iw + GAP, s) + (lw - line) / 2.0,
                gfx::baseline(label, text_grid((ch - lh) / 2.0, s)),
                label,
                &paint,
            );
            c.restore();
        }
    }
}

impl Surface for FluidTab {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let active: Vec<String> = self.active.iter().map(|i| i.to_string()).collect();
        Some(format!(
            "{{\"selected\":{},\"pill\":{:.3},\"blurProgress\":{:.4},\"active\":[{}]}}",
            self.selected,
            self.pill_tx.value,
            self.blur.value,
            active.join(",")
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        let phase = gfx::phase(phase);
        if phase == Phase::Down {
            if !self.press.iter().any(Pressable::is_pressed) && !self.blocked(x, y) {
                if let Some(i) = self.layout.cell_at(x, y) {
                    self.press[i].pointer_down(id, true);
                }
            }
            return;
        }
        let at = self.layout.cell_at(x, y);
        for i in 0..3 {
            if let Some(PressEvent::Press(press)) = self.press[i].pointer(id, phase, at == Some(i)) {
                self.posted.extend(press.global_message().map(String::from));
                self.select(i);
            }
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
        let s = frame.scale;
        self.layout = Layout::new(frame.width, frame.height, s);
        if !self.placed {
            // The animated styles' first values are their targets.
            self.placed = true;
            self.pill_tx.set(self.layout.pill_target(self.selected));
            self.blur_tx
                .set(self.layout.cbw as f64 * self.selected as f64);
        }
        let moving = self.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        self.ensure(device, format, (pw, ph));

        self.draw_under();
        {
            let gpu = self.gpu.as_ref().unwrap();
            self.renderers[0].draw(
                device,
                queue,
                encoder,
                &self.canvas,
                &gpu.under,
                LAYER,
                pw,
                ph,
                wgpu::Color::WHITE,
            );
        }
        self.draw_cells();
        {
            let gpu = self.gpu.as_ref().unwrap();
            self.renderers[1].draw(
                device,
                queue,
                encoder,
                &self.canvas,
                &gpu.cells,
                LAYER,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
        }

        let l = self.layout;
        let (big, cells) = self.intensities();
        let gpu = self.gpu.as_ref().unwrap();
        let mut data = vec![0f32; (2 * UNIFORM / 4) as usize];
        // The blur cell over what is under it.
        let mut views: [wgpu::TextureView; 4] = std::array::from_fn(|_| gpu.under.clone());
        if let Some(v) = run_blur(
            &mut self.blurs[0],
            device,
            queue,
            encoder,
            &gpu.under,
            l.blur_cell(self.blur_tx.value as f32),
            big,
            s,
            &mut data[0..16],
        ) {
            views[0] = v;
        }
        data[3 * 16] = gfx::srgb_flag(format);
        queue.write_buffer(&gpu.uniforms, 0, &bytes(&data[..(UNIFORM / 4) as usize]));
        let bind = |a: &wgpu::TextureView,
                    b: &wgpu::TextureView,
                    c: &wgpu::TextureView,
                    d: &wgpu::TextureView,
                    e: &wgpu::TextureView,
                    offset: u64| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("fluid tab"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(a),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(b),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(c),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(d),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: wgpu::BindingResource::TextureView(e),
                    },
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 6,
                        resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                            buffer: &gpu.uniforms,
                            offset,
                            size: wgpu::BufferSize::new(UNIFORM),
                        }),
                    },
                ],
            })
        };
        // The cells over the blur cell's result.
        let first = bind(&gpu.under, &gpu.cells, &views[0], &gpu.under, &gpu.under, 0);
        gfx::pass(encoder, "fluid tab compose", &gpu.mid, &gpu.compose, &first);
        // Each cell's BlurView over its (pressed) frame of that.
        let mut second = vec![0f32; (UNIFORM / 4) as usize];
        for (i, intensity) in cells.iter().enumerate() {
            let k = self.press[i].scale() as f32;
            let [cx, cy, cw, ch] = l.cell(i);
            let scaled = [
                cx + cw * (1.0 - k) / 2.0,
                cy + ch * (1.0 - k) / 2.0,
                cw * k,
                ch * k,
            ];
            if let Some(v) = run_blur(
                &mut self.blurs[1 + i],
                device,
                queue,
                encoder,
                &gpu.mid,
                scaled,
                *intensity,
                s,
                &mut second[i * 16..i * 16 + 16],
            ) {
                views[1 + i] = v;
            }
        }
        second[3 * 16] = gfx::srgb_flag(format);
        queue.write_buffer(&gpu.uniforms, UNIFORM, &bytes(&second));
        let last = bind(
            &gpu.mid, &views[1], &views[2], &views[3], &gpu.under, UNIFORM,
        );
        gfx::pass(encoder, "fluid tab out", target, &gpu.out, &last);
        moving || self.press.iter().any(Pressable::is_animating)
    }
}

/// A BlurView (tint light) of `intensity` over `frame_pt` of `src`: its effect, and its slot (the
/// pixel rect, the mapping, on) written; `None` at intensity 0. The canvas is at the window's
/// origin.
#[allow(clippy::too_many_arguments)]
fn run_blur(
    blur: &mut BackdropBlur,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    encoder: &mut wgpu::CommandEncoder,
    src: &wgpu::TextureView,
    frame_pt: [f32; 4],
    intensity: f64,
    s: f32,
    slot: &mut [f32],
) -> Option<wgpu::TextureView> {
    if intensity <= 0.0 {
        return None;
    }
    let fraction = (intensity / 100.0).clamp(0.01, 1.0) as f32;
    let params = Material::Light.chain().at(fraction);
    let region = pixels(frame_pt, s);
    let b = blur.run(device, queue, encoder, src, region, [0.0, 0.0], &params, s);
    let m = b.mapping;
    slot.copy_from_slice(&[
        region[0] as f32,
        region[1] as f32,
        region[2] as f32,
        region[3] as f32,
        m[0][0],
        m[0][1],
        m[0][2],
        m[0][3],
        m[1][0],
        m[1][1],
        m[1][2],
        m[1][3],
        1.0,
        0.0,
        0.0,
        0.0,
    ]);
    Some(b.view.clone())
}

const SHADER: &str = r#"
struct Slot { rect: vec4<f32>, m: vec4<f32>, n: vec4<f32>, on: vec4<f32> };
struct U { slots: array<Slot, 3>, out: vec4<f32> };
@group(0) @binding(0) var t0: texture_2d<f32>;
@group(0) @binding(1) var t1: texture_2d<f32>;
@group(0) @binding(2) var t2: texture_2d<f32>;
@group(0) @binding(3) var t3: texture_2d<f32>;
@group(0) @binding(4) var t4: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;
@group(0) @binding(6) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn in_slot(k: i32, p: vec2<f32>) -> bool {
    let s = u.slots[k];
    return s.on.x > 0.5 && p.x >= s.rect.x && p.x < s.rect.z && p.y >= s.rect.y && p.y < s.rect.w;
}
fn blurred(t: texture_2d<f32>, k: i32, p: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(t, smp, backdrop_uv(p, u.slots[k].m, u.slots[k].n), 0.0).rgb;
}
// t0 under, t1 the cells' glyphs, t2 the blur cell's effect.
@fragment fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var base = textureLoad(t0, vec2<i32>(pos.xy), 0).rgb;
    let b = blurred(t2, 0, pos.xy);
    if (in_slot(0, pos.xy)) { base = b; }
    let g = textureLoad(t1, vec2<i32>(pos.xy), 0);
    return vec4<f32>(g.rgb + base * (1.0 - g.a), 1.0);
}
fn decode(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
// t0 the composite, t1..t3 the cells' effects.
@fragment fn out(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var c = textureLoad(t0, vec2<i32>(pos.xy), 0).rgb;
    let a = blurred(t1, 0, pos.xy);
    let b = blurred(t2, 1, pos.xy);
    let d = blurred(t3, 2, pos.xy);
    if (in_slot(0, pos.xy)) { c = a; }
    if (in_slot(1, pos.xy)) { c = b; }
    if (in_slot(2, pos.xy)) { c = d; }
    return vec4<f32>(select(c, decode(c), u.out.x > 0.5), 1.0);
}
"#;

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn tap(s: &mut FluidTab, x: f32, y: f32, at: f64) {
        for phase in [PointerPhase::Down, PointerPhase::Up] {
            s.input(&InputEvent::Pointer {
                id: 1,
                phase,
                x,
                y,
                dx: 0.0,
                dy: 0.0,
                kind: PointerKind::Touch,
                buttons: 1,
                at_ms: at,
            });
        }
    }

    #[test]
    fn layout_is_rns() {
        let l = Layout::new(420.0, 912.0, 3.0);
        assert_eq!((l.x, l.y, l.w), (20.0, 431.0, 380.0));
        assert!((l.cells[1] - 148.6667).abs() < 1e-3 && (l.cells[2] - 271.3333).abs() < 1e-3);
        assert_eq!(l.pill(l.pill_target(0) as f32), [26.0, 436.0, 125.0, 40.0]);
        assert_eq!(l.blur_cell(0.0)[..2], [21.0, 431.0]);
    }

    #[test]
    fn a_press_moves_the_pill_and_pulses() {
        let mut s = FluidTab::new();
        s.layout = Layout::new(420.0, 912.0, 3.0);
        s.placed = true;
        // The selected cell is under the pill and the blur cell: the press is theirs.
        tap(&mut s, 84.0, 456.0, 0.0);
        assert!(s.messages().is_empty());
        tap(&mut s, 210.0, 456.0, 0.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(s.selected, 1);
        assert_eq!(s.active, vec![0, 1]);
        s.step(0.0);
        s.step(500.0);
        assert!(s.blur.value > 0.5 && s.blur.value < 1.0);
        // Interrupted: the old pulse's callback clears activeIndexes.
        tap(&mut s, 336.0, 456.0, 500.0);
        assert!(s.active.is_empty());
        s.step(600.0);
        s.step(1700.0);
        assert_eq!(s.blur.value, 0.0);
        assert!((s.pill_tx.value - s.layout.pill_target(2)).abs() < 1e-9);
    }

    #[test]
    fn renders_the_control() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = FluidTab::new();
        let (img, _) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        // The control's grey between the cells, the screen's white above it.
        let at = |x: f32, y: f32| img.at((x * 3.0) as u32, (y * 3.0) as u32);
        assert_eq!(at(210.0, 420.0)[..3], [255, 255, 255]);
        assert!(at(400.0 - 30.0, 456.0)[0] < 250);
        gfx::save_over(&img, "fluid-tab", [255, 255, 255]);
    }
}
