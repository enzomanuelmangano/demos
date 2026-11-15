//! Draggable Panel (src/animations/draggable-panel: index.tsx, components/draggable-panel/
//! draggable-control-panel.tsx + utils/animation-helpers.ts, components/spring-animation-panel/
//! index.tsx, collapsed-button.tsx, panel-content.tsx, utils/spring-configs.ts): a white panel
//! ("Spring Animations", a close button and three spring choices) that a pan throws to the
//! nearest screen corner on the chosen spring; the close shrinks it into a 64 pt settings button
//! that a press grows back. The whole screen (#f5f7fa) is this surface.
//!
//! - The panel (DraggableControlPanel): `controls` absolute, translated by (translateX,
//!   translateY), starting at (W − 280 − 30, H − 150 − 100) (useInitialPanelPosition). In it
//!   `controlPanel`: expanded 280 × 150 / collapsed 64 × 64, white, overflow hidden (Core
//!   Animation's masksToBounds on a circular cornerRadius, no borderCurve), boxShadow 0 0 24
//!   rgba(0, 0, 0, 0.05) (RCTBoxShadow: σ 12, outside the view only), content centred.
//!   borderRadius = interpolate(progress, [0, 1], [32, 16]), progress = withSpring(isCollapsed ?
//!   0 : 1, { dampingRatio: 1, duration: 500 }) (a mapper: from where it is, its velocity kept);
//!   Core Animation draws min(r, w / 2, h / 2).
//! - Its size: `layout={LinearTransition.springify().mass(0.3).damping(20).stiffness(250)}`:
//!   width and height spring from the current frame (ζ 1.15: Reanimated runs it critically
//!   damped); its origin in `controls` stays 0. The children are laid out at the final size at
//!   once (Yoga), the masksToBounds clip follows the animated frame.
//! - The content swaps by key: entering FadeIn (150 ms collapsed, 180 ms expanded), exiting
//!   FadeOut 100 ms (from 1, Reanimated's initialValues), both withTiming's default
//!   inOut(quad); an exiting view keeps its last layout and props (its press scale and colours
//!   freeze). UIKit's group opacity (allowsGroupOpacity): each content view fades as one layer.
//! - Pan (RNGH `Gesture.Pan()`, the GestureDetector on `controls`): onBegin (touch-down) keeps
//!   start = translate (a running spring goes on); onChange translate = start + translation;
//!   onEnd: snapToCorner(translate, size, W, H, safeTop + 56, velocity) projected by velocity ×
//!   0.15, the nearest of the four corners (margin 30, top safeTop + DEMO_BUTTON_ROW_HEIGHT,
//!   bottom 100) by the panel centres, then withSpring({ …config, velocity }) per axis.
//! - toggleCollapse: snapToCorner of the panel centred at its old centre in the new size, both
//!   axes withSpring(config) (the running velocity kept, Reanimated's onStart).
//! - springConfig (spring-configs.ts): elegant { damping 30, stiffness 200, mass 0.7 } (ζ 1.27:
//!   critically damped), springy { 18, 150, 1 }, super-springy { 15, 120, 1.4 }.
//! - PanelContent (Yoga, from the panel's 280 × 150): a column, paddingHorizontal 22, centred:
//!   header row (title Honk-Regular 16 '600' — HonkSans-Medium, its one face — #343a40, flex 1;
//!   close PressableScale padding 4 with Ionicons close 20 #6c757d), marginBottom 18; the
//!   options row, gap 8, three flex-1 PressableScale cards (borderRadius 10 continuous,
//!   paddingHorizontal 8, paddingVertical 12, centred): a 12 pt indicator row of three 8 pt
//!   dots (gap 2, marginBottom 8), then the label (Honk 13, marginBottom 4). A card's
//!   background (#fff → its _BG) and label (#495057 → its colour) are interpolateColor of
//!   withTiming(isActive, 200 ms linear); its borderColor animates too but it has no
//!   borderWidth. Elegant's dots fade (1, 0.6, 0.3), Springy's (1, 0.8, 0.6) and Super's
//!   (1, 1.2, 0.8) scale.
//! - CollapsedButton: a 64 × 64 PressableScale, Ionicons settings-sharp 24 #343a40 centred.
//! - Text: each RN `<Text>` is its own Core Animation backing store (UIKit layout,
//!   `with_ui_layout`), drawn once in a sprite atlas at the pixel grid and resampled
//!   bilinearly under the panel's translate and the press scales, as Core Animation does.
//!   Yoga: a Text's measured side ceiled after an epsilon, its offset floored; views rounded
//!   relative to their parent. RN's view colours are Display P3 (`Color::view_hex`).
//! - Presses (pressto, the app's global onPress posts `haptic:selection`): the pan's
//!   activation cancels a held press (RNGH: the pan takes the touch).
//! - Haptics past RN (which plays only the presses'; the owner's haptic language):
//!   one `haptic:impact-light` when the pan takes the panel (its activation, so a tap plays
//!   none). Nothing when the thrown panel lands in its corner.
//!
//! Inputs: safeTop.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use pressto::{PressEvent, Pressable};
use reanimated::{
    interpolate, interpolate_color, Easing, Extrapolation, Spring, SpringConfig, Timing,
};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::gfx;

static HONK: &[u8] = include_bytes!("../fonts/honk-regular-draggable-panel-subset.otf");
/// Ionicons (@expo/vector-icons) cut to close (U+F24A) and settings-sharp (U+F56D).
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-draggable-panel-subset.ttf");
const CLOSE: &str = "\u{F24A}";
const SETTINGS: &str = "\u{F56D}";

