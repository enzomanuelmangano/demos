//! iOS Home Grid (src/animations/ios-home-grid): a 4-column grid of 24 metallic app squares; a
//! tap grows a square of the app's second colour into the whole screen while the grid blurs and
//! sinks, then the app's gradient screen shows under it as it fades; the screen's close button or
//! a drag down shrinks the square back into its icon. Everything moves per frame from Reanimated
//! springs, an animated BlurView intensity and a finger, so the whole demo is this surface.
//!
//! Layout (apps-list/index.tsx, app-item.tsx; Yoga: each position rounded relative to its parent,
//! half up, sizes from the unrounded absolute edges):
//! - SPACING 8, NUM_COLUMNS 4: itemSize = floor((W − 16 − 24) / 4); the container's padding is
//!   safeTop + DEMO_BUTTON_ROW_HEIGHT (56) on top and 8 at the sides; rows (justifyContent
//!   center, marginBottom 8) of four AppItems (width itemSize, aspectRatio 1, padding 14,
//!   marginRight 8 but the last); the NavigationItem (flex 1) holds the gradient View
//!   (colors[0], borderRadius 16 continuous).
//! - The list's View: flex 1, #fafafa, transform [scale 1 − sp × 0.05, translateY sp × 5] (sp =
//!   springIconProgress) about its centre, over the native-stack screen's own background,
//!   DefaultTheme's rgb(242, 242, 242) (NativeStackView contentStyle).
//! - MainScreenWrapper's AnimatedBlurView over it: tint light (`Material::Light`), intensity sp ×
//!   50 (expo-blur's fraction intensity / 100, clamped to 0.01 … 1; an intensity ≤ 0 shows no
//!   effect), opacity sp ≠ 0 ? 1 : 0, pointerEvents none.
//! - ExpansionProvider's Animated.View over everything (absolute, zIndex 1000): from the measured
//!   NavigationItem (pageX, pageY, width, height: layout, no transforms) to the window × scale
//!   centred, by transitionProgress; borderRadius 16 → 50 continuous, colors[1], opacity
//!   transitionOpacityProgress, boxShadow 0 0 20 rgba(0, 0, 0, 0.2) (RCTBoxShadow: σ 10, cut out
//!   of the box). Its width / height are layout props (rounded to the pixel), its translate isn't.
//!   A View: while its opacity is ≥ 0.01 UIKit's hit test gives it the touches over its frame.
//! - AppDetailScreen (pushed with animation 'none' once the expansion spring rests; popped at
//!   once): the screen's rgb(242, 242, 242), DetailScreenWrapper's inner View scaled by
//!   transitionScale about its centre, borderRadius interpolate(scale, [1, 0.8], [50, 30])
//!   (extended) continuous, overflow hidden; in it the expo LinearGradient of item.colors from
//!   (0, 0) to (1, 1) of the screen (a CG gradient: isolines perpendicular to the diagonal), and
//!   the PressableOpacity close button: absolute, top safeTop + 56, right 16, 44², radius 22,
//!   rgba(255, 255, 255, 0.8), boxShadow 0 0 10 rgba(0, 0, 0, 0.05) (σ 5), hitSlop 10, Ionicons
//!   close 24 rgba(0, 0, 0, 0.7) centred (its Text box ceiled, its offset floored). The button's
//!   opacity is a group opacity: drawn into an offscreen layer then blended (Core Animation's
//!   allowsGroupOpacity). The icon is its Text's backing store, resampled under the scale.
//!
//! Motion audit (expansion-provider.tsx, navigation-item.tsx, DetailScreenWrapper.tsx):
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | transitionOpacityProgress (tp) | tap: 0 then withTiming(1, 100) (inOut quad); expansion rest: withTiming(0, 300, in(ease)); back: withSequence(1 at once, withTiming(0, 700, in(ease))) | `Timing`, the same |
//! | springIconProgress (sp) | tap: withSpring(1, { mass 2.5, damping 18, stiffness 135 }); back: set 1, withSpring(0, same) | `Spring` |
//! | transitionProgress | tap: 0, withSpring(1, { mass 0.1, damping 24, stiffness 25 }) → on rest navigate + tp fade; back: set 1, withSpring(0, { mass 0.1, stiffness 42, damping 4 }) | `Spring` (ζ 7.6 run critically damped) |
//! | transitionScale | tap: 1; pan onChange: max(0.7, min(1, 1 − (max(0, ty) × 0.3 / 400)^1.2)); onEnd without trigger or |vy| < 300: withSpring(1, { mass 0.3, stiffness 46, damping 2 }) | `Spring` / set |
//! | trigger | ty > 300 → backTransition (haptic selection) + goBack | the same, the detail unmounted at once |
//! | item opacity | useDerivedValue: active ? 0.85 : id ≠ transitionId ? 1 : withTiming(tp > 0.9 ? 0 : 1, 300, bezier(0.19, 1, 0.22, 1)) (a re-run toward the same target continues) | per item `Timing` |
//! | tap | Gesture.Tap (maxDuration 500, no distance limit): onBegin active, onFinalize inactive, onEnd haptic selection + startTransition | `TapGesture`, failed at 500 ms while held |
//! | close | PressableOpacity (pressto: 250 ms, opacity 1 → 0.5), onPress: global haptic + backTransition | `pressto::Pressable` |
//!
//! Input: safeTop.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase, TapGesture};
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::{point, Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::gfx;

/// Ionicons (@expo/vector-icons) cut to "close", U+F24A.
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-close-subset.ttf");
const CLOSE: &str = "\u{F24A}";

/// METALLIC_APPS_DATA_RAW (apps-list/constants.ts): APPS_DATA's colours.
const APPS: [[u32; 3]; 24] = [
    [0xE8E9ED, 0xB8B9BD, 0xD1D2D6],
    [0xC8CBD0, 0x9A9DA2, 0xB4B7BC],
    [0xDEDEDE, 0xA8A8A8, 0xC6C6C6],
    [0xE8E8E8, 0xB8B8B8, 0xD0D0D0],
    [0x595C63, 0x2A2D33, 0x424548],
    [0xCCCCCC, 0x969696, 0xB1B1B1],
    [0xB4B7BC, 0x7F8287, 0x9A9DA2],
    [0xE2E2E2, 0xBABABA, 0xD5D5D5],
    [0xDEE3ED, 0xA5AAB3, 0xC2C7D0],
    [0x9B9B9E, 0x636366, 0x818184],
    [0x808080, 0xB8BBC0, 0xD6D9DD],
    [0xB3B5B1, 0x7D7F7B, 0x989A96],
    [0xD0D3D8, 0x9CA0A5, 0xB6B9BE],
    [0xDADADA, 0xA4A4A4, 0xBFBFBF],
    [0xD6D6D6, 0xA0A0A0, 0xBCBCBC],
    [0xCDD0D4, 0x959AA0, 0xB3B6BA],
    [0xC4C4C4, 0x8F8F8F, 0xABABAB],
    [0xCDCDCD, 0xB5B7BA, 0xCED0D3],
    [0xA6A9AD, 0x6D7074, 0x8C8F93],
    [0x97999C, 0x5F6164, 0x7D7F82],
    [0xC7CBD2, 0x939AA4, 0xADB1C7],
    [0xD2D2D2, 0xB4B6B8, 0xDCDDDF],
    [0xE6E6E8, 0xB0B0B3, 0xCBCBCE],
    [0xE2E5E8, 0xA1A4A7, 0xC9CCD0],
];

const SPACING: f32 = 8.0;
const COLUMNS: usize = 4;
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f32 = 56.0;
/// NavigationItem's config.borderRadius (app-item.tsx) and the expanded 50.
const RADIUS: f64 = 16.0;
const SCREEN_BG: u32 = 0xF2F2F2;
const LIST_BG: u32 = 0xFAFAFA;

const ICON_SPRING: SpringConfig = SpringConfig {
    mass: 2.5,
    damping: 18.0,
    stiffness: 135.0,
};
const OPEN_SPRING: SpringConfig = SpringConfig {
    mass: 0.1,
    damping: 24.0,
    stiffness: 25.0,
};
const BACK_SPRING: SpringConfig = SpringConfig {
    mass: 0.1,
    stiffness: 42.0,
    damping: 4.0,
};
const SCALE_SPRING: SpringConfig = SpringConfig {
    mass: 0.3,
    stiffness: 46.0,
    damping: 2.0,
};
const HAPTIC: &str = "haptic:selection";

fn ease_in() -> Easing {
    Easing::r#in(Easing::Ease)
}

/// Yoga's pixel rounding (half up).
fn round_px(v: f32, s: f32) -> f32 {
    (v * s + 0.5 + 1e-4).floor() / s
}
/// A Text's measured side: ceiled to the pixel after an epsilon.
fn ceil_px(v: f32, s: f32) -> f32 {
    ((v + 0.001) * s).ceil() / s
}
/// A Text's offset inside its parent: floored (textRounding).
fn floor_px(v: f32, s: f32) -> f32 {
    (v * s + 1e-4).floor() / s
}

/// The 24 gradient Views (the NavigationItems' frames), untransformed: x, y, w, h.
fn tiles(width: f32, safe_top: f32, s: f32) -> Vec<[f32; 4]> {
    let item = ((width - 2.0 * SPACING - SPACING * (COLUMNS - 1) as f32) / COLUMNS as f32).floor();
    let row_w = COLUMNS as f32 * item + SPACING * (COLUMNS - 1) as f32;
    let free = width - 2.0 * SPACING - row_w;
    let pad = SPACING + 6.0;
    let mut out = Vec::with_capacity(APPS.len());
    for (k, _) in APPS.iter().enumerate() {
        let (i, j) = ((k / COLUMNS) as f32, (k % COLUMNS) as f32);
        // Unrounded absolute edges, and the rounded relative positions summed.
        let row_y = safe_top + BUTTON_ROW + i * (item + SPACING);
        let item_x = free / 2.0 + j * (item + SPACING);
        let (ux, uy) = (SPACING + item_x + pad, row_y + pad);
        let x = round_px(SPACING, s) + round_px(item_x, s) + round_px(pad, s);
        let y = round_px(row_y, s) + round_px(pad, s);
        let side = item - 2.0 * pad;
        let w = round_px(ux + side, s) - round_px(ux, s);
        let h = round_px(uy + side, s) - round_px(uy, s);
        out.push([x, y, w, h]);
    }
    out
}

/// The list View's transform: [scale 1 − sp × 0.05, translateY sp × 5] about the centre (the
/// translation in the scaled space): its scale and translation.
fn home_matrix(sp: f64) -> (f32, f32) {
    ((1.0 - sp * 0.05) as f32, (sp * 5.0) as f32)
}

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Grid::new())
}

