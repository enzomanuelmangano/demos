//! Animated Clip Box (src/animations/animated-clip-box: index.tsx,
//! components/clip-box-button/{index.tsx, expanded-circle.tsx}): a card whose corner circle
//! floods it while held, its text turning white with it, and shrinks back on release. One
//! canvas per card (boxWidth × 250); the card's white body and shadow are Contract
//! (demos/animated-clip-box), drawn under this. Input: the card (0 Explore Demos, blue; 1 Learn
//! More, orange).
//!
//! Layout (RN's Yoga, on the device pixel grid; the card's origin is on it):
//! - circleMargin cm = boxWidth × 0.12, initialRadius 35, circleCenter = cm + 17.5,
//!   canvasAreaHeight = 2 cm + 35.
//! - The card's PressableOpacity: absoluteFill, overflow hidden, holding
//!   - the main circle: height r × 2, aspectRatio 1, left = top = circleCenter − r / 2 − cm / 2,
//!     borderRadius 200 continuous (Core Animation draws min(200, side / 2)), primaryColor;
//!     Yoga rounds its edges every frame r moves;
//!   - the secondary circle: 70 × 70 at circleCenter − 17.5 − cm / 2, its colour
//!     interpolateColor(r, [35, boxWidth / 2], [primary, highlight]), an AntDesign "twitter"
//!     Text (40, white) centred in it.
//! - The description: a View (flex 1, marginHorizontal cm / 2, marginTop canvasAreaHeight,
//!   pointerEvents none) holding a Text (15). The View is what is left of the 250 above the
//!   action (51.92 pt on a 420 pt screen): the Text is measured at most that tall, so TextKit
//!   lays out only the lines that fit (2) and the last one takes the rest of the text, clipped
//!   by the Text's frame (NSTextContainer's lineBreakMode is clipping): RN shows
//!   "…a new idea, or cre".
//! - The action: a PressableOpacity (margin cm / 2) holding a bold 14 Text (paddingVertical 5).
//!
//! Motion audit:
//!
//! | value | driver | config | trigger |
//! |---|---|---|---|
//! | r | withSpring(boxWidth) | k 80, c 20, m 1 (ζ 1.12: run critically damped, ω0 √(k/m)) | card onPressIn |
//! | r | withSpring(30) | k 120, c 25, m 1.2 (ζ 1.04: critical) | card onPressOut |
//! | main circle frame | r | height 2r, left/top circleCenter − r/2 − cm/2 | |
//! | secondary colour | interpolateColor(r, [35, boxWidth/2]) RGB γ 2.2, clamped | primary → highlight | |
//! | text colour | interpolateColor(clamp(r / (boxWidth/3)), [0, 1]) | black → white | |
//! | card / action opacity | pressto PressableOpacity: 1 → 0.5, 250 ms ease | | press in / out |
//!
//! Each new withSpring takes the running velocity unless it points away from its target
//! (Reanimated's onStart). Haptics: pressto's global onPress (selection) on a press of either.
//!
//! The PressableOpacity's opacity is its layer's: the circles and the icon composite opaque, then
//! fade over the card. The card under them is white, so every colour drawn in it is premixed
//! with white instead (α c + (1 − α) white, opaque): source-over is affine, so the result is the
//! layer's, edges included.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::spring::Config;
use reanimated::{interpolate_color, Spring};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-twitter-subset.ttf");
/// AntDesign "twitter" (62076).
const TWITTER: &str = "\u{f27c}";

/// initialRadius.
const INITIAL_R: f64 = 35.0;
/// styles.button.height.
const HEIGHT: f64 = 250.0;
/// The secondary circle's side: initialR × 2.
const SMALL: f64 = INITIAL_R * 2.0;
const ICON_SIZE: f32 = 40.0;
const DESCRIPTION_SIZE: f32 = 15.0;
const ACTION_SIZE: f32 = 14.0;
/// onPressIn's spring.
const IN: Config = Config {
    stiffness: 80.0,
    damping: 20.0,
    mass: 1.0,
};
/// onPressOut's spring.
const OUT: Config = Config {
    stiffness: 120.0,
    damping: 25.0,
    mass: 1.2,
};
/// onPressOut's target.
const RELEASED: f64 = 30.0;