/// DraggableControlPanel's defaults.
const COLLAPSED: (f32, f32) = (64.0, 64.0);
const EXPANDED: (f32, f32) = (280.0, 150.0);
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f32 = 56.0;
/// animation-helpers.ts.
const VELOCITY_FACTOR: f32 = 0.15;
const MARGIN: f32 = 30.0;
const BOTTOM_MARGIN: f32 = 100.0;
const LAYOUT_SPRING: SpringConfig = SpringConfig {
    stiffness: 250.0,
    damping: 20.0,
    mass: 0.3,
};
const SHADOW_SIGMA: f32 = 12.0;
const BACKGROUND: u32 = 0xF5F7FA;
const TITLE_COLOR: u32 = 0x343A40;
const CLOSE_COLOR: u32 = 0x6C757D;
const DEFAULT_TEXT: u32 = 0x495057;

/// One spring option (panel-content.tsx springOptions + springConfigs, spring-configs.ts).
struct SpringOption {
    label: &'static str,
    color: u32,
    bg: u32,
    /// The dots' (opacity, scale).
    dots: [(f32, f32); 3],
    spring: SpringConfig,
}

const OPTIONS: [SpringOption; 3] = [
    SpringOption {
        label: "Elegant",
        color: 0x6F42C1,
        bg: 0xF8F4FF,
        dots: [(1.0, 1.0), (0.6, 1.0), (0.3, 1.0)],
        spring: SpringConfig {
            stiffness: 200.0,
            damping: 30.0,
            mass: 0.7,
        },
    },
    SpringOption {
        label: "Springy",
        color: 0xFD7E14,
        bg: 0xFFF8F0,
        dots: [(1.0, 1.0), (1.0, 0.8), (1.0, 0.6)],
        spring: SpringConfig {
            stiffness: 150.0,
            damping: 18.0,
            mass: 1.0,
        },
    },
    SpringOption {
        label: "Super",
        color: 0xDC3545,
        bg: 0xFFF5F5,
        dots: [(1.0, 1.0), (1.0, 1.2), (1.0, 0.8)],
        spring: SpringConfig {
            stiffness: 120.0,
            damping: 15.0,
            mass: 1.4,
        },
    },
];

fn rgba(rgb: u32) -> [f64; 4] {
    [
        ((rgb >> 16) & 0xFF) as f64,
        ((rgb >> 8) & 0xFF) as f64,
        (rgb & 0xFF) as f64,
        1.0,
    ]
}

/// An interpolated RN view colour (P3 components) as the sRGB colour it shows.
fn view(c: [f64; 4]) -> Color {
    let p = |v: f64| v.round().clamp(0.0, 255.0) as u32;
    Color::view_hex((p(c[0]) << 16) | (p(c[1]) << 8) | p(c[2])).alpha(c[3] as f32)
}

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

/// snapToCorner (animation-helpers.ts): the corner nearest the velocity-projected panel.
#[allow(clippy::too_many_arguments)]
pub fn snap_to_corner(
    x: f32,
    y: f32,
    pw: f32,
    ph: f32,
    sw: f32,
    sh: f32,
    top: f32,
    vx: f32,
    vy: f32,
) -> (f32, f32) {
    let (px, py) = (x + vx * VELOCITY_FACTOR, y + vy * VELOCITY_FACTOR);
    let (cx, cy) = (px + pw / 2.0, py + ph / 2.0);
    let corners = [
        (MARGIN, top),
        (sw - pw - MARGIN, top),
        (MARGIN, sh - ph - BOTTOM_MARGIN),
        (sw - pw - MARGIN, sh - ph - BOTTOM_MARGIN),
    ];
    let mut best = (corners[0], f32::INFINITY);
    for c in corners {
        let d = ((cx - (c.0 + pw / 2.0)).powi(2) + (cy - (c.1 + ph / 2.0)).powi(2)).sqrt();
        if d < best.1 {
            best = (c, d);
        }
    }
    best.0
}

/// A Text box: x, y, w, h in its content's space (the wrapper's), and its sprite.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct TextBox {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    sprite: usize,
}

/// The content's layout (Yoga at the device scale), in the panel's space.
#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    /// The expanded wrapper's top in the panel.
    top: f32,
    title: TextBox,
    /// The close PressableScale: x, y, w, h.
    close: [f32; 4],
    close_icon: TextBox,
    /// Each option card: x, y, w, h.
    cards: [[f32; 4]; 3],
    /// Each label, in its card.
    labels: [TextBox; 3],
    /// The indicator row's left and top, in a card.
    dots: (f32, f32),
    settings_icon: TextBox,
}

/// Sprites in the atlas: title, close, settings, then two slots of three labels.
const SPRITES: usize = 9;

struct Fonts {
    title: Font,
    label: Font,
    close: Font,
    settings: Font,
}

/// One keyed content view: the collapsed button or the expanded PanelContent.
#[derive(Clone, Debug)]
struct Content {
    collapsed: bool,
    /// Its FadeIn / FadeOut.
    fade: Timing,
    exiting: bool,
    /// collapsed: [the button]; expanded: [close, three options].
    presses: Vec<Pressable>,
    /// The options' isActive timings (expanded).
    active: [Timing; 3],
    /// Which label sprites it draws with (expanded): 0 or 1.
    slot: usize,
}

impl Content {
    fn new(collapsed: bool, spring_type: usize, slot: usize) -> Content {
        let mut fade = Timing::at(0.0);
        fade.to(
            1.0,
            if collapsed { 150.0 } else { 180.0 },
            Easing::timing_default(),
        );
        let n = if collapsed { 1 } else { 4 };
        Content {
            collapsed,
            fade,
            exiting: false,
            presses: (0..n).map(|_| Pressable::new()).collect(),
            // useDerivedValue's first run: the target at once.
            active: [0, 1, 2].map(|i| Timing::at(if i == spring_type { 1.0 } else { 0.0 })),
            slot,
        }
    }

