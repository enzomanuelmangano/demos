//! Telegram Theme Switch (src/animations/telegram-theme-switch: index.tsx, components/
//! switch-theme, components/bottom-tab-bar, components/theme-provider, constants/, screens/,
//! assets/switch-theme.json): a dark screen with a four-icon tab bar; on the Search tab a round
//! button bottom right holds a moon (a Lottie file). Tapping it switches the theme: the new theme
//! is revealed in a circle that grows from the button (dark → light), or the old one shrinks into
//! it (light → dark), while the button's moon turns into a sun or back.
//!
//! - Palettes (constants/palette.ts, the `color` package): dark background #17202A, card
//!   #1A2530 (`Color('#17202A').lighten(0.15).hex()`); light background #FFFFFF, card #0088CC;
//!   text white in both. RN Views: Display P3 (`Color::view_hex`).
//! - Layout: the screen over a tab bar BOTTOM_BAR_HEIGHT tall (95; 80 under a 700 pt window), its
//!   colour the card's, paddingBottom safeBottom / 2, four flex 1 cells (Home, Search,
//!   Notifications, Message): MaterialIcons home / search / notifications / message, 28, white,
//!   centred, the cell at opacity 1 when focused else 0.3 (withTiming, 300 ms, inOut(quad)), inside
//!   pressto's PressableOpacity (1 → 0.5 while held: withTiming 250 ms bezier(0.25, 0.1, 0.25,
//!   1); the app's selection haptic on a press). The Search screen (the first one shown) puts the
//!   button 20 above its bottom, 10 from its right: 80 × 80, the card's colour, borderRadius 50
//!   (a circle), the Lottie 65 × 65 centred in it at progress round(animationProgress), hidden
//!   while 0 < progress < 1. The other screens are the background only.
//! - The tap (Gesture.Tap: no distance limit, maxDuration 500 ms, after which RNGH cancels it and
//!   onTouchesUp never comes): onTouchesDown starts the snapshot (`makeImageFromView` of the whole
//!   demo, unless a switch is running); onTouchesUp switches, unless one is running.
//! - The switch (toggleTheme): isAnimating; invertClip = theme ≠ light; the snapshot shown;
//!   center = the button's measured page rect; the theme flips; animationProgress from 1 − to →
//!   to (1 going to light, 0 going to dark) with withSpring { duration 1000, dampingRatio 1 }; at
//!   its end isAnimating off and the snapshot dropped.
//! - The snapshot is drawn over the live demo by a Skia canvas, clipped to a circle about the
//!   button's centre (inverted when going to light), radius interpolate(clipPathRadiusScale, [0,
//!   0.9], [2, max]) extended, max = hypot(max(H − y, y), max(W − x, x)) of the button's top-left
//!   (as RN writes it). The snapshot is the old theme's demo as it was at touch down: the view
//!   hierarchy rasterized (drawViewHierarchyInRect into a DeviceRGB context, so sRGB: the
//!   Display P3 colours as sRGB, as `view_hex` gives them) and drawn 1:1 (W × H at the screen's
//!   scale). Here the old scene is drawn again under the clip from its state at touch down: the
//!   same pixels. On the iOS 27 simulator RN's snapshot fails (`drawViewHierarchyInRect` returns
//!   NO: "could not be rendered"), so the RN app there flips the theme at once under the overlay
//!   Lottie; the reveal here is the demo's design, as on hardware.
//! - Over everything, while isAnimating, a second Lottie at the button (absolute at its page
//!   rect, 80 × 80, the 65 Lottie centred) plays animationProgress continuously.
//! - The Lottie (telegram_lottie.rs, generated from the JSON by exact/parity-tools/
//!   telegram-lottie.ts): lottie-ios at `currentProgress` p shows frame p × op (fractional), the
//!   200 × 200 composition aspect-fit into 65 × 65; one layer (position 100, 100, anchor
//!   34.922, 36.154, scale 347%); the body (a morph from a crescent to a circle over frames 0 → 9,
//!   at −45°, scale 100 × 98.263%) under eight rays (their group scaled 46 → 100%, turned −30 →
//!   0°, opacity 0 → 100% over frames 0 → 10, about 34.922, 36.154). Every fill white (the
//!   colorFilters on "Layer 1/icons Outlines": `.**.Color`). Keyframes ease along the cubic
//!   Bézier (o.x, o.y, i.x, i.y) as CAMediaTimingFunction's control points (Float), solved to
//!   1e-12 here; paths morph vertex by vertex. The layer stays visible at its out-point (lottie-
//!   ios keeps a layer whose out-point is the end frame shown at progress 1).
//!
//! THE REDESIGN (the owner's phone note, 2026-11-15: "this tab bar and this animation aren't
//! modern at all, improve everything"), past RN on purpose:
//! - The tab bar floats: an iOS 26 liquid-glass capsule (a soft shadow under a translucent fill,
//!   a top-lit sheen and a hairline rim) inset 20 from the sides, 64 tall, `bar_gap` above the
//!   screen's bottom. Each tab is an icon over a 10 pt semibold label, in the accent when
//!   selected, secondary otherwise; a pill under the selected tab slides to the new one on a
//!   spring (420 ms, damping ratio 0.78), and a held tab shrinks to 0.92 (pressto's progress).
//! - The theme button is a 60 pt prominent-glass circle (the accent, the same rim and sheen),
//!   20 above the bar at the right; held, it shrinks to 0.92.
//! - The reveal: the new theme in a circle from the button's centre over 620 ms on
//!   cubic-bezier(0.32, 0.72, 0, 1) (a long, soft deceleration), its radius reaching the farthest
//!   corner from the centre; the outgoing theme sinks back (scale 1 → 0.965 about the button) and
//!   dims (black, 0 → 0.18); a lens rim (a 1.5 pt light ring and a 14 pt soft glow) rides the
//!   circle's edge, hiding its aliasing, and fades out as it lands. Haptics: a light impact at the
//!   button's touch, a soft one as the reveal lands, and the selection on a tab.
//!
//! RN's original, kept below for reference (the motion audit is RN's):
//!
//! Motion audit:
//!
//! | value | driver | config | trigger |
//! |---|---|---|---|
//! | animationProgress | withSpring | { duration 1000, dampingRatio 1 } (gfx::spring_to: critically damped), from 1 − to | the button's touch up |
//! | clipPathRadiusScale | useDerivedValue(withSpring) | same config, to theme == light ? 1 : 0 | the theme flip (RN: once React commits it, a frame or so after animationProgress starts; here the same frame, so it is animationProgress's value) |
//! | clip radius | interpolate | [0, 0.9] → [2, max], extended | clipPathRadiusScale |
//! | isAnimating, snapshot | set / spring's end callback | — | touch up / animationProgress's end |
//! | overlay Lottie | animatedProps progress | animationProgress (frame = p × 10.0000004) | — |
//! | button Lottie | animatedProps progress | round(animationProgress); its view's opacity 0 while 0 < p < 1 | — |
//! | button scale | withSpring(scale) | scale is never changed: 1 | — |
//! | tab opacity | withTiming | 300 ms, inOut(quad), 1 focused / 0.3 | a tab press |
//! | tab press opacity | pressto withTiming | 250 ms, bezier(0.25, 0.1, 0.25, 1), 1 → 0.5 while held | touch down / up (`pressto::Pressable`) |
//! | haptics | the app's PressablesConfig onPress | selection | a tab press |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use pressto::{PressEvent, Pressable};
use reanimated::{Easing, Spring, Timing};
use skia::{point, Canvas, Color, Font, Paint, Renderer, Shader};