struct Grid {
    safe_top: f32,
    size: (f32, f32, f32),
    tp: Timing,
    sp: Spring,
    progress: Spring,
    scale: Spring,
    /// The spring to 1 calls onComplete when it rests.
    opening: bool,
    /// The measured NavigationItem (x, y, w, h) and its config colour.
    from: Option<([f32; 4], usize)>,
    transition_id: Option<usize>,
    active: [bool; 24],
    opacity: Vec<Timing>,
    /// The pushed AppDetail screen: its item.
    detail: Option<usize>,
    tap: TapGesture,
    /// The tap's finger, item and touch-down time.
    tapping: Option<(u32, usize, f64)>,
    pan: PanGesture,
    trigger: bool,
    close: Pressable,
    posted: Vec<String>,
    icon: Option<Font>,
    gpu: Option<Gpu>,
}

struct Gpu {
    pixels: (u32, u32, u32),
    /// The list (and its blur) or the close button's group, offscreen.
    under: Images,
    under_view: wgpu::TextureView,
    /// The close icon's Text backing store.
    sprite: Images,
    sprite_drawn: bool,
    blur: BackdropBlur,
    canvases: [Canvas; 3],
    renderers: [Renderer; 3],
    /// Which Images the main renderer samples: 0 none, 1 under, 2 sprite.
    main_images: u8,
    off_images: bool,
}