    fn exit(&mut self) {
        self.exiting = true;
        for p in &mut self.presses {
            p.cancel();
        }
        self.fade = Timing::at(1.0);
        self.fade.to(0.0, 100.0, Easing::timing_default());
    }

    fn done(&self) -> bool {
        self.exiting && !self.fade.running
    }
}

struct Gpu {
    key: (u32, u32, u32),
    atlas: Images,
    layers: Images,
    layer_px: (u32, u32),
    atlas_canvas: Canvas,
    atlas_renderer: Renderer,
    group: Vec<(Canvas, Renderer, bool)>,
    main: Canvas,
    renderer: Renderer,
    main_bound: bool,
    /// The label colours the atlas holds per slot, None until drawn.
    drawn: Option<[[u32; 3]; 2]>,
}

/// The most content views at once (an exiting, an entering, one more exiting).
const LAYERS: usize = 3;

struct Panel {
    safe_top: f32,
    size: (f32, f32, f32),
    fonts: Option<Fonts>,
    tx: Spring,
    ty: Spring,
    width: Spring,
    height: Spring,
    progress: Spring,
    collapsed: bool,
    spring_type: usize,
    placed: bool,
    pan: PanGesture,
    start: (f32, f32),
    /// The finger and the pressable it went down on (content index, press index).
    press: Option<(u32, usize, usize)>,
    contents: Vec<Content>,
    posted: Vec<String>,
    now: f64,
    gpu: Option<Gpu>,
}

/// The panel's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Panel::new())
}

impl Panel {
    fn new() -> Panel {
        let fonts = (|| {
            Some(Fonts {
                title: Font::new(HONK, 16.0)?.with_ui_layout(),
                label: Font::new(HONK, 13.0)?.with_ui_layout(),
                close: Font::new(IONICONS, 20.0)?.with_ui_layout(),
                settings: Font::new(IONICONS, 24.0)?.with_ui_layout(),
            })
        })();
        let mut first = Content::new(false, 0, 0);
        first.fade = Timing::at(1.0); // mounted with the screen: no entering on the first render
        Panel {
            safe_top: 0.0,
            size: (0.0, 0.0, 3.0),
            fonts,
            tx: Spring::at(0.0),
            ty: Spring::at(0.0),
            width: Spring::at(EXPANDED.0 as f64),
            height: Spring::at(EXPANDED.1 as f64),
            progress: Spring::at(1.0),
            collapsed: false,
            spring_type: 0,
            placed: false,
            pan: PanGesture::new(),
            start: (0.0, 0.0),
            press: None,
            contents: vec![first],
            posted: Vec::new(),
            now: 0.0,
            gpu: None,
        }
    }

    fn top_margin(&self) -> f32 {
        self.safe_top + BUTTON_ROW
    }

    fn final_size(&self) -> (f32, f32) {
        if self.collapsed {
            COLLAPSED
        } else {
            EXPANDED
        }
    }

    fn place(&mut self, w: f32, h: f32) {
        if !self.placed && w > 0.0 {
            self.placed = true;
            self.tx.set((w - EXPANDED.0 - MARGIN) as f64);
            self.ty.set((h - EXPANDED.1 - BOTTOM_MARGIN) as f64);
        }
    }

    fn layout(&self) -> Option<Layout> {
        let f = self.fonts.as_ref()?;
        let s = self.size.2;
        let line = |font: &Font| ceil_px(gfx::line_height(font), s);
        // The close button: padding 4 around the icon's Text.
        let (iw, ih) = (ceil_px(f.close.advance_width(CLOSE), s), line(&f.close));
        let (cw, ch) = (iw + 8.0, ih + 8.0);
        let inner = EXPANDED.0 - 44.0;
        let th = line(&f.title);
        let hh = th.max(ch);
        let title = TextBox {
            x: 22.0,
            y: floor_px((hh - th) / 2.0, s),
            w: inner - cw,
            h: th,
            sprite: 0,
        };
        let close = [22.0 + inner - cw, round_px((hh - ch) / 2.0, s), cw, ch];
        let close_icon = TextBox {
            x: 4.0,
            y: 4.0,
            w: iw,
            h: ih,
            sprite: 1,
        };
        // The options: (236 − 2 × 8) / 3 each, from the header's bottom + 18.
        let lh = line(&f.label);
        let card_h = 12.0 + 12.0 + 8.0 + lh + 4.0 + 12.0;
        let card_w = (inner - 16.0) / 3.0;
        let row_y = round_px(hh + 18.0, s);
        let mut cards = [[0.0; 4]; 3];
        let mut labels = [TextBox::default(); 3];
        for (i, o) in OPTIONS.iter().enumerate() {
            let x = 22.0 + round_px(i as f32 * (card_w + 8.0), s);
            cards[i] = [x, row_y, round_px(x + card_w, s) - x, card_h];
            let tw = ceil_px(f.label.advance_width(o.label), s);
            labels[i] = TextBox {
                x: floor_px(8.0 + (card_w - 16.0 - tw) / 2.0, s),
                y: 32.0,
                w: tw,
                h: lh,
                sprite: 3 + i,
            };
        }
        let total = hh + 18.0 + card_h;
        let top = round_px((EXPANDED.1 - total) / 2.0, s);
        let dots = (8.0 + round_px((card_w - 16.0 - 28.0) / 2.0, s), 12.0);
        let (sw, sh) = (
            ceil_px(f.settings.advance_width(SETTINGS), s),
            line(&f.settings),
        );
        let settings_icon = TextBox {
            x: floor_px((COLLAPSED.0 - sw) / 2.0, s),
            y: floor_px((COLLAPSED.1 - sh) / 2.0, s),
            w: sw,
            h: sh,
            sprite: 2,
        };
        Some(Layout {
            top,
            title,
            close,
            close_icon,
            cards,
            labels,
            dots,
            settings_icon,
        })
    }