use crate::gfx;
use crate::telegram_lottie as lottie;

/// The floating bar: its height, side inset and corner radius (a capsule).
const BAR_H: f32 = 64.0;
const BAR_SIDE: f32 = 20.0;
/// The selected tab's pill: inset from the bar's edges.
const PILL_INSET: f32 = 5.0;
/// The tab icons' size and the labels' (SF semibold).
const ICON: f32 = 24.0;
const LABEL: f32 = 10.0;
const LABELS: [&str; 4] = ["Home", "Search", "Alerts", "Chats"];
/// MaterialIcons home, search, notifications, message (ScreenNamesArray's order).
const ICONS: [&str; 4] = ["\u{E88A}", "\u{E8B6}", "\u{E7F4}", "\u{E0C9}"];
/// The first tab shown: 'Search'.
const SEARCH: usize = 1;
/// The theme button: 60 pt, 20 above the bar, aligned with the bar's right edge; the Lottie
/// (composed for 65) drawn at LOTTIE_IN.
const BUTTON: f32 = 60.0;
const BUTTON_BOTTOM: f32 = 20.0;
const BUTTON_RIGHT: f32 = BAR_SIDE;
const LOTTIE: f32 = 65.0;
const LOTTIE_IN: f32 = 44.0;
/// The reveal: duration and curve.
const SWITCH_MS: f64 = 620.0;
const REVEAL: (f64, f64, f64, f64) = (0.32, 0.72, 0.0, 1.0);
/// The outgoing theme's sink and dim at the reveal's end.
const SINK: f32 = 0.035;
const DIM_OUT: f32 = 0.18;
/// The tab pill's spring.
const PILL_MS: f64 = 420.0;
const PILL_DAMPING: f64 = 0.78;
/// A held control's scale.
const PRESSED: f32 = 0.92;
/// Gesture.Tap's maxDuration.
const TAP_MAX_MS: f64 = 500.0;
/// The tab opacity's timing; pressto's.
const TAB_MS: f64 = 300.0;
/// An unfocused tab's opacity.
const DIM: f64 = 0.3;
/// The clip's smallest radius.
const MIN_RADIUS: f64 = 2.0;

static MATERIAL_ICONS: &[u8] = include_bytes!("../fonts/materialicons-tabs-subset.ttf");

/// The demo's surface: `telegram_theme_switch(safeBottom)`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(TelegramThemeSwitch::new())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Theme {
    Dark,
    Light,
}

/// A palette: background, accent (the button's fill), the glass bar's fill, its rim, the pill,
/// the selected tab's and the others' colour, and the bar's shadow.
struct Palette {
    background: Color,
    accent: Color,
    glass: Color,
    rim: Color,
    pill: Color,
    selected: Color,
    idle: Color,
    shadow: Color,
}