impl Grid {
    fn new() -> Grid {
        Grid {
            safe_top: 0.0,
            size: (0.0, 0.0, 3.0),
            tp: Timing::at(0.0),
            sp: Spring::at(0.0),
            progress: Spring::at(0.0),
            scale: Spring::at(1.0),
            opening: false,
            from: None,
            transition_id: None,
            active: [false; 24],
            opacity: vec![Timing::at(1.0); APPS.len()],
            detail: None,
            tap: TapGesture::default(),
            tapping: None,
            pan: PanGesture::new(),
            trigger: false,
            close: Pressable::new(),
            posted: Vec::new(),
            icon: Font::new(IONICONS, 24.0).map(Font::with_ui_layout),
            gpu: None,
        }
    }

    /// The overlay's frame (x, y, w, h, radius) and opacity.
    fn overlay(&self) -> Option<([f32; 5], f32)> {
        let (r, _) = self.from?;
        let (w, h, s) = self.size;
        let p = self.progress.value;
        let k = self.scale.value;
        let lerp = |a: f64, b: f64| interpolate(p, &[0.0, 1.0], &[a, b], Extrapolation::Extend);
        let ow = lerp(r[2] as f64, w as f64 * k) as f32;
        let oh = lerp(r[3] as f64, h as f64 * k) as f32;
        let tx = lerp(r[0] as f64, w as f64 * (1.0 - k) / 2.0) as f32;
        let ty = lerp(r[1] as f64, h as f64 * (1.0 - k) / 2.0) as f32;
        let radius = lerp(RADIUS, 50.0) as f32;
        Some((
            [
                tx,
                ty,
                round_px(ow.max(0.0), s),
                round_px(oh.max(0.0), s),
                radius,
            ],
            self.tp.value as f32,
        ))
    }

