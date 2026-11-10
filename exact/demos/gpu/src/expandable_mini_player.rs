//! Expandable Mini Player (src/animations/expandable-mini-player: navigation/index.tsx,
//! components/navigation/screen, bottom-tab-bar/index.tsx, tab-item.tsx,
//! expanded-sheet/index.tsx, sheet-content.tsx): a "Demo" screen with a four-tab bar and a mini
//! player above it that a tap expands into a full-screen sheet and a drag pulls back down. The
//! whole window; `progress` (ExpandedSheetMutableProgress) drives everything every frame.
//!
//! - The screen (#0D0D0D over #000, paddingTop safeTop + 56, paddingHorizontal 24, "Demo"
//!   24 / 600 white): borderRadius 0 → 48, translateY 0 → 64, scale 1 → 0.95 (about its centre).
//! - The tab bar: 84 tall at the bottom; its four tabs (Ionicons home, search, create,
//!   settings, 24, white) share the width of its top 74. A tab is a pressto pressable:
//!   opacity interpolate(press, [0, 1], [selected ? 1 : 0.5, 1]), scale 1 → 0.97 (press:
//!   withTiming 250 ms, bezier(0.25, 0.1, 0.25, 1)); the last pressed is selected; each press
//!   posts `press` (the app's selection haptic). The navigation shows the same screen.
//! - The sheet (above the tabs): height 64 → window, bottom 84 → 0, left/right 16 → 0, its
//!   colour #222222 → #0D0D0D (interpolateColor), a hairline border rgba(255,255,255,0.1)
//!   until 0.9 then fading to transparent (and to 0 wide), radius [16, 48, 0] at [0, 0.9, 1],
//!   a shadow (#222222, offset 0 4, radius 16 → σ 16, opacity 0.2 → 0.5), scale
//!   withSpring(tapped ? 0.98 : 1) (Reanimated's default) about its centre.
//! - Its knob (48 × 4, #767676, radius 24) safeTop + 8 down, opacity [0, 0, 1] at
//!   [0, 0.4, 1]. Its content, 10 down and marginLeft 10 → 24, translateY 0 → 120: the cover
//!   (44 → 132 square, radius 8 → 24, contentFit cover) and the labels (absolute, left 54 → 0,
//!   marginTop 5, translateY 0 → 151): the title (white, 14 → 28) and the subtitle (white at
//!   0.5, 12 → 24, 2 below).
//! - The tap (on the sheet): onBegin tapped when progress < 0.8; a tap that ends (onTouchesUp)
//!   with progress < 0.8 posts `press` and springs progress to 1 (withSpring { dampingRatio 1,
//!   duration 600 }); onFinalize untaps. The pan (with it): only when progress ≠ 0 at its
//!   start; onUpdate progress = interpolate(translationY, [0, height], [1, 0]) (extended); at
//!   onFinalize it springs (the same config) to progress > 0.8 ? 1 : 0.
//!
//! The cover is the video's thumbnail (maxresdefault.jpg) at 3× its largest drawn size, in
//! images/. The labels are RN `<Text>`s whose fontSize animates: UIKit lays each frame out at
//! its size, so here too (`skia::match_ui_font` + `Font::set_size`): the optical size follows the
//! point size (SFUI's `opsz` axis with its `avar`: the Text design up to 17 pt, turning into
//! Display between 19 and 24, Display from 28), with the `trak` tracking and GPOS kerning of that
//! size. RN's views are `borderCurve: 'continuous'`: the screen, the sheet's background and the
//! cover's clip are continuous rounded rects (Core Animation's `cornerCurve`). The sheet's
//! hairline border is translucent and doesn't clip, so RN draws it itself as a border image
//! with circular corners (`skia::border_ring_path`), and its shadowPath (a solid background) is
//! circular too (RCTViewComponentView's `RCTPathCreateWithRoundedRect`). The knob has no
//! borderCurve: circular. A tab presses only when the finger lifts inside it (RNGH's
//! BaseButton: `onPress` needs `pointerInside`).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase, TapGesture};
use reanimated::{interpolate, interpolate_color, Extrapolation, Spring, Timing, GENTLE};
use skia::{fit_cover, Canvas, Color, Font, Images, Paint, Rect, Renderer};