fn palette(theme: Theme) -> Palette {
    match theme {
        Theme::Dark => Palette {
            background: Color::view_hex(0x17202A),
            accent: Color::view_hex(0x2F8BD8),
            glass: Color::rgba8(44, 58, 72, 196),
            rim: Color::rgba8(255, 255, 255, 60),
            pill: Color::rgba8(255, 255, 255, 30),
            selected: Color::view_hex(0x5AB3F5),
            idle: Color::rgba8(235, 240, 245, 150),
            shadow: Color::rgba8(0, 0, 0, 110),
        },
        Theme::Light => Palette {
            background: Color::view_hex(0xFFFFFF),
            accent: Color::view_hex(0x0088CC),
            glass: Color::rgba8(250, 251, 253, 214),
            rim: Color::rgba8(255, 255, 255, 230),
            pill: Color::rgba8(0, 136, 204, 26),
            selected: Color::view_hex(0x0088CC),
            idle: Color::rgba8(60, 60, 67, 150),
            shadow: Color::rgba8(20, 40, 70, 38),
        },
    }
}

/// What the demo shows, enough to draw it again (the snapshot is one of these, frozen).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Scene {
    theme: Theme,
    tab: usize,
    /// Each tab's selection (its focus timing, 0 idle … 1 selected) and press (0 … 1).
    tabs: [f32; 4],
    pressed: [f32; 4],
    /// The pill's position, in tabs (0 … 3).
    pill: f32,
    /// The theme button's press (0 … 1).
    button_press: f32,
    /// The button's Lottie progress (rounded) and its view's opacity.
    lottie: f64,
    lottie_opacity: f32,
}

/// The pixel-grid layout.
#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    w: f32,
    h: f32,
    scale: f32,
    bar_top: f32,
    /// The bar's left edge and width.
    bar_x: f32,
    bar_w: f32,
    /// Each cell's left edge, and the last one's right.
    cells: [f32; 5],
    /// The icon box's side.
    icon: f32,
    /// The button's page rect's top-left.
    button: (f32, f32),
    /// The Lottie view's offset in the button (and in the overlay): (80 − 65) / 2 = 7.5 rounded by
    /// Yoga to the device pixel, 7.667 at 3x (the moon sat 0.5 px up and left).
    lottie_inset: f32,
}

/// Yoga's rounding of a layout edge to the pixel grid: to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// A Text node's position in its parent: Yoga's roundLayoutResultsToPixelGrid floors a Text
/// node's relative left/top (textRounding) where a View's rounds. Measured: each icon's 28.333 box
/// sits 24.667 into its 78 pt cell, not 24.833 rounded to 25 (the icons were 1 px low).
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// A Text's measured box side, ceiled to the pixel grid (RN's text measurement rounding).
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32, safe_bottom: f32, icon_font: Option<&Font>) -> Layout {
        // The floating bar sits a little into the home indicator's area, as iOS 26's does.
        let gap = if safe_bottom > 0.0 { (safe_bottom * 0.62).max(12.0) } else { 12.0 };
        let bar_top = grid(h - gap - BAR_H, scale);
        let bar_x = BAR_SIDE;
        let bar_w = w - 2.0 * BAR_SIDE;
        let inner = bar_w - 2.0 * PILL_INSET;
        let cells = std::array::from_fn(|i| grid(bar_x + PILL_INSET + inner * i as f32 / 4.0, scale));
        let icon = icon_font.map_or(ICON, |f| text_side(f.advance_width(ICONS[0]).max(gfx::line_height(f)), scale));
        let button = (grid(w - BUTTON_RIGHT - BUTTON, scale), grid(bar_top - BUTTON_BOTTOM - BUTTON, scale));
        let lottie_inset = (BUTTON - LOTTIE_IN) / 2.0;
        Layout { w, h, scale, bar_top, bar_x, bar_w, cells, icon, button, lottie_inset }
    }

    fn cell_at(&self, x: f32, y: f32) -> Option<usize> {
        // The whole capsule takes touches, a little past it too (a thumb lands low).
        if y < self.bar_top - 6.0 || y > self.bar_top + BAR_H + 12.0 || x < self.bar_x || x > self.bar_x + self.bar_w {
            return None;
        }
        let x = x.clamp(self.cells[0], self.cells[4] - 0.01);
        (0..4).find(|&i| x >= self.cells[i] && x < self.cells[i + 1])
    }

    fn on_button(&self, x: f32, y: f32) -> bool {
        let (bx, by) = self.button;
        (bx..=bx + BUTTON).contains(&x) && (by..=by + BUTTON).contains(&y)
    }

    /// The button's centre.
    fn centre(&self) -> (f32, f32) {
        (self.button.0 + BUTTON / 2.0, self.button.1 + BUTTON / 2.0)
    }

    /// The reveal circle's radius at `open` (0 closed … 1 past the farthest corner).
    fn radius(&self, open: f64) -> f32 {
        let (cx, cy) = self.centre();
        let (cx, cy, w, h) = (cx as f64, cy as f64, self.w as f64, self.h as f64);
        let max = (cx.max(w - cx).powi(2) + cy.max(h - cy).powi(2)).sqrt() + 2.0;
        (MIN_RADIUS + (max - MIN_RADIUS) * open) as f32
    }
}