    /// The close button's frame in the detail's own space.
    fn button(&self) -> [f32; 4] {
        let (w, _, _) = self.size;
        [w - 16.0 - 44.0, self.safe_top + BUTTON_ROW, 44.0, 44.0]
    }

    /// A point of the window in the detail's own space (its scale about the centre).
    fn detail_local(&self, x: f32, y: f32) -> (f32, f32) {
        let (w, h, _) = self.size;
        let k = (self.scale.value as f32).max(1e-3);
        ((x - w / 2.0) / k + w / 2.0, (y - h / 2.0) / k + h / 2.0)
    }

    fn start_transition(&mut self, i: usize, tiles: &[[f32; 4]]) {
        self.from = Some((tiles[i], i));
        self.transition_id = Some(i);
        self.scale.set(1.0);
        self.tp.set(0.0);
        self.progress.set(0.0);
        self.tp.to(1.0, 100.0, Easing::timing_default());
        let v = self.sp.value;
        self.sp.set(v);
        self.sp.to(1.0, 0.0, ICON_SPRING);
        self.progress.to(1.0, 0.0, OPEN_SPRING);
        self.opening = true;
    }

    fn back_transition(&mut self) {
        self.posted.push(HAPTIC.into());
        self.tp.set(1.0);
        self.tp.to(0.0, 700.0, ease_in());
        self.opening = false;
        self.sp.set(1.0);
        self.progress.set(1.0);
        self.sp.to(0.0, 0.0, ICON_SPRING);
        self.progress.to(0.0, 0.0, BACK_SPRING);
        // goBack: the AppDetail screen (and its gestures) leave.
        self.detail = None;
        self.pan = PanGesture::new();
        self.trigger = false;
        self.close = Pressable::new();
    }

    /// One frame: the animations, the spring's completion, then the mappers.
    fn step(&mut self, now: f64) -> bool {
        if let Some((id, i, t0)) = self.tapping {
            if now - t0 > self.tap.max_duration_ms {
                self.tap.event(id, Phase::Cancel, 0.0, 0.0, now, false);
                self.active[i] = false;
                self.tapping = None;
            }
        }
        let mut moving = self.tp.step(now);
        moving |= self.sp.step(now);
        moving |= self.scale.step(now);
        let was = self.progress.running;
        moving |= self.progress.step(now);
        if was && !self.progress.running && self.opening {
            self.opening = false;
            // onComplete: navigate to AppDetail; the square fades over it.
            self.detail = self.transition_id;
            self.tp.to(0.0, 300.0, ease_in());
            moving = true;
        }
        for t in &mut self.opacity {
            moving |= t.step(now);
        }
        for (i, t) in self.opacity.iter_mut().enumerate() {
            if self.active[i] {
                t.set(0.85);
            } else if self.transition_id != Some(i) {
                t.set(1.0);
            } else {
                let to = if self.tp.value > 0.9 { 0.0 } else { 1.0 };
                let same = if t.running {
                    t.target() == to
                } else {
                    t.value == to
                };
                if !same {
                    t.to(to, 300.0, Easing::bezier(0.19, 1.0, 0.22, 1.0));
                    moving = true;
                }
            }
        }
        moving |= self.close.step(now);
        moving || self.tapping.is_some() || self.pan.tracking()
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64) {
        let (w, h, s) = self.size;
        if w <= 0.0 {
            return;
        }
        if phase == Phase::Down {
            // The expansion View takes the touches over its frame while it shows.
            if let Some((o, a)) = self.overlay() {
                if a >= 0.01 && x >= o[0] && x <= o[0] + o[2] && y >= o[1] && y <= o[1] + o[3] {
                    return;
                }
            }
        }
        if self.detail.is_some() {
            let (lx, ly) = self.detail_local(x, y);
            let b = self.button();
            let inside = lx >= b[0] - 10.0
                && lx <= b[0] + b[2] + 10.0
                && ly >= b[1] - 10.0
                && ly <= b[1] + b[3] + 10.0;
            if phase == Phase::Down {
                self.close.pointer_down(id, inside);
            }
            match self.pan.event(id, phase, x, y, at_ms, true) {
                Event::Start(p) | Event::Update(p) => {
                    if self.close.finger() == Some(id) {
                        self.close.cancel();
                    }
                    let ty = p.translation_y.max(0.0) as f64;
                    let resistance = ty * 0.3;
                    let k = (1.0 - (resistance / 400.0).powf(1.2)).min(1.0).max(0.7);
                    self.scale.set(k);
                    if ty > 300.0 && !self.trigger {
                        self.trigger = true;
                        self.back_transition();
                        return;
                    }
                }
                Event::End(p) => {
                    if !self.trigger || p.velocity_y.abs() < 300.0 {
                        self.trigger = false;
                        self.scale.to(1.0, 0.0, SCALE_SPRING);
                    }
                }
                _ => {}
            }
            if phase != Phase::Down {
                if let Some(PressEvent::Press(press)) = self.close.pointer(id, phase, inside) {
                    if let Some(m) = press.global_message() {
                        self.posted.push(m.into());
                    }
                    self.back_transition();
                }
            }
            return;
        }
        let tiles = tiles(w, self.safe_top, s);
        let (k, t) = home_matrix(self.sp.value);
        let (cx, cy) = (w / 2.0, h / 2.0);
        let (lx, ly) = ((x - cx) / k + cx, (y - cy) / k + cy - t);
        let hit = tiles
            .iter()
            .position(|r| lx >= r[0] && lx <= r[0] + r[2] && ly >= r[1] && ly <= r[1] + r[3]);
        let claim = phase == Phase::Down && hit.is_some() && self.tapping.is_none();
        match self.tap.event(id, phase, x, y, at_ms, claim) {
            Event::Begin { .. } => {
                let i = hit.unwrap();
                self.tapping = Some((id, i, at_ms));
                self.active[i] = true;
            }
            Event::Tap { .. } => {
                if let Some((_, i, _)) = self.tapping.take() {
                    self.active[i] = false;
                    self.posted.push(HAPTIC.into());
                    self.start_transition(i, &tiles);
                }
            }
            Event::Fail => {
                if let Some((_, i, _)) = self.tapping.take() {
                    self.active[i] = false;
                }
            }
            _ => {}
        }
    }