    /// The pressables of a content view in screen space (untransformed): x, y, w, h.
    fn press_rects(&self, content: &Content, l: &Layout) -> Vec<[f32; 4]> {
        let (px, py) = (self.tx.value as f32, self.ty.value as f32);
        if content.collapsed {
            vec![[px, py, COLLAPSED.0, COLLAPSED.1]]
        } else {
            let mut v = vec![[
                px + l.close[0],
                py + l.top + l.close[1],
                l.close[2],
                l.close[3],
            ]];
            for c in &l.cards {
                v.push([px + c[0], py + l.top + c[1], c[2], c[3]]);
            }
            v
        }
    }

    fn panel_rect(&self) -> [f32; 4] {
        [
            self.tx.value as f32,
            self.ty.value as f32,
            self.width.value as f32,
            self.height.value as f32,
        ]
    }

    /// Whether (x, y) is on the GestureDetector's view: `controls` (the final size) or the
    /// panel's animated frame.
    fn on_panel(&self, x: f32, y: f32) -> bool {
        let (px, py) = (self.tx.value as f32, self.ty.value as f32);
        let (fw, fh) = self.final_size();
        let p = self.panel_rect();
        let inside = |r: [f32; 4]| x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
        inside([px, py, fw, fh]) || inside(p)
    }

    fn scaled_inside(r: [f32; 4], k: f32, x: f32, y: f32) -> bool {
        let (cx, cy) = (r[0] + r[2] / 2.0, r[1] + r[3] / 2.0);
        let (hw, hh) = (r[2] * k / 2.0, r[3] * k / 2.0);
        (x - cx).abs() <= hw && (y - cy).abs() <= hh
    }

    fn toggle(&mut self) {
        let (ow, oh) = self.final_size();
        self.collapsed = !self.collapsed;
        let (nw, nh) = self.final_size();
        let (w, h, _) = self.size;
        let (x, y) = snap_to_corner(
            self.tx.value as f32 + (ow - nw) / 2.0,
            self.ty.value as f32 + (oh - nh) / 2.0,
            nw,
            nh,
            w,
            h,
            self.top_margin(),
            0.0,
            0.0,
        );
        let cfg = OPTIONS[self.spring_type].spring;
        for (s, to) in [(&mut self.tx, x), (&mut self.ty, y)] {
            let v = if s.running { s.velocity } else { 0.0 };
            s.to(to as f64, v, cfg);
        }
        self.width.to(nw as f64, 0.0, LAYOUT_SPRING);
        self.height.to(nh as f64, 0.0, LAYOUT_SPRING);
        gfx::spring_to(
            &mut self.progress,
            if self.collapsed { 0.0 } else { 1.0 },
            500.0,
            1.0,
        );
        for c in &mut self.contents {
            if !c.exiting {
                c.exit();
            }
        }
        // An expanded view takes the label slot no other live expanded view holds.
        let taken: Vec<usize> = self
            .contents
            .iter()
            .filter(|c| !c.collapsed)
            .map(|c| c.slot)
            .collect();
        let slot = if taken.contains(&0) { 1 } else { 0 };
        self.contents
            .push(Content::new(self.collapsed, self.spring_type, slot));
        while self.contents.len() > LAYERS {
            self.contents.remove(0);
        }
    }

    fn select(&mut self, i: usize) {
        self.spring_type = i;
        for c in self
            .contents
            .iter_mut()
            .filter(|c| !c.exiting && !c.collapsed)
        {
            for (k, t) in c.active.iter_mut().enumerate() {
                let to = if k == i { 1.0 } else { 0.0 };
                if t.target() != to {
                    t.to(to, 200.0, Easing::Linear);
                }
            }
        }
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64) {
        let claim = phase == Phase::Down && self.on_panel(x, y);
        let event = self.pan.event(id, phase, x, y, ms, claim);
        match event {
            Event::Begin { .. } => {
                self.start = (self.tx.value as f32, self.ty.value as f32);
                // The pressable under the finger, in the live content (the panel clips).
                if let Some(l) = self.layout() {
                    let p = self.panel_rect();
                    let in_panel = x >= p[0] && x <= p[0] + p[2] && y >= p[1] && y <= p[1] + p[3];
                    if let Some(ci) = self.contents.iter().position(|c| !c.exiting) {
                        let rects = self.press_rects(&self.contents[ci], &l);
                        let hit = rects.iter().position(|r| {
                            in_panel
                                && x >= r[0]
                                && x <= r[0] + r[2]
                                && y >= r[1]
                                && y <= r[1] + r[3]
                        });
                        if let Some(k) = hit {
                            self.contents[ci].presses[k].pointer(id, Phase::Down, true);
                            self.press = Some((id, ci, k));
                        }
                    }
                }
            }
            Event::Start(p) | Event::Update(p) => {
                if matches!(event, Event::Start(_)) {
                    // The finger takes the panel.
                    self.posted.push("haptic:impact-light".into());
                }
                if let Some((_, ci, k)) = self.press.take() {
                    if let Some(c) = self.contents.get_mut(ci) {
                        c.presses[k].cancel();
                    }
                }
                self.tx.set((self.start.0 + p.translation_x) as f64);
                self.ty.set((self.start.1 + p.translation_y) as f64);
            }
            Event::End(p) => {
                let (fw, fh) = self.final_size();
                let (w, h, _) = self.size;
                let (cx, cy) = snap_to_corner(
                    self.tx.value as f32,
                    self.ty.value as f32,
                    fw,
                    fh,
                    w,
                    h,
                    self.top_margin(),
                    p.velocity_x,
                    p.velocity_y,
                );
                let cfg = OPTIONS[self.spring_type].spring;
                self.tx.to(cx as f64, p.velocity_x as f64, cfg);
                self.ty.to(cy as f64, p.velocity_y as f64, cfg);
            }
            _ => {}
        }
        // The held press: its lift inside (through its scale) presses.
        if matches!(phase, Phase::Move | Phase::Up | Phase::Cancel) {
            let Some((fid, ci, k)) = self.press else {
                return;
            };
            if fid != id {
                return;
            }
            let Some(l) = self.layout() else { return };
            let r = self.press_rects(&self.contents[ci], &l)[k];
            let scale = self.contents[ci].presses[k].scale() as f32;
            let inside = Self::scaled_inside(r, scale, x, y);
            let out = self.contents[ci].presses[k].pointer(id, phase, inside);
            if phase != Phase::Move {
                self.press = None;
            }
            if let Some(PressEvent::Press(press)) = out {
                if let Some(m) = press.global_message() {
                    self.posted.push(m.to_string());
                }
                if self.contents[ci].collapsed || k == 0 {
                    self.toggle();
                } else {
                    self.select(k - 1);
                }
            }
        }
    }