/// A cubic Bézier easing with control points (x1, y1), (x2, y2), as CAMediaTimingFunction holds
/// them (Float), solved for x to 1e-12.
fn ease(x1: f64, y1: f64, x2: f64, y2: f64, x: f64) -> f64 {
    let [x1, y1, x2, y2] = [x1, y1, x2, y2].map(|v| v as f32 as f64);
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let curve = |a: f64, b: f64, t: f64| 3.0 * a * t * (1.0 - t).powi(2) + 3.0 * b * t * t * (1.0 - t) + t.powi(3);
    let slope = |a: f64, b: f64, t: f64| 3.0 * a * (1.0 - t).powi(2) + 6.0 * (b - a) * t * (1.0 - t) + 3.0 * (1.0 - b) * t * t;
    let (mut lo, mut hi, mut t) = (0.0f64, 1.0f64, x);
    for _ in 0..64 {
        let e = curve(x1, x2, t) - x;
        if e.abs() < 1e-12 {
            break;
        }
        if e > 0.0 {
            hi = t;
        } else {
            lo = t;
        }
        let d = slope(x1, x2, t);
        let next = t - e / d;
        t = if d.abs() > 1e-9 && next > lo && next < hi { next } else { (lo + hi) / 2.0 };
    }
    curve(y1, y2, t)
}