/// The two ClipBoxButtons: primaryColor, highlightColor, actionTitle, description.
const CARDS: [(u32, u32, &str, &str); 2] = [
    (
        0x4BA2E4,
        0x83C5F1,
        "Explore Demos",
        "Perfect for learning how React Native Reanimated works, prototyping a new idea, or creating a demo to share online.",
    ),
    (
        0xED7D3A,
        0xE39264,
        "Learn More",
        "What if I tell you that this text is animated with React Native Reanimated?",
    ),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AnimatedClipBox {
        card: 0,
        icon: Font::new(ANTDESIGN, ICON_SIZE).map(Font::with_ui_layout),
        description: skia::match_ui_font(DESCRIPTION_SIZE, 400.0),
        action: skia::match_ui_font(ACTION_SIZE, 700.0),
        r: Spring::at(INITIAL_R),
        press: Pressable::new(),
        action_press: Pressable::new(),
        layout: None,
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

/// Yoga's `roundValueToPixelGrid`: to the device pixel, half away from zero, `floor` for a
/// Text's position; values within 1e-4 of a pixel snap to it.
fn grid(v: f64, scale: f64, floor: bool) -> f64 {
    let s = v * scale;
    let f = s - s.floor();
    let r = if f < 1e-4 {
        s.floor()
    } else if f > 1.0 - 1e-4 {
        s.ceil()
    } else if floor {
        s.floor()
    } else {
        s.round()
    };
    r / scale
}

/// A Text's measured side: ceiled to the pixel after an epsilon (an exact 40 measures 40.333).
fn text_side(v: f64, scale: f64) -> f64 {
    (v * scale + 1e-3).ceil() / scale
}

/// TextKit's word wrapping (breaks after spaces, hanging): byte ranges of the lines.
fn wrap(font: &Font, text: &str, width: f32) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut breaks: Vec<(usize, usize)> = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b' ' {
            let mut j = i;
            while j < bytes.len() && bytes[j] == b' ' {
                j += 1;
            }
            if j < bytes.len() {
                breaks.push((i, j));
            }
            i = j;
        } else {
            i += 1;
        }
    }
    breaks.push((text.len(), text.len()));
    let (mut start, mut k) = (0, 0);
    while start < text.len() {
        let mut last = None;
        while k < breaks.len() {
            let (end, next) = breaks[k];
            if end <= start {
                k += 1;
                continue;
            }
            if font.advance_width(&text[start..end]) <= width + 1e-3 {
                last = Some((end, next));
                k += 1;
            } else {
                break;
            }
        }
        let (end, next) = last.unwrap_or_else(|| {
            let b = breaks[k.min(breaks.len() - 1)];
            k += 1;
            b
        });
        out.push((start, end));
        start = next;
    }
    out
}

/// RN's frames in the card's points.
#[derive(Clone, Debug)]
struct Layout {
    /// circleMargin.
    cm: f64,
    /// The secondary circle's rounded left (= top) and side.
    small: (f64, f64),
    /// The icon Text's left and top in the secondary circle.
    icon: (f64, f64),
    /// The description's frame: left, top, width, height (the lines that fit).
    text: (f64, f64, f64, f64),
    /// The description's lines (byte ranges), the last one the rest of the text.
    lines: Vec<(usize, usize)>,
    /// The action's pressable frame: left, top, width, height.
    action: (f64, f64, f64, f64),
}