    fn step(&mut self, now: f64) -> bool {
        self.now = now;
        let mut moving = false;
        for s in [
            &mut self.tx,
            &mut self.ty,
            &mut self.width,
            &mut self.height,
            &mut self.progress,
        ] {
            moving |= s.step(now);
        }
        for c in &mut self.contents {
            moving |= c.fade.step(now);
            if !c.exiting {
                for p in &mut c.presses {
                    moving |= p.step(now);
                }
                for t in &mut c.active {
                    moving |= t.step(now);
                }
            }
        }
        self.contents.retain(|c| !c.done());
        moving || self.pan.tracking()
    }

    /// The label colours per slot (rgb), as the atlas must hold them.
    fn label_colors(&self) -> [[u32; 3]; 2] {
        let mut out = [[DEFAULT_TEXT; 3]; 2];
        for c in self.contents.iter().filter(|c| !c.collapsed) {
            for (i, o) in OPTIONS.iter().enumerate() {
                let col = interpolate_color(
                    c.active[i].value,
                    &[0.0, 1.0],
                    &[rgba(DEFAULT_TEXT), rgba(o.color)],
                );
                out[c.slot][i] = ((col[0] as u32) << 16) | ((col[1] as u32) << 8) | col[2] as u32;
            }
        }
        out
    }

    /// The atlas's sprite rects in pixels: x, y, w, h.
    fn sprite_rects(&self, l: &Layout) -> [[u32; 4]; SPRITES] {
        let s = self.size.2;
        let px = |v: f32| (v * s).round() as u32;
        let boxes = [
            l.title,
            l.close_icon,
            l.settings_icon,
            l.labels[0],
            l.labels[1],
            l.labels[2],
        ];
        let mut out = [[0u32; 4]; SPRITES];
        let mut y = 2;
        for k in 0..SPRITES {
            let b = boxes[if k < 3 { k } else { 3 + (k - 3) % 3 }];
            out[k] = [2, y, px(b.w), px(b.h)];
            y += px(b.h) + 4;
        }
        out
    }

    fn draw_atlas(&self, c: &mut Canvas, l: &Layout, colors: [[u32; 3]; 2]) {
        let Some(f) = self.fonts.as_ref() else { return };
        let s = self.size.2;
        let r = self.sprite_rects(l);
        let at = |k: usize| (r[k][0] as f32 / s, r[k][1] as f32 / s);
        let mut text = |k: usize, t: &str, font: &Font, color: u32| {
            let (x, y) = at(k);
            c.draw_text(
                t,
                x,
                gfx::baseline(font, y),
                font,
                &Paint::fill(Color::view_hex(color)),
            );
        };
        text(0, "Spring Animations", &f.title, TITLE_COLOR);
        text(1, CLOSE, &f.close, CLOSE_COLOR);
        text(2, SETTINGS, &f.settings, TITLE_COLOR);
        for slot in 0..2 {
            for (i, o) in OPTIONS.iter().enumerate() {
                text(3 + slot * 3 + i, o.label, &f.label, colors[slot][i]);
            }
        }
    }

    /// A Text's backing store at its box (content space), resampled.
    fn sprite(
        &self,
        c: &mut Canvas,
        rects: &[[u32; 4]; SPRITES],
        b: TextBox,
        sprite: usize,
        atlas: skia::ImageRef,
    ) {
        let s = self.size.2;
        let r = rects[sprite];
        let to_image = Matrix::translate(-b.x, -b.y)
            .then(Matrix::scale(s, s))
            .then(Matrix::translate(r[0] as f32, r[1] as f32));
        c.draw_rect(b.x, b.y, b.w, b.h, &Paint::image(atlas, to_image));
    }