use crate::floating_modal::press_easing;
use crate::gfx;

/// TabBarHeight.
const TAB_BAR: f64 = 84.0;
/// MiniPlayerHeight.
const MINI: f64 = 64.0;
/// ImageHeight, ExpandedImageHeight.
const IMAGE: f64 = 44.0;
const IMAGE_EXPANDED: f64 = IMAGE * 3.0;
/// BaseOffset.
const BASE_OFFSET: f64 = (MINI - IMAGE) / 2.0;
/// progressThreshold.
const THRESHOLD: f64 = 0.8;
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f32 = 56.0;
const TITLE: &str = "Happiness does not wait";
const SUBTITLE: &str = "Ólafur Arnalds";
/// Ionicons home, search, create, settings.
const TABS: [&str; 4] = ["\u{F382}", "\u{F55F}", "\u{F292}", "\u{F56B}"];
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-subset.ttf");
static COVER: &[u8] = include_bytes!("../images/expandable-mini-player-cover-704x396.jpg");

/// The demo's surface. Input: the safe area's top inset.
pub fn surface() -> Box<dyn Surface> {
    Box::new(MiniPlayer {
        size: (0.0, 0.0),
        safe_top: 0.0,
        progress: Spring::at(0.0),
        tapped: Spring::at(1.0),
        tap: TapGesture::default(),
        pan: PanGesture::new(),
        pan_enabled: false,
        tab: None,
        tab_press: std::array::from_fn(|_| Timing::at(0.0)),
        selected: None,
        posted: Vec::new(),
        icons: Font::new(IONICONS, 24.0).map(Font::with_ui_layout),
        demo: skia::match_ui_font(24.0, 600.0),
        title: skia::match_ui_font(14.0, 400.0),
        subtitle: skia::match_ui_font(12.0, 400.0),
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct MiniPlayer {
    size: (f64, f64),
    safe_top: f64,
    progress: Spring,
    /// The sheet's scale (isTapped).
    tapped: Spring,
    tap: TapGesture,
    pan: PanGesture,
    pan_enabled: bool,
    /// The finger on a tab.
    tab: Option<(u32, usize)>,
    tab_press: [Timing; 4],
    selected: Option<usize>,
    posted: Vec<String>,
    icons: Option<Font>,
    demo: Option<Font>,
    title: Option<Font>,
    subtitle: Option<Font>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl MiniPlayer {
    /// The sheet's frame (before its tap scale) and radius.
    fn sheet(&self) -> (f64, f64, f64, f64, f64) {
        let p = self.progress.value;
        let (w, h) = self.size;
        let height = interpolate(p, &[0.0, 1.0], &[MINI, h], Extrapolation::Extend);
        let bottom = interpolate(p, &[0.0, 1.0], &[TAB_BAR, 0.0], Extrapolation::Extend);
        let side = interpolate(p, &[0.0, 1.0], &[16.0, 0.0], Extrapolation::Extend);
        let radius = interpolate(p, &[0.0, 0.9, 1.0], &[16.0, 48.0, 0.0], Extrapolation::Extend).max(0.0);
        (side, h - bottom - height, w - 2.0 * side, height, radius)
    }

    /// withSpring({ dampingRatio 1, duration 600 }): keeps a velocity that points at the target.
    fn spring_to(&mut self, to: f64) {
        gfx::spring_to(&mut self.progress, to, 600.0, 1.0);
    }
}

impl Surface for MiniPlayer {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let selected = self.selected.map_or("null".to_string(), |s| s.to_string());
        Some(format!("{{\"progress\":{:.3},\"selected\":{selected},\"held\":{}}}", self.progress.value, self.pan.tracking() || self.tab.is_some()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        let (sx, sy, sw, sh, _) = self.sheet();
        let (px, py) = (x as f64, y as f64);
        let on_sheet = (sx..=sx + sw).contains(&px) && (sy..=sy + sh).contains(&py);
        // The tabs: the bar's top 74, in quarters, under the sheet.
        if phase == Phase::Down && !on_sheet && self.tab.is_none() {
            let (w, h) = self.size;
            if (h - TAB_BAR..=h - 10.0).contains(&py) && (0.0..w).contains(&px) {
                let i = ((px / (w / 4.0)) as usize).min(3);
                self.tab = Some((id, i));
                self.tab_press[i].to(1.0, 250.0, press_easing());
            }
        }
        if let Some((tid, i)) = self.tab {
            if tid == id && matches!(phase, Phase::Up | Phase::Cancel) {
                self.tab = None;
                self.tab_press[i].to(0.0, 250.0, press_easing());
                let (w, h) = self.size;
                let q = w / 4.0;
                let inside = (q * i as f64..=q * (i + 1) as f64).contains(&px) && (h - TAB_BAR..=h - 10.0).contains(&py);
                if phase == Phase::Up && inside {
                    self.selected = Some(i);
                    self.posted.push("press".into());
                }
            }
        }
        let p = self.progress.value;
        match self.tap.event(id, phase, x, y, at_ms, on_sheet) {
            Event::Begin { .. } => {
                if p < THRESHOLD {
                    self.tapped.retarget(0.98, GENTLE);
                }
            }
            Event::Tap { .. } => {
                if p < THRESHOLD {
                    self.posted.push("press".into());
                    self.spring_to(1.0);
                }
                self.tapped.retarget(1.0, GENTLE);
            }
            Event::Fail => self.tapped.retarget(1.0, GENTLE),
            _ => {}
        }
        match self.pan.event(id, phase, x, y, at_ms, on_sheet) {
            Event::Begin { .. } => self.pan_enabled = self.progress.value != 0.0,
            Event::Start(e) | Event::Update(e) => {
                if self.pan_enabled {
                    let h = self.size.1;
                    self.progress.set(interpolate(e.translation_y as f64, &[0.0, h], &[1.0, 0.0], Extrapolation::Extend));
                }
            }
            Event::End(_) | Event::Fail => {
                if self.pan_enabled {
                    self.pan_enabled = false;
                    let to = if self.progress.value > THRESHOLD { 1.0 } else { 0.0 };
                    self.spring_to(to);
                }
            }
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
        self.size = (frame.width as f64, frame.height as f64);
        if self.images.is_none() {
            let cover = skia::Image::from_jpeg(COVER).unwrap_or(skia::Image { width: 1, height: 1, pixels: vec![0x22, 0x22, 0x22, 255] });
            let images = Images::upload(device, queue, &[&cover]);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let now = frame.now_ms;
        let mut moving = self.progress.step(now) | self.tapped.step(now);
        for t in &mut self.tab_press {
            moving |= t.step(now);
        }
        let p = self.progress.value;
        let (w, h) = (frame.width, frame.height);
        let safe_top = self.safe_top as f32;
        let (sx, sy, sw, sh, sr) = {
            let (a, b, c2, d, e) = self.sheet();
            (a as f32, b as f32, c2 as f32, d as f32, e as f32)
        };
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::BLACK);

        // The screen.
        let k = interpolate(p, &[0.0, 1.0], &[1.0, 0.95], Extrapolation::Extend) as f32;
        let ty = interpolate(p, &[0.0, 1.0], &[0.0, 64.0], Extrapolation::Extend) as f32;
        c.save();
        c.translate(w / 2.0, h / 2.0 + ty);
        c.scale(k, k);
        c.translate(-w / 2.0, -h / 2.0);
        let radius = interpolate(p, &[0.0, 1.0], &[0.0, 48.0], Extrapolation::Extend).max(0.0) as f32;
        c.draw_continuous_rrect(0.0, 0.0, w, h, radius, &Paint::fill(Color::hex(0x0D0D0D)));
        if let Some(font) = self.demo.as_ref() {
            c.draw_text("Demo", 24.0, gfx::baseline(font, safe_top + BUTTON_ROW), font, &Paint::fill(Color::WHITE));
        }
        c.restore();

        // The tabs.
        if let Some(font) = self.icons.as_ref() {
            let lh = gfx::line_height(font);
            let cy = h - TAB_BAR as f32 + (TAB_BAR as f32 - 10.0) / 2.0;
            for (i, glyph) in TABS.iter().enumerate() {
                let press = self.tab_press[i].value;
                let rest = if self.selected == Some(i) { 1.0 } else { 0.5 };
                let opacity = interpolate(press, &[0.0, 1.0], &[rest, 1.0], Extrapolation::Extend) as f32;
                let s = interpolate(press, &[0.0, 1.0], &[1.0, 0.97], Extrapolation::Extend) as f32;
                let cx = w / 8.0 * (2 * i + 1) as f32;
                c.save();
                c.translate(cx, cy);
                c.scale(s, s);
                let gw = font.advance_width(glyph);
                c.draw_text(glyph, -gw / 2.0, gfx::baseline(font, -lh / 2.0), font, &Paint::fill(Color::WHITE).with_opacity(opacity));
                c.restore();
            }
        }

        // The sheet.
        let tap = self.tapped.value as f32;
        c.save();
        c.translate(sx + sw / 2.0, sy + sh / 2.0);
        c.scale(tap, tap);
        c.translate(-sw / 2.0, -sh / 2.0);
        let shadow = interpolate(p, &[0.0, 1.0], &[0.2, 0.5], Extrapolation::Extend) as f32;
        c.draw_rrect_shadow(0.0, 4.0, sw, sh, sr, 16.0, Color::hex(0x222222).alpha(shadow.clamp(0.0, 1.0)));
        let bg = interpolate_color(p, &[0.0, 1.0], &[[34.0, 34.0, 34.0, 1.0], [13.0, 13.0, 13.0, 1.0]]);
        c.draw_continuous_rrect(0.0, 0.0, sw, sh, sr, &Paint::fill(rgba(bg)));
        let hairline = 1.0 / frame.scale;
        let bw = interpolate(p, &[0.0, 0.9, 1.0], &[hairline as f64, hairline as f64, 0.0], Extrapolation::Extend).max(0.0) as f32;
        if bw > 0.0 {
            let border = interpolate_color(p, &[0.0, 0.9, 1.0], &[[255.0, 255.0, 255.0, 0.1], [255.0, 255.0, 255.0, 0.1], [0.0, 0.0, 0.0, 0.0]]);
            c.draw_path(&skia::border_ring_path(0.0, 0.0, sw, sh, sr, bw), &Paint::fill(rgba(border)));
        }
        // The knob (absolute: from the padding box's top).
        let knob = interpolate(p, &[0.0, THRESHOLD / 2.0, 1.0], &[0.0, 0.0, 1.0], Extrapolation::Extend) as f32;
        if knob > 0.0 {
            c.draw_rrect((sw - 48.0) / 2.0, bw + safe_top + 8.0, 48.0, 4.0, 24.0, &Paint::fill(Color::hex(0x767676)).with_opacity(knob));
        }
        // The content. The sheet's children sit in its padding box, inside the animated border
        // (measured: the cover and the labels 0.333 right of and below 16 + 10, 764 + 10 at rest).
        c.translate(bw, bw);
        let ml = interpolate(p, &[0.0, 1.0], &[BASE_OFFSET, 24.0], Extrapolation::Extend) as f32;
        let cty = interpolate(p, &[0.0, 1.0], &[0.0, 120.0], Extrapolation::Extend) as f32;
        c.save();
        c.translate(ml, BASE_OFFSET as f32 + cty);
        let side = interpolate(p, &[0.0, 1.0], &[IMAGE, IMAGE_EXPANDED], Extrapolation::Extend) as f32;
        let ir = interpolate(p, &[0.0, 1.0], &[8.0, 24.0], Extrapolation::Extend).max(0.0) as f32;
        if let Some(images) = self.images.as_ref() {
            let cover = images.image(0);
            let placed = fit_cover(Rect::new(0.0, 0.0, cover.width, cover.height), Rect::new(0.0, 0.0, side, side));
            c.draw_continuous_rrect(0.0, 0.0, side, side, ir, &Paint::image(cover, placed.invert()));
        }
        let lx = interpolate(p, &[0.0, 1.0], &[IMAGE + 10.0, 0.0], Extrapolation::Extend) as f32;
        let ly = 5.0 + interpolate(p, &[0.0, 1.0], &[0.0, IMAGE_EXPANDED + 24.0 - 5.0], Extrapolation::Extend) as f32;
        if let (Some(title), Some(subtitle)) = (self.title.as_mut(), self.subtitle.as_mut()) {
            // fontSize 14 → 28 and 12 → 24, laid out at that size.
            title.set_size(interpolate(p, &[0.0, 1.0], &[14.0, 28.0], Extrapolation::Extend) as f32);
            subtitle.set_size(interpolate(p, &[0.0, 1.0], &[12.0, 24.0], Extrapolation::Extend) as f32);
            c.draw_text(TITLE, lx, gfx::baseline(title, ly), title, &Paint::fill(Color::WHITE));
            // The title's Text box: its line ceiled to the device pixel (Fabric's measure).
            let top = ly + (gfx::line_height(title) * frame.scale - 1e-3).ceil() / frame.scale + 2.0;
            c.draw_text(SUBTITLE, lx, gfx::baseline(subtitle, top), subtitle, &Paint::fill(Color::WHITE).with_opacity(0.5));
        }
        c.restore();
        c.restore();

        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);
        moving || self.pan.tracking() || self.tab.is_some()
    }
}

fn rgba(c: [f64; 4]) -> Color {
    Color([(c[0] / 255.0) as f32, (c[1] / 255.0) as f32, (c[2] / 255.0) as f32, c[3] as f32])
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_tap_expands_and_a_drag_collapses() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut s = surface();
        s.bind(&[Value::Number(62.0)], None).unwrap();
        let (mini, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        mini.save("mini-player-collapsed");
        assert!(!moving);
        // The mini player: 16…404 × 764…828, #222222 (its hairline aside); the screen #0D0D0D.
        assert_eq!(&mini.at(2 * 300, 2 * 800)[..3], &[0x22, 0x22, 0x22]);
        assert_eq!(&mini.at(2 * 300, 2 * 400)[..3], &[0x0D, 0x0D, 0x0D]);
        // The cover: 26…70 × 774…818 is the photo, not the sheet.
        assert_ne!(&mini.at(2 * 48, 2 * 796)[..3], &[0x22, 0x22, 0x22]);

        // A tab press selects it and posts a haptic.
        s.input(&pointer(PointerPhase::Down, 52.0, 870.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 52.0, 870.0, 60.0));
        assert_eq!(s.messages(), vec!["press".to_string()]);
        assert!(s.agent("{}").unwrap().contains("\"selected\":0"));

        // A tap on the mini player expands it.
        s.input(&pointer(PointerPhase::Down, 300.0, 796.0, 100.0));
        s.input(&pointer(PointerPhase::Up, 300.0, 796.0, 180.0));
        assert_eq!(s.messages(), vec!["press".to_string()]);
        let mut ms = 180.0;
        for _ in 0..12 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (mid, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        mid.save("mini-player-mid");
        while ms < 1500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (full, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        full.save("mini-player-expanded");
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"progress\":1.000"));
        // The sheet covers the window (#0D0D0D, the tabs under it); the knob at safeTop + 8.
        assert_eq!(&full.at(2 * 52, 2 * 870)[..3], &[0x0D, 0x0D, 0x0D]);
        assert_eq!(&full.at(2 * 210, 2 * 72)[..3], &[0x76, 0x76, 0x76]);

        // Drag down 310 (RNGH on iOS leaves UIKit's 10 pt hysteresis out of a pan that begins
        // 90 ms or more after touch-down: translation 300) and let go: progress 0.67 < 0.8, it
        // collapses.
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        ms += 90.0;
        for k in 1..=16 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 210.0, 400.0 + (20.0 * k as f32).min(310.0), ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"progress\":0.671"), "{state}");
        s.input(&pointer(PointerPhase::Up, 210.0, 710.0, ms));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        // Back to the mini player, the first tab now selected (opaque).
        assert_eq!(&back.at(2 * 300, 2 * 800)[..3], &[0x22, 0x22, 0x22]);
        assert_ne!(back.data, mini.data);
    }
}