fn layout(w: f64, s: f64, icon: &Font, description: &Font, action: &Font, text: &str) -> Layout {
    let cm = w * 0.12;
    let center = cm + INITIAL_R / 2.0;
    let small_left = center - INITIAL_R / 2.0 - cm / 2.0;
    let sl = grid(small_left, s, false);
    let side = grid(small_left + SMALL, s, false) - sl;
    let (iw, ih) = (
        text_side(icon.advance_width(TWITTER) as f64, s),
        text_side(gfx::line_height(icon) as f64, s),
    );
    let icon_pos = (
        grid((SMALL - iw) / 2.0, s, true),
        grid((SMALL - ih) / 2.0, s, true),
    );
    // The action: margin cm / 2 round a Text of paddingVertical 5 and one bold line.
    let action_h = 10.0 + text_side(gfx::line_height(action) as f64, s);
    let action_top = HEIGHT - cm / 2.0 - action_h;
    // The description's View: what is left between canvasAreaHeight and the action's margin.
    let top = 2.0 * cm + INITIAL_R;
    let room = action_top - cm / 2.0 - top;
    let (l, r) = (grid(cm / 2.0, s, false), grid(w - cm / 2.0, s, false));
    let line = gfx::line_height(description) as f64;
    let mut lines = wrap(description, text, (r - l) as f32);
    let fit = (((room + 1e-6) / line).floor() as usize).max(1);
    if lines.len() > fit {
        let start = lines[fit - 1].0;
        lines.truncate(fit - 1);
        lines.push((start, text.len()));
    }
    let tt = grid(top, s, false);
    let th = text_side(lines.len() as f64 * line, s);
    let at = grid(action_top, s, false);
    Layout {
        cm,
        small: (sl, side),
        icon: icon_pos,
        text: (l, tt, r - l, th),
        lines,
        action: (l, at, r - l, grid(action_top + action_h, s, false) - at),
    }
}

/// `0xRRGGBB` from interpolateColor's 0…255 channels.
fn packed(c: [f64; 4]) -> u32 {
    ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32
}

fn rgb(c: u32) -> [f64; 4] {
    [
        ((c >> 16) & 255) as f64,
        ((c >> 8) & 255) as f64,
        (c & 255) as f64,
        1.0,
    ]
}

/// `c` seen through a layer at `alpha` over the white card: premixed, opaque.
fn over_white(c: Color, alpha: f32) -> Color {
    let m = |v: f32| alpha * v + (1.0 - alpha);
    Color([m(c.0[0]), m(c.0[1]), m(c.0[2]), 1.0])
}

/// A square at (x, x) of `side` with a continuous `borderRadius` r. Core Animation draws a
/// continuous corner whose radius reaches half the side as a circle (measured on RN's 70 pt
/// circle: within AA of a true circle, mean coverage error 0.006); packages/skia's overlapping
/// continuous corners are a different, flatter shape there.
fn rounded_square(c: &mut Canvas, x: f32, side: f32, r: f32, paint: &Paint) {
    if r >= side / 2.0 {
        c.draw_circle(x + side / 2.0, x + side / 2.0, side / 2.0, paint);
    } else {
        c.draw_continuous_rrect(x, x, side, side, r, paint);
    }
}

struct AnimatedClipBox {
    card: usize,
    icon: Option<Font>,
    description: Option<Font>,
    action: Option<Font>,
    /// The ClipBoxButton's `r`.
    r: Spring,
    /// The card's PressableOpacity.
    press: Pressable,
    /// The action's PressableOpacity.
    action_press: Pressable,
    layout: Option<(f32, f32, usize, Layout)>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

impl AnimatedClipBox {
    fn in_action(&self, x: f32, y: f32) -> bool {
        let Some((_, _, _, l)) = &self.layout else {
            return false;
        };
        let (ax, ay, aw, ah) = l.action;
        let (x, y) = (x as f64, y as f64);
        x >= ax && x <= ax + aw && y >= ay && y <= ay + ah
    }