    /// One content view, in the panel's space.
    fn record_content(
        &self,
        c: &mut Canvas,
        content: &Content,
        l: &Layout,
        rects: &[[u32; 4]; SPRITES],
        atlas: skia::ImageRef,
    ) {
        let press = |k: usize, c: &mut Canvas, r: [f32; 4]| {
            let k = content.presses[k].scale() as f32;
            let (cx, cy) = (r[0] + r[2] / 2.0, r[1] + r[3] / 2.0);
            c.translate(cx, cy);
            c.scale(k, k);
            c.translate(-cx, -cy);
        };
        if content.collapsed {
            c.save();
            press(0, c, [0.0, 0.0, COLLAPSED.0, COLLAPSED.1]);
            self.sprite(c, rects, l.settings_icon, 2, atlas);
            c.restore();
            return;
        }
        c.save();
        c.translate(0.0, l.top);
        self.sprite(c, rects, l.title, 0, atlas);
        c.save();
        press(0, c, l.close);
        c.translate(l.close[0], l.close[1]);
        self.sprite(c, rects, l.close_icon, 1, atlas);
        c.restore();
        for (i, o) in OPTIONS.iter().enumerate() {
            let r = l.cards[i];
            let p = content.active[i].value;
            c.save();
            press(1 + i, c, r);
            c.translate(r[0], r[1]);
            let bg = interpolate_color(p, &[0.0, 1.0], &[rgba(0xFFFFFF), rgba(o.bg)]);
            c.draw_continuous_rrect(0.0, 0.0, r[2], r[3], 10.0, &Paint::fill(view(bg)));
            for (j, (a, k)) in o.dots.iter().enumerate() {
                let (cx, cy) = (l.dots.0 + 10.0 * j as f32 + 4.0, l.dots.1 + 6.0);
                c.draw_circle(
                    cx,
                    cy,
                    4.0 * k,
                    &Paint::fill(Color::view_hex(o.color)).with_opacity(*a),
                );
            }
            self.sprite(c, rects, l.labels[i], 3 + content.slot * 3 + i, atlas);
            c.restore();
        }
        c.restore();
    }

    /// borderRadius, as Core Animation draws it.
    fn radius(&self) -> f32 {
        let r = interpolate(
            self.progress.value,
            &[0.0, 1.0],
            &[(COLLAPSED.0 / 2.0) as f64, 16.0],
            Extrapolation::Extend,
        ) as f32;
        r.min(self.width.value as f32 / 2.0)
            .min(self.height.value as f32 / 2.0)
            .max(0.0)
    }
}