/// A keyframe segment's eased progress at `frame`.
fn eased<T>(k: &lottie::Keyframe<T>, frame: f64) -> f64 {
    let local = ((frame - k.t) / (k.t1 - k.t)).clamp(0.0, 1.0);
    ease(k.o[0], k.o[1], k.i[0], k.i[1], local)
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// A closed Lottie path (vertices, in and out tangents relative to their vertex) appended.
fn lottie_path(b: &mut skia::ScratchBuilder<'_>, n: usize, at: impl Fn(usize) -> ([f64; 2], [f64; 2], [f64; 2])) {
    let pt = |p: [f64; 2]| point(p[0] as f32, p[1] as f32);
    let (v0, _, _) = at(0);
    b.begin(pt(v0));
    for j in 0..n {
        let (v, _, o) = at(j);
        let (v1, i1, _) = at((j + 1) % n);
        b.cubic_bezier_to(pt([v[0] + o[0], v[1] + o[1]]), pt([v1[0] + i1[0], v1[1] + i1[1]]), pt(v1));
    }
    b.end(true);
}

/// The Lottie at `progress` in a `LOTTIE` square at (x, y), every fill white.
fn draw_lottie(c: &mut Canvas, x: f32, y: f32, progress: f64, opacity: f32) {
    if opacity <= 0.0 {
        return;
    }
    let frame = progress * lottie::END_FRAME;
    let white = Paint::fill(Color::WHITE).with_opacity(opacity);
    let f = |v: f64| v as f32;
    c.save();
    // Aspect-fit of the composition.
    let fit = (LOTTIE / f(lottie::COMP[0])).min(LOTTIE / f(lottie::COMP[1]));
    c.translate(x + (LOTTIE - fit * f(lottie::COMP[0])) / 2.0, y + (LOTTIE - fit * f(lottie::COMP[1])) / 2.0);
    c.scale(fit, fit);
    // The layer: position · scale · −anchor.
    c.translate(f(lottie::LAYER_P[0]), f(lottie::LAYER_P[1]));
    c.scale(f(lottie::LAYER_S[0] / 100.0), f(lottie::LAYER_S[1] / 100.0));
    c.translate(-f(lottie::LAYER_A[0]), -f(lottie::LAYER_A[1]));
    // The body (drawn first: the later group in the shapes array is under).
    c.save();
    c.translate(f(lottie::BODY_P[0]), f(lottie::BODY_P[1]));
    c.rotate(f(lottie::BODY_R.to_radians()));
    c.scale(f(lottie::BODY_S[0] / 100.0), f(lottie::BODY_S[1] / 100.0));
    let m = &lottie::BODY_MORPH;
    let k = eased(m, frame);
    let mix = |a: [f64; 2], b: [f64; 2]| [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    c.draw_with(&white, |b| lottie_path(b, 4, |j| (mix(m.from.v[j], m.to.v[j]), mix(m.from.i[j], m.to.i[j]), mix(m.from.o[j], m.to.o[j]))));
    c.restore();
    // The rays: position · rotation · scale · −anchor, at the group's opacity.
    let (s, r, o) = (&lottie::RAYS_SCALE, &lottie::RAYS_ROTATION, &lottie::RAYS_OPACITY);
    let (ks, kr, ko) = (eased(s, frame), eased(r, frame), eased(o, frame));
    let opacity = lerp(o.from, o.to, ko) / 100.0;
    if opacity > 0.0 {
        c.save();
        c.translate(f(lottie::RAYS_P[0]), f(lottie::RAYS_P[1]));
        c.rotate(f(lerp(r.from, r.to, kr).to_radians()));
        c.scale(f(lerp(s.from[0], s.to[0], ks) / 100.0), f(lerp(s.from[1], s.to[1], ks) / 100.0));
        c.translate(-f(lottie::RAYS_A[0]), -f(lottie::RAYS_A[1]));
        c.opacity(opacity as f32);
        for ray in &lottie::RAYS {
            c.save();
            c.translate(f(ray.at[0]), f(ray.at[1]));
            c.draw_with(&white, |b| lottie_path(b, 7, |j| (ray.v[j], ray.i[j], ray.o[j])));
            c.restore();
        }
        c.restore();
    }
    c.restore();
}

/// A glass capsule (or circle): a soft shadow, the translucent fill, a top-lit sheen and a
/// hairline rim brighter at the top.
fn draw_glass(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, r: f32, fill: Color, p: &Palette) {
    c.draw_rrect_shadow(x, y + 6.0, w, h, r, 14.0, p.shadow);
    c.draw_rrect(x, y, w, h, r, &Paint::fill(fill));
    let sheen = Paint::shader(Shader::Linear {
        start: point(0.0, y),
        end: point(0.0, y + h),
        stops: vec![(0.0, Color::rgba8(255, 255, 255, 34)), (0.5, Color::rgba8(255, 255, 255, 6)), (1.0, Color::rgba8(255, 255, 255, 0))],
    });
    c.draw_rrect(x, y, w, h, r, &sheen);
    let [rr, rg, rb, ra] = p.rim.0;
    let rim = Paint::shader(Shader::Linear {
        start: point(0.0, y),
        end: point(0.0, y + h),
        stops: vec![(0.0, Color([rr, rg, rb, ra])), (0.55, Color([rr, rg, rb, ra * 0.35])), (1.0, Color([rr, rg, rb, ra * 0.6]))],
    })
    .stroked(1.0 / 1.5);
    let inset = 0.5 / 1.5;
    c.draw_rrect(x + inset, y + inset, w - 2.0 * inset, h - 2.0 * inset, r - inset, &rim);
}

/// `c` scaled by `k` about (x, y) until the matching restore.
fn scale_about(c: &mut Canvas, x: f32, y: f32, k: f32) {
    c.translate(x, y);
    c.scale(k, k);
    c.translate(-x, -y);
}

/// The demo as `scene` shows it.
fn draw_scene(c: &mut Canvas, l: &Layout, scene: &Scene, icons: Option<&Font>, labels: Option<&Font>) {
    let p = palette(scene.theme);
    c.draw_rect(0.0, 0.0, l.w, l.h, &Paint::fill(p.background));
    if scene.tab == SEARCH {
        let (cx, cy) = l.centre();
        let (bx, by) = l.button;
        c.save();
        scale_about(c, cx, cy, 1.0 - (1.0 - PRESSED) * scene.button_press);
        draw_glass(c, bx, by, BUTTON, BUTTON, BUTTON / 2.0, p.accent, &p);
        c.save();
        let k = LOTTIE_IN / LOTTIE;
        c.translate(bx + l.lottie_inset, by + l.lottie_inset);
        c.scale(k, k);
        draw_lottie(c, 0.0, 0.0, scene.lottie, scene.lottie_opacity);
        c.restore();
        c.restore();
    }
    // The floating bar and the selected tab's pill, sliding.
    draw_glass(c, l.bar_x, l.bar_top, l.bar_w, BAR_H, BAR_H / 2.0, p.glass, &p);
    let cell = (l.cells[4] - l.cells[0]) / 4.0;
    let pill_h = BAR_H - 2.0 * PILL_INSET;
    let px = l.cells[0] + cell * scene.pill;
    c.draw_rrect(px, l.bar_top + PILL_INSET, cell, pill_h, pill_h / 2.0, &Paint::fill(p.pill));
    let Some(font) = icons else { return };
    for (i, glyph) in ICONS.iter().enumerate() {
        let (x0, x1) = (l.cells[i], l.cells[i + 1]);
        let mid = (x0 + x1) / 2.0;
        let t = scene.tabs[i].clamp(0.0, 1.0);
        let colour = Color(std::array::from_fn(|k| p.idle.0[k] + (p.selected.0[k] - p.idle.0[k]) * t));
        let paint = Paint::fill(colour);
        let icon_top = l.bar_top + 10.0;
        c.save();
        scale_about(c, mid, l.bar_top + BAR_H / 2.0, 1.0 - (1.0 - PRESSED) * scene.pressed[i]);
        let x = text_grid(mid - l.icon / 2.0, l.scale);
        c.draw_text(glyph, x, gfx::baseline(font, text_grid(icon_top, l.scale)), font, &paint);
        if let Some(lf) = labels {
            let lw = lf.advance_width(LABELS[i]);
            let ly = icon_top + l.icon + 2.0;
            c.draw_text(LABELS[i], text_grid(mid - lw / 2.0, l.scale), gfx::baseline(lf, text_grid(ly, l.scale)), lf, &paint);
        }
        c.restore();
    }
}

struct TelegramThemeSwitch {
    safe_bottom: f32,
    layout: Layout,
    theme: Theme,
    tab: usize,
    /// Each cell's focus opacity and pressto's press progress.
    focus: [Timing; 4],
    /// Each cell's PressableOpacity (the shared pressto machine).
    press: [Pressable; 4],
    /// The finger on the button: its id and when it came down.
    tapping: Option<(u32, f64)>,
    /// animationProgress: 0 dark … 1 light (the Lottie's), eased.
    progress: Timing,
    /// Where the switch goes (1 light, 0 dark).
    to: f64,
    /// The selected tab's pill, in tabs.
    pill: Spring,
    animating: bool,
    invert: bool,
    /// The snapshot taken at touch down, and the one shown during a switch.
    pending: Option<Scene>,
    shown: Option<Scene>,
    icons: Option<Font>,
    labels: Option<Font>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

impl TelegramThemeSwitch {
    fn new() -> TelegramThemeSwitch {
        TelegramThemeSwitch {
            safe_bottom: 0.0,
            layout: Layout::default(),
            theme: Theme::Dark,
            tab: SEARCH,
            focus: std::array::from_fn(|i| Timing::at(if i == SEARCH { 1.0 } else { DIM })),
            press: std::array::from_fn(|_| Pressable::new()),
            tapping: None,
            progress: Timing::at(0.0),
            to: 0.0,
            pill: Spring::at(SEARCH as f64),
            animating: false,
            invert: false,
            pending: None,
            shown: None,
            icons: Font::new(MATERIAL_ICONS, ICON).map(Font::with_ui_layout),
            labels: skia::match_ui_font(LABEL, 600.0),
            posted: Vec::new(),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    fn scene(&self) -> Scene {
        let p = self.progress.value;
        Scene {
            theme: self.theme,
            tab: self.tab,
            tabs: std::array::from_fn(|i| ((self.focus[i].value - DIM) / (1.0 - DIM)) as f32),
            pressed: std::array::from_fn(|i| self.press[i].progress() as f32),
            pill: self.pill.value as f32,
            button_press: if self.tapping.is_some() { 1.0 } else { 0.0 },
            lottie: p.round(),
            lottie_opacity: if p > 0.0 && p < 1.0 { 0.0 } else { 1.0 },
        }
    }

    /// onPress (after the global selection haptic): the tab.
    fn select(&mut self, i: usize) {
        if i != self.tab {
            self.focus[self.tab].to(DIM, TAB_MS, Easing::timing_default());
            self.focus[i].to(1.0, TAB_MS, Easing::timing_default());
            self.tab = i;
            gfx::spring_to(&mut self.pill, i as f64, PILL_MS, PILL_DAMPING);
        }
    }

    /// toggleTheme.
    fn toggle(&mut self) {
        if self.animating {
            self.pending = None;
            return;
        }
        self.animating = true;
        self.invert = self.theme != Theme::Light;
        self.shown = Some(self.pending.take().unwrap_or_else(|| self.scene()));
        let to = if self.theme != Theme::Light { 1.0 } else { 0.0 };
        self.theme = if self.theme == Theme::Light { Theme::Dark } else { Theme::Light };
        self.to = to;
        self.progress.set(1.0 - to);
        let (x1, y1, x2, y2) = REVEAL;
        self.progress.to(to, SWITCH_MS, Easing::bezier(x1, y1, x2, y2));
    }
}

impl Surface for TelegramThemeSwitch {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_bottom = inputs.first().map(|v| exact_gpu::json::number(v, "safeBottom")).transpose()?.unwrap_or(0.0) as f32;
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let theme = if self.theme == Theme::Dark { "dark" } else { "light" };
        Some(format!("{{\"theme\":\"{theme}\",\"tab\":{},\"progress\":{:.4},\"animating\":{}}}", self.tab, self.progress.value + 0.0, self.animating))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let l = self.layout;
        let phase = gfx::phase(phase);
        match phase {
            Phase::Down => {
                if self.tab == SEARCH && l.on_button(x, y) && self.tapping.is_none() {
                    self.tapping = Some((id, at_ms));
                    self.posted.push("haptic:impact-light".into());
                    // prepareToggleTheme: the snapshot, unless a switch runs.
                    if !self.animating {
                        self.pending = Some(self.scene());
                    }
                } else if let Some(i) = l.cell_at(x, y) {
                    if !self.press.iter().any(Pressable::is_pressed) {
                        self.press[i].pointer_down(id, true);
                    }
                }
            }
            Phase::Move => {
                let at = l.cell_at(x, y);
                for (i, p) in self.press.iter_mut().enumerate() {
                    p.pointer_move(id, at == Some(i));
                }
            }
            Phase::Up | Phase::Cancel => {
                if let Some((tid, down)) = self.tapping {
                    if tid == id {
                        self.tapping = None;
                        if phase == Phase::Up && at_ms - down <= TAP_MAX_MS {
                            self.toggle();
                        } else {
                            // RNGH failed the tap at maxDuration (or the touch was cancelled).
                            self.pending = None;
                        }
                    }
                }
                let at = l.cell_at(x, y);
                for i in 0..self.press.len() {
                    if let Some(PressEvent::Press(press)) = self.press[i].pointer(id, phase, at == Some(i)) {
                        self.posted.extend(press.global_message().map(String::from));
                        self.select(i);
                    }
                }
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
        let now = frame.now_ms;
        self.layout = Layout::new(frame.width, frame.height, frame.scale, self.safe_bottom, self.icons.as_ref());
        let mut moving = false;
        for t in self.focus.iter_mut() {
            moving |= t.step(now);
        }
        for p in self.press.iter_mut() {
            moving |= p.step(now);
        }
        moving |= self.pill.step(now);
        if self.animating {
            if self.progress.step(now) {
                moving = true;
            } else {
                // The switch is over, the snapshot dropped; a soft tap as it lands.
                self.animating = false;
                self.shown = None;
                self.posted.push("haptic:impact-soft".into());
            }
        }
        let l = self.layout;
        let live = self.scene();
        let c = &mut self.canvas;
        c.begin(frame.scale);
        let (icons, labels) = (self.icons.as_ref(), self.labels.as_ref());
        match (self.animating, self.shown.as_ref()) {
            (true, Some(snapshot)) => {
                // k: how far the switch has come (0 … 1, whichever way it goes).
                let k = if self.to == 1.0 { self.progress.value } else { 1.0 - self.progress.value };
                let (cx, cy) = l.centre();
                let invert = self.invert;
                // Going light, the new theme opens from the button over the old; going dark,
                // the old (light) closes into it over the new.
                let r = l.radius(if invert { k } else { 1.0 - k });
                draw_scene(c, &l, &live, icons, labels);
                c.save();
                c.clip_with(|b| {
                    if invert {
                        skia::add_rect(b, -1.0, -1.0, l.w + 2.0, l.h + 2.0);
                    }
                    skia::add_circle_fine(b, cx, cy, r.max(0.0), invert);
                });
                // The outgoing theme sinks back and dims as it leaves (its own background behind
                // it, so the edges it uncovers stay the old theme's).
                c.draw_rect(0.0, 0.0, l.w, l.h, &Paint::fill(palette(snapshot.theme).background));
                c.save();
                scale_about(c, cx, cy, 1.0 - SINK * k as f32);
                draw_scene(c, &l, snapshot, icons, labels);
                c.restore();
                c.draw_rect(0.0, 0.0, l.w, l.h, &Paint::fill(Color::BLACK).with_opacity(DIM_OUT * k as f32));
                c.restore();
                // The lens rim on the circle's edge, fading as it lands.
                let fade = (1.0 - k as f32).powf(0.6);
                if r > 1.0 && fade > 0.0 {
                    let glow = 14.0;
                    let outer = r + glow;
                    let at = r / outer;
                    c.draw_circle(cx, cy, outer, &Paint::shader(Shader::Radial {
                        center: point(cx, cy),
                        radius: outer,
                        stops: vec![
                            (0.0, Color::rgba8(255, 255, 255, 0)),
                            ((at - glow / outer).max(0.0), Color::rgba8(255, 255, 255, 0)),
                            (at, Color::rgba8(255, 255, 255, 46)),
                            (1.0, Color::rgba8(255, 255, 255, 0)),
                        ],
                    }).with_opacity(fade));
                    c.draw_circle(cx, cy, r, &Paint::stroke(Color::rgba8(255, 255, 255, 110), 1.5).with_opacity(fade));
                }
                // The button's Lottie plays over everything.
                let (bx, by) = l.button;
                c.save();
                let s = LOTTIE_IN / LOTTIE;
                c.translate(bx + l.lottie_inset, by + l.lottie_inset);
                c.scale(s, s);
                draw_lottie(c, 0.0, 0.0, self.progress.value, 1.0);
                c.restore();
            }
            _ => draw_scene(c, &l, &live, icons, labels),
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.tapping.is_some() || self.press.iter().any(Pressable::is_pressed)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;
    const SAFE_BOTTOM: f64 = 34.0;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: W, height: H, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    fn rgb(img: &fixture::Pixels, x: f32, y: f32) -> [u8; 3] {
        let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
        [p[0], p[1], p[2]]
    }

    fn view(hex: u32) -> [u8; 3] {
        Color::view_hex(hex).0.map(|c| (c.clamp(0.0, 1.0) * 255.0).round() as u8)[..3].try_into().unwrap()
    }

    fn close(a: [u8; 3], b: [u8; 3]) -> bool {
        a.iter().zip(b).all(|(x, y)| (*x as i32 - y as i32).abs() <= 1)
    }

    #[test]
    fn the_easing_is_the_cubic_bezier() {
        // CSS `ease` at 0.5 (0.8024033877399112, solved exactly).
        assert!((ease(0.25, 0.1, 0.25, 1.0, 0.5) - 0.802_403_387_7).abs() < 1e-6);
        // Linear control points: the identity.
        assert!((ease(0.3, 0.3, 0.7, 0.7, 0.37) - 0.37).abs() < 1e-6);
        let mut last = 0.0;
        for k in 0..=100 {
            let v = ease(0.333, 0.0, 0.667, 1.0, k as f64 / 100.0);
            assert!(v >= last - 1e-12);
            last = v;
        }
        assert_eq!(ease(0.333, 0.0, 0.667, 1.0, 1.0), 1.0);
    }

    #[test]
    fn the_palette_is_the_color_packages() {
        // Color('#17202A').lighten(0.15).hex() = #1A2530.
        let lighter = Color::hex(0x17202A).lighten(0.15).0.map(|c| (c * 255.0).round() as u32);
        assert_eq!((lighter[0] << 16) | (lighter[1] << 8) | lighter[2], 0x1A2530);
    }

    fn render_all(gpu: &exact_gpu::Gpu, s: &mut Box<dyn Surface>, from: f64, to: f64) -> f64 {
        let mut ms = from;
        while ms < to {
            ms += 16.67;
            fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms
    }

    #[test]
    fn the_switch_reveals_the_new_theme_from_the_button() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(SAFE_BOTTOM)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "telegram-dark", [0, 0, 0]);
        assert!(!animating);
        // The dark background; the floating glass bar (inset 20, 64 tall, 21 above the bottom)
        // lighter than it, the background beside it; the accent button over the bar's right end.
        assert!(close(rgb(&rest, 100.0, 300.0), view(0x17202A)), "{:?}", rgb(&rest, 100.0, 300.0));
        assert!(close(rgb(&rest, 5.0, H - 5.0), view(0x17202A)), "{:?}", rgb(&rest, 5.0, H - 5.0));
        let bar = rgb(&rest, 60.0, 827.0 + 4.0);
        assert!(bar[0] > 30 && bar[2] > 45, "the glass {bar:?}");
        let (bx, by) = (W - 80.0, 827.0 - 80.0);
        let button = rgb(&rest, bx + 4.0, by + 30.0);
        assert!(button[2] as i32 > button[0] as i32 + 60, "the accent button {button:?}");

        // A hold past 500 ms: RNGH cancels the tap, nothing switches.
        s.input(&pointer(PointerPhase::Down, bx + 30.0, by + 30.0, 100.0));
        s.input(&pointer(PointerPhase::Up, bx + 30.0, by + 30.0, 700.0));
        fixture::render(&gpu, s.as_mut(), &frame(716.0)).unwrap();
        assert!(s.agent("{}").unwrap().contains("\"theme\":\"dark\""));

        // A tap: dark → light.
        s.messages();
        s.input(&pointer(PointerPhase::Down, bx + 30.0, by + 30.0, 1000.0));
        assert_eq!(s.messages(), vec!["haptic:impact-light".to_string()]);
        s.input(&pointer(PointerPhase::Up, bx + 30.0, by + 30.0, 1080.0));
        let ms = render_all(&gpu, &mut s, 1080.0, 1080.0 + 120.0);
        let (mid, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&mid, "telegram-to-light", [0, 0, 0]);
        assert!(animating);
        // Light inside the circle about the button, the dark snapshot far from it, dimmed as it
        // sinks.
        // (the lens glow's last trace on the white: within 2 levels).
        assert!(rgb(&mid, bx - 20.0, by + 30.0).iter().all(|&v| v >= 252), "{:?}", rgb(&mid, bx - 20.0, by + 30.0));
        let far = rgb(&mid, 10.0, 60.0);
        assert!(far[2] < view(0x17202A)[2] && far[2] > 10, "the old theme, dimmed {far:?}");
        let ms = render_all(&gpu, &mut s, ms, ms + 2500.0);
        let (light, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&light, "telegram-light", [0, 0, 0]);
        assert!(!animating);
        assert_eq!(s.agent("{}").unwrap(), "{\"theme\":\"light\",\"tab\":1,\"progress\":1.0000,\"animating\":false}");
        assert!(s.messages().contains(&"haptic:impact-soft".to_string()));
        assert!(close(rgb(&light, 10.0, 60.0), view(0xFFFFFF)));
        let button = rgb(&light, bx + 4.0, by + 30.0);
        assert!(button[2] as i32 > button[0] as i32 + 60, "the accent button {button:?}");

        // Light → dark: the light snapshot shrinks into the button.
        s.input(&pointer(PointerPhase::Down, bx + 30.0, by + 30.0, ms));
        s.input(&pointer(PointerPhase::Up, bx + 30.0, by + 30.0, ms + 80.0));
        let ms2 = render_all(&gpu, &mut s, ms + 80.0, ms + 80.0 + 120.0);
        let (mid2, _) = fixture::render(&gpu, s.as_mut(), &frame(ms2)).unwrap();
        gfx::save_over(&mid2, "telegram-to-dark", [0, 0, 0]);
        let near = rgb(&mid2, bx - 20.0, by + 30.0);
        assert!(near[0] > 180, "the light theme closing into the button {near:?}");
        assert!(close(rgb(&mid2, 10.0, 60.0), view(0x17202A)));
        render_all(&gpu, &mut s, ms2, ms2 + 2500.0);
        assert!(s.agent("{}").unwrap().contains("\"theme\":\"dark\""));
    }

    #[test]
    fn a_tab_press_selects_it_with_a_haptic() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(SAFE_BOTTOM)], None).unwrap();
        fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        // Home: the first cell of the floating bar (827 … 891).
        let y = 859.0;
        s.input(&pointer(PointerPhase::Down, 50.0, y, 10.0));
        s.input(&pointer(PointerPhase::Up, 50.0, y, 90.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        render_all(&gpu, &mut s, 90.0, 800.0);
        let (home, animating) = fixture::render(&gpu, s.as_mut(), &frame(800.0)).unwrap();
        gfx::save_over(&home, "telegram-home", [0, 0, 0]);
        assert!(!animating);
        assert!(s.agent("{}").unwrap().contains("\"tab\":0"));
        // No button on Home.
        assert!(close(rgb(&home, W - 50.0, 777.0), view(0x17202A)));
        // A drag off the cell before lifting: no press.
        s.input(&pointer(PointerPhase::Down, 50.0, y, 900.0));
        s.input(&pointer(PointerPhase::Up, 300.0, y, 980.0));
        assert!(s.messages().is_empty());
    }
}