    /// The list: #fafafa and the 24 squares, under its transform.
    fn record_home(&self, c: &mut Canvas) {
        let (w, h, s) = self.size;
        let (k, t) = home_matrix(self.sp.value);
        c.save();
        c.translate(w / 2.0, h / 2.0);
        c.scale(k, k);
        c.translate(-w / 2.0, -h / 2.0 + t);
        c.draw_rect(0.0, 0.0, w, h, &Paint::fill(Color::view_hex(LIST_BG)));
        for (i, r) in tiles(w, self.safe_top, s).iter().enumerate() {
            let a = self.opacity[i].value as f32;
            if a <= 0.0 {
                continue;
            }
            c.draw_continuous_rrect(
                r[0],
                r[1],
                r[2],
                r[3],
                RADIUS as f32,
                &Paint::fill(Color::view_hex(APPS[i][0])).with_opacity(a),
            );
        }
        c.restore();
    }

    /// The close icon's Text box in the button: x, y, w, h.
    fn icon_box(&self) -> Option<[f32; 4]> {
        let font = self.icon.as_ref()?;
        let s = self.size.2;
        let tw = ceil_px(font.advance_width(CLOSE), s);
        let th = ceil_px(gfx::line_height(font), s);
        Some([
            floor_px((44.0 - tw) / 2.0, s),
            floor_px((44.0 - th) / 2.0, s),
            tw,
            th,
        ])
    }

    /// The close button (shadow, circle, icon sprite) in the detail's space.
    fn record_button(&self, c: &mut Canvas, sprite: &Images) {
        let b = self.button();
        let (cx, cy) = (b[0] + 22.0, b[1] + 22.0);
        c.save();
        c.clip_with(|p| {
            // The circle (Skia's conics, clockwise) less nothing: a rect wound the other way
            // around it, so only the ring outside the button is drawn (nonzero).
            let (x0, y0, x1, y1) = (b[0] - 40.0, b[1] - 40.0, b[0] + 84.0, b[1] + 84.0);
            p.begin(point(x0, y0));
            p.line_to(point(x0, y1));
            p.line_to(point(x1, y1));
            p.line_to(point(x1, y0));
            p.end(true);
            skia::add_circle(p, cx, cy, 22.0);
        });
        c.draw_rrect_shadow_local(b[0], b[1], 44.0, 44.0, 22.0, 5.0, Color::BLACK.alpha(0.05));
        c.restore();
        c.draw_circle(cx, cy, 22.0, &Paint::fill(Color::WHITE.alpha(0.8)));
        if let Some(r) = self.icon_box() {
            let (x, y) = (b[0] + r[0], b[1] + r[1]);
            let s = self.size.2;
            let to_image = Matrix::translate(-x, -y).then(Matrix::scale(s, s));
            c.draw_rect(x, y, r[2], r[3], &Paint::image(sprite.image(0), to_image));
        }
    }