    fn in_card(&self, x: f32, y: f32) -> bool {
        let Some((w, _, _, _)) = &self.layout else {
            return false;
        };
        x >= 0.0 && x <= *w && y >= 0.0 && (y as f64) <= HEIGHT
    }
}

impl Surface for AnimatedClipBox {
    fn bind(&mut self, values: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(Value::Number(n)) = values.first() {
            self.card = (*n as usize).min(CARDS.len() - 1);
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"r\":{:.3},\"pressed\":{},\"opacity\":{:.3},\"actionOpacity\":{:.3}}}",
            self.r.value,
            self.press.is_pressed(),
            self.press.opacity(),
            self.action_press.opacity()
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
        let w = self.layout.as_ref().map_or(0.0, |l| l.0 as f64);
        if phase == gesture_handler::Phase::Down {
            // The action is the later sibling: it takes the touches in its frame; the
            // description is pointerEvents none.
            if self.in_action(x, y) {
                self.action_press.pointer_down(id, true);
            } else if self.press.pointer_down(id, self.in_card(x, y)) {
                // onPressIn.
                self.r.retarget(w, IN);
            }
            return;
        }
        let (in_card, in_action) = (self.in_card(x, y), self.in_action(x, y));
        match self.press.pointer(id, phase, in_card) {
            Some(PressEvent::Press(press)) => {
                if let Some(m) = press.global_message() {
                    self.posted.push(m.into());
                }
                self.r.retarget(RELEASED, OUT);
            }
            Some(PressEvent::PressOut) => self.r.retarget(RELEASED, OUT),
            _ => {}
        }
        if let Some(PressEvent::Press(press)) = self.action_press.pointer(id, phase, in_action) {
            if let Some(m) = press.global_message() {
                self.posted.push(m.into());
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
        let (w, s) = (frame.width, frame.scale);
        let (primary, highlight, title, text) = CARDS[self.card];
        let (Some(icon), Some(description), Some(action)) =
            (&self.icon, &self.description, &self.action)
        else {
            return false;
        };
        if self.layout.as_ref().map(|l| (l.0, l.1, l.2)) != Some((w, s, self.card)) {
            let l = layout(w as f64, s as f64, icon, description, action, text);
            self.layout = Some((w, s, self.card, l));
        }
        let l = &self.layout.as_ref().unwrap().3;
        let now = frame.now_ms;
        let mut moving = self.r.step(now);
        moving |= self.press.step(now);
        moving |= self.action_press.step(now);
        moving |= self.press.is_animating() || self.action_press.is_animating();

        let (wd, sd) = (w as f64, s as f64);
        let r = self.r.value;
        let alpha = self.press.opacity() as f32;
        let c = &mut self.canvas;
        c.begin(s);

        // The PressableOpacity's layer, clipped to the card.
        c.save();
        c.clip_rect(0.0, 0.0, w, HEIGHT as f32);
        let left = l.cm + INITIAL_R / 2.0 - r / 2.0 - l.cm / 2.0;
        let (ml, mr) = (grid(left, sd, false), grid(left + 2.0 * r, sd, false));
        let side = (mr - ml) as f32;
        rounded_square(
            c,
            ml as f32,
            side,
            200.0,
            &Paint::fill(over_white(Color::view_hex(primary), alpha)),
        );
        let small = interpolate_color(r, &[INITIAL_R, wd / 2.0], &[rgb(primary), rgb(highlight)]);
        let (sl, ss) = (l.small.0 as f32, l.small.1 as f32);
        rounded_square(
            c,
            sl,
            ss,
            200.0,
            &Paint::fill(over_white(Color::view_hex(packed(small)), alpha)),
        );
        let (ix, iy) = (sl + l.icon.0 as f32, sl + l.icon.1 as f32);
        c.draw_text(
            TWITTER,
            ix,
            gfx::baseline(icon, iy),
            icon,
            &Paint::fill(over_white(Color::WHITE, alpha)),
        );
        c.restore();

        // progress = clamp(r / (boxWidth / 3)); the Texts' colour.
        let progress = (r / (wd / 3.0)).clamp(0.0, 1.0);
        let ink = interpolate_color(progress, &[0.0, 1.0], &[rgb(0x000000), rgb(0xFFFFFF)]);
        let ink = Color::view_hex(packed(ink));
        let (tl, tt, tw, th) = l.text;
        c.save();
        c.clip_rect(tl as f32, tt as f32, tw as f32, th as f32);
        let line = gfx::line_height(description);
        for (i, &(a, b)) in l.lines.iter().enumerate() {
            let y = gfx::baseline(description, tt as f32 + i as f32 * line);
            c.draw_text(&text[a..b], tl as f32, y, description, &Paint::fill(ink));
        }
        c.restore();
        let (al, at, _, _) = l.action;
        let paint = Paint::fill(ink).with_opacity(self.action_press.opacity() as f32);
        c.draw_text(
            title,
            al as f32,
            gfx::baseline(action, at as f32 + 5.0),
            action,
            &paint,
        );

        let (pw, ph) = frame.pixels();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        // boxWidth on a 420 pt screen: 378.
        Frame {
            width: 378.0,
            height: 250.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn fonts() -> (Font, Font, Font) {
        (
            Font::new(ANTDESIGN, ICON_SIZE)
                .map(Font::with_ui_layout)
                .unwrap(),
            skia::match_ui_font(DESCRIPTION_SIZE, 400.0).unwrap(),
            skia::match_ui_font(ACTION_SIZE, 700.0).unwrap(),
        )
    }

    #[test]
    fn rn_s_yoga_frames() {
        let (i, d, a) = fonts();
        let l = layout(378.0, 3.0, &i, &d, &a, CARDS[0].3);
        // The secondary circle at 22.68 → 22.667, 70 wide; the icon Text 40.333 wide, floored.
        assert!((l.small.0 - 68.0 / 3.0).abs() < 1e-9, "{:?}", l.small);
        assert!((l.small.1 - 70.0).abs() < 1e-9);
        assert!((l.icon.0 - 44.0 / 3.0).abs() < 1e-9, "{:?}", l.icon);
        // The description: two lines, the second the rest of the text.
        assert_eq!(l.lines.len(), 2, "{:?}", l.lines);
        assert!(CARDS[0].3[l.lines[1].0..l.lines[1].1].ends_with("share online."));
        assert!(CARDS[0].3[..l.lines[0].1].ends_with("React Native"));
        assert!(
            (l.text.0 - 68.0 / 3.0).abs() < 1e-9 && (l.text.1 - 377.0 / 3.0).abs() < 1e-9,
            "{:?}",
            l.text
        );
        // The action's pressable ends at 250 − 22.68 → 227.333 (its top hangs on the font's line
        // height: 200.333 on iOS's SF, the Mac's SF differs).
        assert!(
            (l.action.1 + l.action.3 - 682.0 / 3.0).abs() < 1e-9,
            "{:?}",
            l.action
        );
        let l2 = layout(378.0, 3.0, &i, &d, &a, CARDS[1].3);
        assert_eq!(l2.lines.len(), 2);
        assert!(CARDS[1].3[..l2.lines[0].1].ends_with("animated with"));
    }

    fn pointer(s: &mut dyn Surface, phase: PointerPhase, x: f32, y: f32, at_ms: f64) {
        s.input(&InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        });
    }

    #[test]
    fn a_hold_floods_the_card_and_a_release_shrinks_it_to_30() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "animated-clip-box", [255, 255, 255]);
        assert!(!animating);
        pointer(s.as_mut(), PointerPhase::Down, 200.0, 60.0, 10.0);
        let mut ms = 16.0;
        while ms < 3000.0 {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 1000.0 / 60.0;
        }
        let held = s.agent("").unwrap();
        assert!(held.contains("\"r\":378.000"), "{held}");
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        // Flooded: the far corner is the primary colour at the press's opacity 0.5.
        let p = img.at(3 * 370, 3 * 245);
        assert!(p[3] == 255 && p[2] > 200, "{p:?}");
        pointer(s.as_mut(), PointerPhase::Up, 200.0, 60.0, ms);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let end = ms + 3000.0;
        while ms < end {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 1000.0 / 60.0;
        }
        let out = s.agent("").unwrap();
        assert!(
            out.contains("\"r\":30.000") && out.contains("\"opacity\":1.000"),
            "{out}"
        );
    }
}