impl Surface for Panel {
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
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"x\":{:.2},\"y\":{:.2},\"width\":{:.2},\"height\":{:.2},\"collapsed\":{},\"springType\":{},\"views\":{},\"held\":{}}}",
            self.tx.value,
            self.ty.value,
            self.width.value,
            self.height.value,
            self.collapsed,
            self.spring_type,
            self.contents.len(),
            self.pan.tracking()
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
        self.place(w, h);
        let moving = self.step(frame.now_ms);
        let Some(l) = self.layout() else { return false };
        let rects = self.sprite_rects(&l);
        let key = (pw, ph, s.to_bits());
        if self.gpu.as_ref().map(|g| g.key) != Some(key) {
            let aw = rects.iter().map(|r| r[0] + r[2]).max().unwrap_or(1) + 2;
            let ah = rects.iter().map(|r| r[1] + r[3]).max().unwrap_or(1) + 2;
            let layer_px = (
                (EXPANDED.0 * s).ceil() as u32 + 2,
                (EXPANDED.1 * s).ceil() as u32 + 2,
            );
            self.gpu = Some(Gpu {
                key,
                atlas: Images::target(device, aw, ah),
                layers: Images::targets(device, layer_px.0, layer_px.1, LAYERS as u32),
                layer_px,
                atlas_canvas: Canvas::default(),
                atlas_renderer: Renderer::default(),
                group: (0..LAYERS)
                    .map(|_| (Canvas::default(), Renderer::default(), false))
                    .collect(),
                main: Canvas::default(),
                renderer: Renderer::default(),
                main_bound: false,
                drawn: None,
            });
        }
        let mut gpu = self.gpu.take().unwrap();
        let fmt = wgpu::TextureFormat::Rgba8Unorm;
        let clear = wgpu::Color::TRANSPARENT;
        // The Text backing stores, redrawn when a label's colour moved.
        let colors = self.label_colors();
        if gpu.drawn != Some(colors) {
            let a = gpu.atlas.image(0);
            gpu.atlas_canvas.begin(s);
            self.draw_atlas(&mut gpu.atlas_canvas, &l, colors);
            let v = gpu.atlas.render_view();
            gpu.atlas_renderer.draw(
                device,
                queue,
                encoder,
                &gpu.atlas_canvas,
                &v,
                fmt,
                a.width as u32,
                a.height as u32,
                clear,
            );
            gpu.drawn = Some(colors);
        }
        // Each content view as one layer (group opacity), at the panel's pixel-floored origin.
        let (tx, ty) = (self.tx.value as f32, self.ty.value as f32);
        let (ox, oy) = ((tx * s).floor() / s, (ty * s).floor() / s);
        let atlas = gpu.atlas.image(0);
        for (k, content) in self.contents.iter().enumerate() {
            let (c, r, bound) = &mut gpu.group[k];
            if !*bound {
                r.set_images(&gpu.atlas);
                *bound = true;
            }
            c.begin(s);
            c.translate(tx - ox, ty - oy);
            self.record_content(c, content, &l, &rects, atlas);
            let v = gpu.layers.render_view_layer(k as u32);
            r.draw(
                device,
                queue,
                encoder,
                c,
                &v,
                fmt,
                gpu.layer_px.0,
                gpu.layer_px.1,
                clear,
            );
        }
        // The screen: background, the panel's shadow and body, its content clipped to it.
        let [px, py, bw, bh] = self.panel_rect();
        let radius = self.radius();
        let c = &mut gpu.main;
        c.begin(s);
        c.fill(Color::view_hex(BACKGROUND));
        c.save();
        c.clip_with(|b| {
            let e = 4.0 * SHADOW_SIGMA;
            skia::add_rect(b, px - e, py - e, bw + 2.0 * e, bh + 2.0 * e);
            skia::add_rrect_hole(b, px, py, bw, bh, radius);
        });
        c.draw_rrect_shadow(
            px,
            py,
            bw,
            bh,
            radius,
            SHADOW_SIGMA,
            Color::BLACK.alpha(0.05),
        );
        c.restore();
        c.draw_rrect(px, py, bw, bh, radius, &Paint::fill(Color::WHITE));
        c.save();
        c.clip_rrect(px, py, bw, bh, radius);
        let (lw, lh) = (gpu.layer_px.0 as f32 / s, gpu.layer_px.1 as f32 / s);
        for (k, content) in self.contents.iter().enumerate() {
            let a = content.fade.value as f32;
            if a <= 0.0 {
                continue;
            }
            let paint = Paint::shader(Shader::ImageNearest {
                image: gpu.layers.image(k),
                to_image: Matrix::translate(-ox, -oy).then(Matrix::scale(s, s)),
                subset: [0.0, 0.0, gpu.layer_px.0 as f32, gpu.layer_px.1 as f32],
            })
            .with_opacity(a);
            c.draw_rect(ox, oy, lw, lh, &paint);
        }
        c.restore();
        if !gpu.main_bound {
            gpu.renderer.set_images(&gpu.layers);
            gpu.main_bound = true;
        }
        gpu.renderer.draw(
            device, queue, encoder, &gpu.main, target, format, pw, ph, clear,
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
    const FRAME: f64 = 1000.0 / 60.0;

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

    fn panel() -> Panel {
        let mut p = Panel::new();
        p.bind(&[Value::Number(68.0)], None).unwrap();
        p.size = (W, H, 3.0);
        p.place(W, H);
        p
    }

    fn run(p: &mut Panel, from: f64, to: f64) -> f64 {
        let mut t = from;
        while t < to {
            if !p.step(t) && t > from + 100.0 {
                break;
            }
            t += FRAME;
        }
        t
    }

    fn tap(p: &mut Panel, x: f32, y: f32, t: f64) {
        p.input(&pointer(PointerPhase::Down, x, y, t));
        p.step(t + 50.0);
        p.input(&pointer(PointerPhase::Up, x, y, t + 80.0));
    }

    #[test]
    fn the_subset_keeps_the_fonts_metrics() {
        let full = include_bytes!("../../assets/fonts/Honk-Regular.otf");
        for size in [13.0, 16.0] {
            let a = Font::new(HONK, size).unwrap().with_ui_layout();
            let b = Font::new(full, size).unwrap().with_ui_layout();
            for t in ["Spring Animations", "Elegant", "Springy", "Super"] {
                assert_eq!(a.advance_width(t), b.advance_width(t), "{t}");
            }
            assert_eq!(a.ui_line_height(), b.ui_line_height());
        }
    }

    #[test]
    fn yoga_layout_of_the_panel_content() {
        let p = panel();
        let l = p.layout().unwrap();
        // Honk 16: (984 + 207) / 1000 × 16 = 19.056 → 19.333; Ionicons 20: 525 / 512 × 20 =
        // 20.508 → 20.667 (+ padding 8: the header 28.667); cards (236 − 16) / 3 = 73.333 ×
        // 63.667 (Honk 13: 15.667); the content 110.333 tall, its top 19.833 → 20.
        assert!((l.close[3] - 28.6667).abs() < 1e-3, "{:?}", l.close);
        assert!((l.title.y - 4.6667).abs() < 1e-3);
        assert!((l.cards[1][0] - 103.3333).abs() < 1e-3 && (l.cards[0][2] - 73.3333).abs() < 1e-3);
        assert!((l.cards[0][3] - 63.6667).abs() < 1e-3);
        assert_eq!(l.top, 20.0);
        assert!((l.cards[0][1] - 46.6667).abs() < 1e-3);
        assert!((l.dots.0 - 22.6667).abs() < 1e-3);
        // settings-sharp 24: 24.333 × 24.667 at 19.667.
        assert!(
            (l.settings_icon.x - 19.6667).abs() < 1e-3
                && (l.settings_icon.y - 19.6667).abs() < 1e-3
        );
    }

    #[test]
    fn snaps_to_the_projected_corner() {
        // From the bottom right, a flick up-left at 2000 pt/s projects 300 pt: top-left wins.
        let (x, y) = snap_to_corner(110.0, 662.0, 280.0, 150.0, W, H, 124.0, -2000.0, -2000.0);
        assert_eq!((x, y), (30.0, 124.0));
        let (x, y) = snap_to_corner(110.0, 662.0, 280.0, 150.0, W, H, 124.0, 0.0, 0.0);
        assert_eq!((x, y), (110.0, 662.0));
    }

    #[test]
    fn a_drag_throws_it_and_a_close_shrinks_it() {
        let mut p = panel();
        assert_eq!((p.tx.value, p.ty.value), (110.0, 662.0));
        // Drag from the title up by 400 pt over 400 ms, then lift: the top-right corner.
        p.input(&pointer(PointerPhase::Down, 150.0, 700.0, 0.0));
        let mut t = 0.0;
        for k in 1..=24 {
            t = k as f64 * FRAME;
            p.input(&pointer(
                PointerPhase::Move,
                150.0,
                700.0 - 400.0 * k as f32 / 24.0,
                t,
            ));
            p.step(t);
        }
        assert!(p.pan.active());
        p.input(&pointer(PointerPhase::Up, 150.0, 300.0, t + FRAME));
        assert!((p.ty.target() - 124.0).abs() < 1e-6 && (p.tx.target() - 110.0).abs() < 1e-6);
        let t = run(&mut p, t + FRAME, t + 5000.0);
        assert_eq!((p.tx.value, p.ty.value), (110.0, 124.0));
        // Light when the pan took it, nothing when it landed in the corner.
        assert_eq!(p.messages(), vec!["haptic:impact-light".to_string()]);
        // The close (top right of the header) collapses it, around its centre, into the
        // top-right corner: (326, 124).
        let l = p.layout().unwrap();
        let (cx, cy) = (110.0 + l.close[0] + 14.0, 124.0 + l.top + 14.0);
        tap(&mut p, cx, cy, t);
        assert!(p.collapsed);
        assert_eq!(p.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!((p.tx.target(), p.ty.target()), (326.0, 124.0));
        assert_eq!(p.contents.len(), 2);
        let t = run(&mut p, t + 100.0, t + 5000.0);
        assert_eq!((p.width.value, p.height.value), (64.0, 64.0));
        assert_eq!(p.contents.len(), 1);
        assert_eq!(p.radius(), 32.0);
        // The settings button grows it back.
        tap(&mut p, 358.0, 156.0, t);
        assert!(!p.collapsed);
        assert_eq!((p.tx.target(), p.ty.target()), (110.0, 124.0));
    }

    #[test]
    fn options_select_the_spring_and_a_drag_cancels_the_press() {
        let mut p = panel();
        let l = p.layout().unwrap();
        let card = |i: usize| {
            (
                110.0 + l.cards[i][0] + 30.0,
                662.0 + l.top + l.cards[i][1] + 30.0,
            )
        };
        let (x, y) = card(2);
        tap(&mut p, x, y, 0.0);
        assert_eq!(p.spring_type, 2);
        assert!(p.contents[0].active[2].running);
        run(&mut p, 100.0, 1000.0);
        assert_eq!(p.contents[0].active[2].value, 1.0);
        assert_eq!(p.contents[0].active[0].value, 0.0);
        // A drag that starts on a card moves the panel and presses nothing.
        let (x, y) = card(1);
        p.messages();
        p.input(&pointer(PointerPhase::Down, x, y, 2000.0));
        p.input(&pointer(PointerPhase::Move, x, y - 30.0, 2200.0));
        p.input(&pointer(PointerPhase::Up, x, y - 30.0, 2300.0));
        assert_eq!(p.spring_type, 2);
        // No press's selection: only the pan's grab.
        assert_eq!(p.messages(), vec!["haptic:impact-light".to_string()]);
    }

    #[test]
    fn it_draws_the_panel() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let frame = |now_ms| Frame {
            width: W,
            height: H,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0)], None).unwrap();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("draggable-panel-rest");
        let bg = Color::view_hex(BACKGROUND)
            .0
            .map(|v| (v * 255.0).round() as u8);
        // The screen, then the white panel (110, 662) 280 × 150.
        assert_eq!(img.at(3 * 20, 3 * 400)[..3], bg[..3]);
        assert_eq!(img.at(3 * 200, 3 * 670)[..3], [255, 255, 255]);
        // Elegant's card (active) at (132, 728.667): #f8f4ff in P3.
        let want = Color::view_hex(0xF8F4FF)
            .0
            .map(|v| (v * 255.0).round() as u8);
        let p = img.at(3 * 135, 3 * 780);
        assert!(
            p[..3]
                .iter()
                .zip(&want[..3])
                .all(|(a, b)| a.abs_diff(*b) <= 1),
            "{p:?} {want:?}"
        );
        // The title's ink in its box, nothing in the gap under the header.
        let ink = |x0: u32, y0: u32, x1: u32, y1: u32| {
            let mut n = 0;
            for y in y0..y1 {
                for x in x0..x1 {
                    if img.at(x, y)[0] < 200 {
                        n += 1;
                    }
                }
            }
            n
        };
        assert!(ink(3 * 132, 3 * 686, 3 * 300, 3 * 706) > 200);
        assert_eq!(ink(3 * 132, 3 * 712, 3 * 380, 3 * 727), 0);
        // The close icon's ink at its box (110 + 233.333 + 4, 682 + 4).
        assert!(ink(3 * 348, 3 * 687, 3 * 367, 3 * 706) > 50);
        // Collapsed: the settings icon in the 64 pt circle.
        let mut t = 100.0;
        s.input(&pointer(PointerPhase::Down, 110.0 + 247.5, 682.0 + 14.0, t));
        s.input(&pointer(
            PointerPhase::Up,
            110.0 + 247.5,
            682.0 + 14.0,
            t + 50.0,
        ));
        loop {
            let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
            if !moving || t > 5000.0 {
                img.save("draggable-panel-collapsed");
                // Bottom right: (326, 748), a circle (its corner is the screen's colour).
                let mut n = 0;
                for y in 3 * 768..3 * 792 {
                    for x in 3 * 346..3 * 370 {
                        if img.at(x, y)[0] < 120 {
                            n += 1;
                        }
                    }
                }
                assert!(n > 300, "{n}");
                assert_ne!(img.at(3 * 327, 3 * 749)[..3], [255, 255, 255]);
                assert_eq!(img.at(3 * 358, 3 * 752)[..3], [255, 255, 255]);
                break;
            }
            t += FRAME;
        }
    }
}