    /// The detail's transform (its scale about the centre).
    fn detail_transform(&self, c: &mut Canvas) {
        let (w, h, _) = self.size;
        let k = self.scale.value as f32;
        c.translate(w / 2.0, h / 2.0);
        c.scale(k, k);
        c.translate(-w / 2.0, -h / 2.0);
    }
}

impl Surface for Grid {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        self.pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"detail\":{},\"transitionId\":{},\"progress\":{:.4},\"icon\":{:.4},\"opacity\":{:.4},\"scale\":{:.4},\"held\":{}}}",
            self.detail.map_or(-1, |i| i as i64),
            self.transition_id.map_or(-1, |i| i as i64),
            self.progress.value,
            self.sp.value,
            self.tp.value,
            self.scale.value,
            self.tapping.is_some() || self.pan.tracking()
        ))
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
        let (w, h) = (frame.width, frame.height);
        let (pw, ph) = frame.pixels();
        self.size = (w, h, s);
        let moving = self.step(frame.now_ms);
        let icon_box = self.icon_box().unwrap_or([0.0, 0.0, 1.0, 1.0]);
        let key = (pw, ph, s.to_bits());
        if self.gpu.as_ref().map(|g| g.pixels) != Some(key) {
            let under = Images::target(device, pw, ph);
            let under_view = under.render_view();
            let sprite = Images::target(
                device,
                (icon_box[2] * s).round() as u32,
                (icon_box[3] * s).round() as u32,
            );
            self.gpu = Some(Gpu {
                pixels: key,
                under,
                under_view,
                sprite,
                sprite_drawn: false,
                blur: BackdropBlur::default(),
                canvases: Default::default(),
                renderers: Default::default(),
                main_images: 0,
                off_images: false,
            });
        }
        let mut gpu = self.gpu.take().unwrap();
        let fmt = wgpu::TextureFormat::Rgba8Unorm;
        if !gpu.sprite_drawn {
            if let Some(font) = self.icon.as_ref() {
                let c = &mut gpu.canvases[2];
                c.begin(s);
                c.draw_text(
                    CLOSE,
                    0.0,
                    gfx::baseline(font, 0.0),
                    font,
                    &Paint::fill(Color::BLACK.alpha(0.7)),
                );
                let (sw, sh) = (
                    gpu.sprite.image(0).width as u32,
                    gpu.sprite.image(0).height as u32,
                );
                gpu.renderers[2].draw(
                    device,
                    queue,
                    encoder,
                    &gpu.canvases[2],
                    &gpu.sprite.render_view(),
                    fmt,
                    sw,
                    sh,
                    wgpu::Color::TRANSPARENT,
                );
            }
            gpu.sprite_drawn = true;
        }
        if !gpu.off_images {
            gpu.renderers[1].set_images(&gpu.sprite);
            gpu.off_images = true;
        }
        let [main, off, _] = &mut gpu.canvases;
        main.begin(s);
        main.fill(Color::view_hex(SCREEN_BG));
        let mut want = 0u8;
        if let Some(item) = self.detail {
            let colors = APPS[item];
            let radius = interpolate(
                self.scale.value,
                &[1.0, 0.8],
                &[50.0, 30.0],
                Extrapolation::Extend,
            ) as f32;
            main.save();
            self.detail_transform(main);
            main.clip_continuous_rrect(0.0, 0.0, w, h, radius);
            let stops = skia::stops(&colors.map(Color::hex));
            main.draw_rect(
                0.0,
                0.0,
                w,
                h,
                &Paint::shader(Shader::Linear {
                    start: point(0.0, 0.0),
                    end: point(w, h),
                    stops,
                }),
            );
            let a = self.close.opacity() as f32;
            if a >= 1.0 {
                self.record_button(main, &gpu.sprite);
                want = 2;
                main.restore();
            } else {
                main.restore();
                // Group opacity: the button drawn whole offscreen (device space), then blended.
                off.begin(s);
                off.save();
                self.detail_transform(off);
                self.record_button(off, &gpu.sprite);
                off.restore();
                gpu.renderers[1].draw(
                    device,
                    queue,
                    encoder,
                    off,
                    &gpu.under_view,
                    fmt,
                    pw,
                    ph,
                    wgpu::Color::TRANSPARENT,
                );
                let k = self.scale.value as f32;
                let b = self.button();
                let (x0, y0) = (
                    (b[0] - 20.0 - w / 2.0) * k + w / 2.0,
                    (b[1] - 20.0 - h / 2.0) * k + h / 2.0,
                );
                let side = 84.0 * k;
                let (x0, y0) = (floor_px(x0, s).max(0.0), floor_px(y0, s).max(0.0));
                let (x1, y1) = ((x0 + side + 2.0 / s).min(w), (y0 + side + 2.0 / s).min(h));
                main.draw_rect(
                    x0,
                    y0,
                    x1 - x0,
                    y1 - y0,
                    &Paint::shader(Shader::ImageNearest {
                        image: gpu.under.image(0),
                        to_image: Matrix::scale(s, s),
                        subset: [0.0, 0.0, pw as f32, ph as f32],
                    })
                    .with_opacity(a),
                );
                want = 1;
            }
        } else {
            let intensity = self.sp.value * 50.0;
            if self.sp.value != 0.0 && intensity > 0.0 {
                off.begin(s);
                off.fill(Color::view_hex(SCREEN_BG));
                self.record_home(off);
                gpu.renderers[1].draw(
                    device,
                    queue,
                    encoder,
                    off,
                    &gpu.under_view,
                    fmt,
                    pw,
                    ph,
                    wgpu::Color::TRANSPARENT,
                );
                let params = Material::Light.chain().at(expo_fraction(intensity));
                gpu.blur.run(
                    device,
                    queue,
                    encoder,
                    &gpu.under_view,
                    [0, 0, pw as i32, ph as i32],
                    [0.0, 0.0],
                    &params,
                    s,
                );
                gpu.blur.draw(
                    device,
                    queue,
                    encoder,
                    &gpu.under_view,
                    fmt,
                    [0.0, 0.0],
                    [0, 0],
                    [pw, ph],
                );
                main.draw_rect(
                    0.0,
                    0.0,
                    w,
                    h,
                    &Paint::shader(Shader::ImageNearest {
                        image: gpu.under.image(0),
                        to_image: Matrix::scale(s, s),
                        subset: [0.0, 0.0, pw as f32, ph as f32],
                    }),
                );
                want = 1;
            } else {
                self.record_home(main);
            }
        }
        // The expansion View, over everything: its shadow cut out of the box, both at its opacity.
        if let Some((o, a)) = self.overlay() {
            if a > 0.0 && o[2] > 0.0 && o[3] > 0.0 {
                let (_, i) = self.from.unwrap();
                main.save();
                main.opacity(a);
                main.save();
                let e = 40.0;
                main.clip_with(|p| {
                    skia::add_rect(p, o[0] - e, o[1] - e, o[2] + 2.0 * e, o[3] + 2.0 * e);
                    skia::add_continuous_rrect_hole(p, o[0], o[1], o[2], o[3], o[4]);
                });
                main.draw_rrect_shadow(o[0], o[1], o[2], o[3], o[4], 10.0, Color::BLACK.alpha(0.2));
                main.restore();
                main.draw_continuous_rrect(
                    o[0],
                    o[1],
                    o[2],
                    o[3],
                    o[4],
                    &Paint::fill(Color::view_hex(APPS[i][1])),
                );
                main.restore();
            }
        }
        if want != 0 && want != gpu.main_images {
            match want {
                1 => gpu.renderers[0].set_images(&gpu.under),
                _ => gpu.renderers[0].set_images(&gpu.sprite),
            }
            gpu.main_images = want;
        }
        gpu.renderers[0].draw(
            device,
            queue,
            encoder,
            &gpu.canvases[0],
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        self.gpu = Some(gpu);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        }
    }

    fn grid() -> Grid {
        let mut g = Grid::new();
        g.bind(&[Value::Number(68.0)], None).unwrap();
        g.size = (W, H, 3.0);
        g
    }

    fn run(g: &mut Grid, from: f64, to: f64) -> f64 {
        let mut t = from;
        while t < to {
            g.step(t);
            t += 1000.0 / 60.0;
        }
        t
    }

    #[test]
    fn the_grid_is_rns() {
        let t = tiles(W, 68.0, 3.0);
        // itemSize floor((420 - 16 - 24) / 4) = 95; the square 95 - 28 = 67 at 8 + 14.
        assert_eq!(t[0], [22.0, 68.0 + 56.0 + 14.0, 67.0, 67.0]);
        assert_eq!(t[5], [22.0 + 103.0, 138.0 + 103.0, 67.0, 67.0]);
        assert_eq!(t.len(), 24);
    }

    #[test]
    fn a_tap_expands_then_pushes_the_detail_and_the_close_brings_it_back() {
        let mut g = grid();
        let r = tiles(W, 68.0, 3.0)[5];
        let (x, y) = (r[0] + 30.0, r[1] + 30.0);
        g.input(&pointer(PointerPhase::Down, x, y, 0.0));
        assert!(g.active[5]);
        g.step(10.0);
        assert_eq!(g.opacity[5].value, 0.85);
        g.input(&pointer(PointerPhase::Up, x, y, 80.0));
        assert_eq!(g.messages(), vec![HAPTIC.to_string()]);
        assert_eq!(g.transition_id, Some(5));
        let t = run(&mut g, 100.0, 300.0);
        assert!(g.detail.is_none() && g.progress.value > 0.3);
        // The tapped square hides under the opaque expansion.
        let t = run(&mut g, t, 4000.0);
        assert_eq!(g.detail, Some(5));
        assert_eq!(g.tp.value, 0.0);
        // The close button: a press inside, the lift inside.
        let b = g.button();
        let (bx, by) = (b[0] + 22.0, b[1] + 22.0);
        g.input(&pointer(PointerPhase::Down, bx, by, t));
        g.input(&pointer(PointerPhase::Up, bx, by, t + 60.0));
        assert_eq!(g.messages(), vec![HAPTIC.to_string(), HAPTIC.to_string()]);
        assert!(g.detail.is_none());
        assert_eq!(g.tp.value, 1.0);
        run(&mut g, t + 70.0, t + 3000.0);
        assert!(g.progress.value.abs() < 1e-3 && g.sp.value.abs() < 1e-3);
        assert_eq!(g.opacity[5].value, 1.0);
    }

    #[test]
    fn a_drag_down_shrinks_the_detail_and_past_300_goes_back() {
        let mut g = grid();
        g.from = Some((tiles(W, 68.0, 3.0)[0], 0));
        g.transition_id = Some(0);
        g.detail = Some(0);
        g.progress.set(1.0);
        g.sp.set(1.0);
        g.input(&pointer(PointerPhase::Down, 200.0, 400.0, 0.0));
        g.input(&pointer(PointerPhase::Move, 200.0, 500.0, 200.0));
        // 90 pt past the 10 pt hysteresis: 1 - (27 / 400)^1.2.
        let want = 1.0 - (90.0f64 * 0.3 / 400.0).powf(1.2);
        assert!((g.scale.value - want).abs() < 1e-6, "{}", g.scale.value);
        g.input(&pointer(PointerPhase::Up, 200.0, 500.0, 300.0));
        assert!(g.scale.running);
        let t = run(&mut g, 310.0, 4000.0);
        assert!((g.scale.value - 1.0).abs() < 1e-3);
        g.input(&pointer(PointerPhase::Down, 200.0, 300.0, t));
        g.input(&pointer(PointerPhase::Move, 200.0, 500.0, t + 200.0));
        assert!(g.detail.is_some());
        g.input(&pointer(PointerPhase::Move, 200.0, 620.0, t + 300.0));
        assert!(g.detail.is_none());
        assert_eq!(g.messages(), vec![HAPTIC.to_string()]);
        // The expansion starts from the shrunk screen.
        let k = g.scale.value;
        assert!(k < 0.85);
        let (o, a) = g.overlay().unwrap();
        assert_eq!(a, 1.0);
        assert!((o[2] - round_px(W * k as f32, 3.0)).abs() < 1e-3);
    }

    #[test]
    fn it_draws_the_grid_the_blur_and_the_detail() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let frame = |now_ms| Frame {
            width: W,
            height: H,
            scale: 2.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0)], None).unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("ios-home-grid-rest");
        // The first square's centre: #E8E9ED; the list around it #fafafa.
        let p = rest.at(2 * 55, 2 * 171);
        assert!(
            p[0].abs_diff(0xE8) <= 2 && p[2].abs_diff(0xED) <= 2,
            "{p:?}"
        );
        assert_eq!(rest.at(2 * 10, 2 * 171)[..3], [0xFA, 0xFA, 0xFA]);
        s.input(&pointer(PointerPhase::Down, 55.0, 171.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 55.0, 171.0, 50.0));
        let mut t = 60.0;
        let mut mid = None;
        loop {
            let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
            if (t - 260.0).abs() < 9.0 {
                img.save("ios-home-grid-expanding");
                mid = Some(img);
                t += 1000.0 / 60.0;
                continue;
            }
            if !moving || t > 6000.0 {
                img.save("ios-home-grid-detail");
                // The gradient at (60, 60): t = 60 (W + H) / (W² + H²) on the (0, 0) → (W, H)
                // axis, between #E8E9ED and #B8B9BD (stops 0, 0.5).
                let t = 60.0 * (W + H) / (W * W + H * H);
                let want = (232.0 - 48.0 * 2.0 * t).round() as u8;
                let p = img.at(2 * 60, 2 * 60);
                assert!(p[0].abs_diff(want) <= 1, "{p:?} {want}");
                break;
            }
            t += 1000.0 / 60.0;
        }
        // Mid-expansion the list is blurred: no hard edge between two squares' gap.
        let mid = mid.unwrap();
        assert!(mid.at(2 * 300, 2 * 600)[0] < 0xFA);
    }
}
