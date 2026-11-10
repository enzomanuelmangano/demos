//! Add to Cart (src/animations/add-to-cart: index.tsx; components/list-item/index.tsx and
//! pressable-scale.tsx, confirm-button, backdrop, bottom-sheet): a FlatList of 20 product rows,
//! each with a black cart button; a tap flies a black button from that row's cart button to the
//! bottom of the screen, where it grows into "ADD TO CART" over a dimmed backdrop and a white
//! sheet; confirming counts the item (a red badge on the row) and flies the button back. All of
//! it is this surface: the list (UIScrollView), the rows, every touch, the springs, the layers.
//!
//! Layout (React Native 0.88's Yoga, checked against exact/parity-tools/add-to-cart/
//! yoga-layout.cpp; window `W × H`, safe top `T`, scale `s`; each node rounded as Yoga rounds:
//! its position relative to its parent half up (a Text's floored), its size from its unrounded
//! absolute edges; RCTTextLayoutManager's sizes ceiled after 0.001):
//! - The FlatList fills the screen (white); its content container has paddingTop T + 24 and
//!   paddingBottom 100; each cell holds a ListItem: margin 10, width 90 %, height 85, centred,
//!   white, borderRadius 10 continuous, boxShadow 0 5 10 rgba(0, 0, 0, 0.2) (RCTBoxShadow: σ 5,
//!   the circular rounded rect, outside the view), paddingLeft 15, paddingRight 20, a row,
//!   space-between, centred.
//! - Its left View (flex 1, a row): the photo (expo-image, height '65 %' of the row's 85 =
//!   55.25 → 55.333, aspectRatio 1, borderRadius 10: expo-image ignores borderCurve, so
//!   circular; top-aligned) and the labels (paddingLeft 10, centred): the title "Item i" (bold
//!   14) with marginBottom 5, the description (14, rgba(0, 0, 0, 0.8), numberOfLines 2,
//!   maxWidth '80 %'). Yoga resolves the percentage against the labels' available width when it
//!   measures them (0.8 × (left − 10)) and again against their width when it lays them out, so
//!   the description is 0.64 × (left − 10) wide (188 at W 420). TextKit wraps it there and cuts
//!   the second line, the whole rest of the text, at a character with "…" (byTruncatingTail;
//!   probed on the Mac with exact/parity-tools/add-to-cart/textkit-lines.swift).
//! - The buy button: a PressableScale View (the demo's own: an RNGH Tap) holding the 40 × 40
//!   black button (borderRadius 10 continuous) with Feather's shopping-cart (18, white) centred
//!   in it, and, once the item is counted, the badge (absolute, right −2.5, top −2.5, 15 × 15,
//!   #D12727, radius 10 → a circle; the count bold 10 white, centred; zIndex 100: above).
//! - The photo: the Unsplash JPEG RN requests (w=200: 200 × 300) as expo-image shows it in a
//!   55.333 view, cover: downscaled to (56, 83) pt = 168 × 249 px, then aspect-filled
//!   (gpu/images/add-to-cart, made by exact/parity-tools/add-to-cart/resize-photo.swift).
//! - Backdrop: absoluteFill rgba(0, 0, 0, 0.75) at opacity p; pointerEvents 'auto' while p ≠ 0;
//!   onTouchEnd → onDismiss.
//! - BottomSheet: absolute, left 0, right 0, bottom 0, height 300, paddingBottom 100, white,
//!   borderRadius 20 continuous, translateY = interpolate(p, [0, 1], [300, 100]) (extend); its
//!   View (flex 1, paddingVertical 20, paddingHorizontal 5 %): "Payment Confirmation" (bold 20)
//!   and, marginTop 10, "Are you sure you want to add this item to your cart?" (14), each at
//!   opacity interpolate(p, [0.2, 1], [0, 1], clamp).
//! - ConfirmButton (pressto PressableScale, zIndex 10: Fabric mounts it last, so it draws and
//!   takes touches above the sheet): absolute, black, borderRadius 10 continuous; top, left,
//!   width, height = interpolate(p, [0, 1], [measured pageY, H − 100]), [pageX, 0.05 W],
//!   [width, 0.9 W], [height, 45] (layout props: Yoga lays the row out every frame); a centred
//!   row of the "ADD TO CART" View (flex 4p; its Text bold 14 white, paddingHorizontal 15,
//!   opacity interpolate(p, [0.5, 1], [0, 1], clamp)) and the icon's View (flex 1, the Feather
//!   cart centred). At p = 0 the text View's flex is 0 (basis auto: the Text's own width), so
//!   the icon sits off to the right, as RN draws the first frame after a tap. With no layout
//!   data it is 0 × 0 at opacity 0.
//!
//! Core Animation draws a text's backing store and resamples it under a transform: the cart
//! glyph and badge under a press's scale, the sheet's texts at a fractional translateY, the
//! confirm button's text and icon under pressto's scale. Those layers are drawn once into an
//! atlas (with the photo) and composited bilinearly; backgrounds are drawn through the
//! transform (CA's geometry). The badge fades as a group (allowsGroupOpacity): one bitmap.
//!
//! Touches, as UIKit hit-tests Fabric's views (mount order, zIndex last): the confirm button
//! (its frame, pressto's scale about its centre), the sheet (no handler: swallowed), the
//! backdrop (while p ≠ 0), then the list:
//! - The list is a UIScrollView (`ui_scroll`, fed y; port H; NORMAL deceleration; bounces).
//! - A buy button's Tap (RNBetterTapGestureRecognizer: maxDuration 5000, shouldCancelWhenOutside,
//!   no distance limit): onTouchesDown springs the scale to 0.9; a move outside the (scaled)
//!   view, the scroll view's pan beginning (they never recognise together), or 5 s held fail it;
//!   onTouchesUp (a lift while it is possible) is onPress: `measure` of the button (the shadow
//!   tree's frame: the press scale is a synchronous prop, not in it; the scroll's offset taken
//!   off), then onTap; onFinalize springs the scale back to 1. A touch that lands while the
//!   scroll moves is the scroll view's: no press (as qr_code_generator; unverified).
//! - onTap: cancelAnimation, progress 0, layoutData, selectedIndex, then withSpring(1).
//! - onDismiss: withSpring(0), its callback clears layoutData and selectedIndex if it completes.
//! - The confirm button (BaseButton): pressed at touch-down, onPress at a lift inside: the app's
//!   selection haptic (`haptic:selection`), then onConfirm: count + 1 for the selected index,
//!   onDismiss.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | animationProgress p | withSpring(1 / 0, { dampingRatio 1, duration 500 }) (critical; stiffness solved per start, mass 4); the first frame at the start (valueSetter's step) | `gfx::spring_to(500, 1)`; `Spring`'s first step is dt 0 |
//! | onTap's reset | cancelAnimation (callback false) + set(0) | `Spring::set(0)`, the dismiss callback disarmed |
//! | dismiss callback | withSpring(0, cb): cb(true) at rest clears layoutData, selectedIndex; cb(false) when replaced | `dismissing`, cleared on completion only |
//! | row press scale | Tap onTouchesDown withSpring(0.9, { overshootClamping }) / onFinalize withSpring(1, same): default (900, 120, 4) | `press::RowTap`, `Spring::to_clamped(GENTLE)` with the running velocity (dropped when pointing away) |
//! | confirm press scale | pressto: withTiming(active, 250 ms, bezier(0.25, 0.1, 0.25, 1)), scale interpolate(progress, [0, 1], [1, 0.96]) | `press::Pressto` |
//! | button opacity | selectedIndex === index ? 0 : 1 | same |
//! | badge opacity | selectedIndex === index ? (1 − p)² : 1 | same, group opacity |
//! | confirm top / left / width / height | interpolate(p, [0, 1], [layout, end]) (extend), Yoga-rounded | `ConfirmGeom` |
//! | confirm text View flex | interpolate(p, [0, 1], [0, 4], clamp) | Yoga's flex (basis 0 / auto at 0) |
//! | confirm text opacity | interpolate(p, [0.5, 1], [0, 1], clamp) | same |
//! | backdrop opacity | p | same |
//! | sheet translateY | interpolate(p, [0, 1], [300, 100], extend) | same, its texts resampled |
//! | sheet text opacity | interpolate(p, [0.2, 1], [0, 1], clamp) | same |
//! | scroll offset | UIScrollView: 1:1 drag, deceleration, rubber band, bounce | `ui_scroll::UiScroll` (drawn on the pixel grid) |
//! | haptics | PressablesConfig onPress: selection, on the confirm button's press | `haptic:selection` |
//!
//! Inputs: `safeTop`.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::{interpolate, Extrapolation, Spring};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

/// `new Array(20)`.
const ITEMS: usize = 20;
/// items[i].description.
const DESCRIPTION: &str = "Lorem, ipsum dolor sit amet consectetur adipisicing elit. Vitae itaque quae, deleniti distinctio laudantium, doloremque debitis, fugiat ea alias sint dolor qui? Quo tempore, ab aliquam repellendus veritatis aspernatur cupiditate.";
/// "Add to cart", textTransform uppercase.
const CTA: &str = "ADD TO CART";
const SHEET_TITLE: &str = "Payment Confirmation";
const SHEET_MESSAGE: &str = "Are you sure you want to add this item to your cart?";
/// Feather's shopping-cart (U+F1D9), from the font subset to that glyph.
const CART: &str = "\u{F1D9}";
static FEATHER: &[u8] = include_bytes!("../fonts/feather-shopping-cart-subset.ttf");
/// The photo as expo-image keeps it: 168 × 249 RGB rows, zlib.
static PHOTO: &[u8] = include_bytes!("../images/add-to-cart/photo-168x249.rgb8.zlib");
const PHOTO_PX: [u32; 2] = [168, 249];
/// Its UIImage size: (56, 83) pt at scale 3.
const PHOTO_PT: [f64; 2] = [56.0, 83.0];

/// contentContainerStyle: paddingTop top + 24, paddingBottom 100.
const PADDING_TOP: f64 = 24.0;
const PADDING_BOTTOM: f64 = 100.0;
/// styles.listItem: height 85, margin 10, width 90 %, paddingLeft 15, paddingRight 20.
const ROW_H: f64 = 85.0;
const ROW_MARGIN: f64 = 10.0;
const ROW_WIDTH: f64 = 0.9;
const ROW_PAD_L: f64 = 15.0;
const ROW_PAD_R: f64 = 20.0;
/// listItem and buyButton borderRadius.
const RADIUS: f32 = 10.0;
/// boxShadow '0px 5px 10px rgba(0, 0, 0, 0.2)': RCTBoxShadow's σ is the blur / 2.
const SHADOW_Y: f32 = 5.0;
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.2;
/// buyButton: 40 × 40.
const BUTTON: f64 = 40.0;
/// The photo's height '65 %', of the row's 85 (the left View's available height).
const IMAGE: f64 = 0.65 * ROW_H;
/// The labels' paddingLeft, the title's marginBottom, the description's maxWidth '80 %'.
const LABELS_PAD: f64 = 10.0;
const TITLE_GAP: f64 = 5.0;
const DESCRIPTION_MAX: f64 = 0.8;
/// styles.badge: 15 square, right / top −2.5, borderRadius 10 (a circle), #D12727.
const BADGE: f64 = 15.0;
const BADGE_INSET: f64 = -2.5;
const BADGE_COLOR: u32 = 0xD12727;
/// The Feather icon's size.
const ICON_SIZE: f32 = 18.0;
/// pressable-scale.tsx: withSpring(0.9, { overshootClamping: true }); maxDuration(5000).
const ROW_PRESS_SCALE: f64 = 0.9;
const TAP_MAX_MS: f64 = 5000.0;
/// ConfirmButton: top SCREEN_HEIGHT − 100, left 0.05 W, width 0.9 W, height 45.
const CONFIRM_BOTTOM: f64 = 100.0;
const CONFIRM_H: f64 = 45.0;
const CONFIRM_W: f64 = 0.9;
const CONFIRM_LEFT: f64 = 0.05;
/// The "ADD TO CART" Text's paddingHorizontal.
const CTA_PAD: f64 = 15.0;
/// withSpring(…, { dampingRatio: 1, duration: 500 }).
const SPRING_MS: f64 = 500.0;
const SPRING_RATIO: f64 = 1.0;
/// Backdrop: rgba(0, 0, 0, 0.75).
const BACKDROP_ALPHA: f32 = 0.75;
/// BottomSheet: BOTTOM_SHEET_OFFSET 100, height 200 + 100, borderRadius 20; its View's padding.
const SHEET_OFFSET: f64 = 100.0;
const SHEET_H: f64 = 200.0 + SHEET_OFFSET;
const SHEET_RADIUS: f32 = 20.0;
const SHEET_PAD_V: f64 = 20.0;
const SHEET_PAD_H: f64 = 0.05;
const MESSAGE_GAP: f64 = 10.0;
/// pressto: minScale 0.96, withTiming 250 ms, bezier(0.25, 0.1, 0.25, 1).
const PRESSTO_MIN_SCALE: f64 = 0.96;
const PRESSTO_MS: f64 = 250.0;
/// The atlas's transparent margin around each layer, device pixels.
const GUTTER: f64 = 2.0;

/// Yoga's `inexactEquals`.
fn inexact(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.0001
}

/// Yoga's `roundValueToPixelGrid`.
fn round_px(value: f64, s: f64, ceil: bool, floor: bool) -> f64 {
    let v = value * s;
    let mut f = v % 1.0;
    if f < 0.0 {
        f += 1.0;
    }
    let r = if inexact(f, 0.0) {
        v - f
    } else if inexact(f, 1.0) {
        v - f + 1.0
    } else if ceil {
        v - f + 1.0
    } else if floor {
        v - f
    } else {
        v - f + if f > 0.5 || inexact(f, 0.5) { 1.0 } else { 0.0 }
    };
    r / s
}

/// RCTTextLayoutManager's measured side (internal_roundTextMeasurementToPixelGrid).
fn text_side(v: f64, s: f64) -> f64 {
    ((v + 0.001) * s).ceil() / s
}

/// One laid-out node: its unrounded absolute origin (Yoga's), where it shows (the sum of its
/// ancestors' rounded relative positions) and its rounded size.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Node {
    abs: [f64; 2],
    at: [f64; 2],
    size: [f64; 2],
}

impl Node {
    fn root(w: f64, h: f64) -> Node {
        Node {
            abs: [0.0; 2],
            at: [0.0; 2],
            size: [w, h],
        }
    }

    /// A child at (x, y) relative, w × h unrounded; `text` for a Text node (floored position,
    /// its size ceiled when fractional).
    fn child(&self, x: f64, y: f64, w: f64, h: f64, text: bool, s: f64) -> Node {
        let abs = [self.abs[0] + x, self.abs[1] + y];
        let side = |a: f64, len: f64| {
            let f = (len * s) % 1.0;
            let fractional = !inexact(f, 0.0) && !inexact(f, 1.0);
            round_px(a + len, s, text && fractional, text && !fractional)
                - round_px(a, s, false, text)
        };
        Node {
            abs,
            at: [
                self.at[0] + round_px(x, s, false, text),
                self.at[1] + round_px(y, s, false, text),
            ],
            size: [side(abs[0], w), side(abs[1], h)],
        }
    }

    fn x(&self) -> f32 {
        self.at[0] as f32
    }
    fn y(&self) -> f32 {
        self.at[1] as f32
    }
    fn w(&self) -> f32 {
        self.size[0] as f32
    }
    fn h(&self) -> f32 {
        self.size[1] as f32
    }
}

/// What the layout needs from the fonts (points, unrounded).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Metrics {
    /// SF 14's line (bold and regular share it): 16.70703125 on iOS.
    line14: f64,
    /// SF 20's.
    line20: f64,
    /// SF 10's.
    line10: f64,
    /// The cart glyph's advance and Feather 18's line.
    icon: [f64; 2],
    /// "ADD TO CART"'s advance (bold 14).
    cta: f64,
}

/// One ListItem, in the list's content (offset 0).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct RowGeom {
    row: Node,
    image: Node,
    title: Node,
    description: Node,
    press: Node,
    icon: Node,
    badge: Node,
}

/// The BottomSheet at translateY 0.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct SheetGeom {
    sheet: Node,
    title: Node,
    message: Node,
}

/// The ConfirmButton at one progress.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct ConfirmGeom {
    frame: Node,
    text_view: Node,
    text: Node,
    lines: usize,
    icon: Node,
}

/// Where everything sits for a window, scale and safe top.
#[derive(Clone, Debug, Default)]
struct Layout {
    w: f64,
    h: f64,
    s: f64,
    safe_top: f64,
    metrics: Option<Metrics>,
    rows: Vec<RowGeom>,
    sheet: SheetGeom,
    /// The scroll content's height.
    content_h: f64,
}

impl Layout {
    fn new(w: f64, h: f64, s: f64, safe_top: f64, m: Metrics) -> Layout {
        let root = Node::root(w, h);
        let content = root;
        let rows = (0..ITEMS)
            .map(|i| {
                let cell = content.child(
                    0.0,
                    safe_top + PADDING_TOP + i as f64 * (ROW_H + 2.0 * ROW_MARGIN),
                    w,
                    ROW_H + 2.0 * ROW_MARGIN,
                    false,
                    s,
                );
                let row_w = ROW_WIDTH * w;
                let row = cell.child(
                    ROW_MARGIN + (w - 2.0 * ROW_MARGIN - row_w) / 2.0,
                    ROW_MARGIN,
                    row_w,
                    ROW_H,
                    false,
                    s,
                );
                let left_w = row_w - ROW_PAD_L - ROW_PAD_R - BUTTON;
                let (lh, lh2) = (text_side(m.line14, s), text_side(2.0 * m.line14, s));
                let labels_h = lh + TITLE_GAP + lh2;
                let left_h = labels_h.max(IMAGE);
                let left = row.child(ROW_PAD_L, (ROW_H - left_h) / 2.0, left_w, left_h, false, s);
                let image = left.child(0.0, 0.0, IMAGE, IMAGE, false, s);
                let inner = DESCRIPTION_MAX * (left_w - LABELS_PAD);
                let labels = left.child(
                    IMAGE,
                    (left_h - labels_h) / 2.0,
                    LABELS_PAD + inner,
                    labels_h,
                    false,
                    s,
                );
                let title = labels.child(LABELS_PAD, 0.0, inner, lh, true, s);
                let description = labels.child(
                    LABELS_PAD,
                    lh + TITLE_GAP,
                    DESCRIPTION_MAX * inner,
                    lh2,
                    true,
                    s,
                );
                let press = row.child(
                    ROW_PAD_L + left_w,
                    (ROW_H - BUTTON) / 2.0,
                    BUTTON,
                    BUTTON,
                    false,
                    s,
                );
                let (iw, ih) = (text_side(m.icon[0], s), text_side(m.icon[1], s));
                let icon = press.child((BUTTON - iw) / 2.0, (BUTTON - ih) / 2.0, iw, ih, true, s);
                let badge = press.child(
                    BUTTON - BADGE_INSET - BADGE,
                    BADGE_INSET,
                    BADGE,
                    BADGE,
                    false,
                    s,
                );
                RowGeom {
                    row,
                    image,
                    title,
                    description,
                    press,
                    icon,
                    badge,
                }
            })
            .collect();
        let sheet = root.child(0.0, h - SHEET_H, w, SHEET_H, false, s);
        let view = sheet.child(0.0, 0.0, w, SHEET_H - SHEET_OFFSET, false, s);
        let title_h = text_side(m.line20, s);
        let title = view.child(
            SHEET_PAD_H * w,
            SHEET_PAD_V,
            w - 2.0 * SHEET_PAD_H * w,
            title_h,
            true,
            s,
        );
        let message = view.child(
            SHEET_PAD_H * w,
            SHEET_PAD_V + title_h + MESSAGE_GAP,
            w - 2.0 * SHEET_PAD_H * w,
            text_side(m.line14, s),
            true,
            s,
        );
        let content_h =
            safe_top + PADDING_TOP + ITEMS as f64 * (ROW_H + 2.0 * ROW_MARGIN) + PADDING_BOTTOM;
        Layout {
            w,
            h,
            s,
            safe_top,
            metrics: Some(m),
            rows,
            sheet: SheetGeom {
                sheet,
                title,
                message,
            },
            content_h,
        }
    }

    /// The ConfirmButton at progress `p` from the measured `data` (pageX, pageY, width,
    /// height); `lines` is how many lines "ADD TO CART" takes at a width.
    fn confirm(&self, p: f64, data: [f64; 4], lines: impl Fn(f64) -> usize) -> ConfirmGeom {
        let Some(m) = self.metrics else {
            return ConfirmGeom::default();
        };
        let (w, h, s) = (self.w, self.h, self.s);
        let lerp = |a: f64, b: f64| interpolate(p, &[0.0, 1.0], &[a, b], Extrapolation::Extend);
        let frame = Node::root(w, h).child(
            lerp(data[0], CONFIRM_LEFT * w),
            lerp(data[1], h - CONFIRM_BOTTOM),
            lerp(data[2], CONFIRM_W * w),
            lerp(data[3], CONFIRM_H),
            false,
            s,
        );
        let (bw, bh) = (lerp(data[2], CONFIRM_W * w), lerp(data[3], CONFIRM_H));
        // rConfirmTextStyle's flex: interpolate(p, [0, 1], [0, 4], clamp).
        let flex = interpolate(p, &[0.0, 1.0], &[0.0, 4.0], Extrapolation::Clamp);
        let (text_x, text_w, icon_w) = if flex > 0.0 {
            // flex > 0: grow flex, basis 0, beside the icon View's flex 1.
            let total = flex + 1.0;
            (0.0, bw / total * flex, bw / total)
        } else {
            // flex 0: basis auto, the Text measured within the button's width (padding 15 each
            // side; wrapped there, it is the container's width); the icon View gets what is
            // left, none when the text overflows (no shrink), and justifyContent centres it.
            let limit = (bw - 2.0 * CTA_PAD).max(0.0);
            let measured = if m.cta > limit {
                text_side(limit, s)
            } else {
                text_side(m.cta, s)
            };
            let basis = measured + 2.0 * CTA_PAD;
            let free = bw - basis;
            (
                if free < 0.0 { free / 2.0 } else { 0.0 },
                basis,
                free.max(0.0),
            )
        };
        // The Text: stretched to its View (never narrower than its padding), its lines at what
        // is left inside the padding.
        let text_box = text_w.max(2.0 * CTA_PAD);
        let lines = lines(text_box - 2.0 * CTA_PAD);
        let text_h = text_side(lines as f64 * m.line14, s);
        let text_view = frame.child(text_x, (bh - text_h) / 2.0, text_w, text_h, false, s);
        let text = text_view.child(0.0, 0.0, text_box, text_h, true, s);
        let (iw, ih) = (text_side(m.icon[0], s), text_side(m.icon[1], s));
        let icon_view = frame.child(text_x + text_w, (bh - ih) / 2.0, icon_w, ih, false, s);
        let icon = icon_view.child((icon_w - iw) / 2.0, 0.0, iw, ih, true, s);
        ConfirmGeom {
            frame,
            text_view,
            text,
            lines,
            icon,
        }
    }
}

/// The press feedback, kept together so a shared pressto module can replace `Pressto`.
mod press {
    use super::*;
    use reanimated::{Easing, Timing, GENTLE};

    /// pressable-scale.tsx's PressableScale (RNGH Tap): the finger, its row, its touch-down
    /// time, and each row's scale.
    pub(super) struct RowTap {
        pub(super) finger: Option<(u32, usize, f64)>,
        pub(super) scales: [Spring; ITEMS],
    }

    impl RowTap {
        pub(super) fn new() -> RowTap {
            RowTap {
                finger: None,
                scales: [Spring::at(1.0); ITEMS],
            }
        }

        fn spring(&mut self, row: usize, to: f64) {
            let s = &mut self.scales[row];
            let v = if s.running { s.velocity } else { 0.0 };
            s.to_clamped(to, v, GENTLE);
        }

        /// onTouchesDown: withSpring(0.9, { overshootClamping }).
        pub(super) fn down(&mut self, id: u32, row: usize, ms: f64) {
            self.finger = Some((id, row, ms));
            self.spring(row, ROW_PRESS_SCALE);
        }

        /// onFinalize (ended, failed or cancelled): withSpring(1, { overshootClamping }).
        pub(super) fn finalize(&mut self) {
            if let Some((_, row, _)) = self.finger.take() {
                self.spring(row, 1.0);
            }
        }

        pub(super) fn step(&mut self, now: f64) -> bool {
            let mut moving = false;
            for s in &mut self.scales {
                moving |= s.step(now);
            }
            moving
        }
    }

    /// pressto's PressableScale: active while a finger that came down on it is down.
    pub(super) struct Pressto {
        pub(super) progress: Timing,
        pub(super) finger: Option<u32>,
    }

    impl Pressto {
        pub(super) fn new() -> Pressto {
            Pressto {
                progress: Timing::at(0.0),
                finger: None,
            }
        }

        /// onBegan / onActivated: active.
        pub(super) fn down(&mut self, id: u32) {
            self.finger = Some(id);
            self.progress
                .to(1.0, PRESSTO_MS, Easing::bezier(0.25, 0.1, 0.25, 1.0));
        }

        /// The finger lifts or is taken: whether it was this press's.
        pub(super) fn up(&mut self, id: u32) -> bool {
            if self.finger != Some(id) {
                return false;
            }
            self.finger = None;
            self.progress
                .to(0.0, PRESSTO_MS, Easing::bezier(0.25, 0.1, 0.25, 1.0));
            true
        }

        /// interpolate(progress, [0, 1], [baseScale 1, minScale 0.96]).
        pub(super) fn scale(&self) -> f64 {
            interpolate(
                self.progress.value,
                &[0.0, 1.0],
                &[1.0, PRESSTO_MIN_SCALE],
                Extrapolation::Extend,
            )
        }
    }
}

/// Who a finger belongs to (UIKit's hit test at touch-down).
#[derive(Clone, Copy, Debug, PartialEq)]
enum Touch {
    Confirm(u32),
    Sheet(u32),
    Backdrop(u32),
    List(u32),
}

impl Touch {
    fn id(&self) -> u32 {
        match *self {
            Touch::Confirm(id) | Touch::Sheet(id) | Touch::Backdrop(id) | Touch::List(id) => id,
        }
    }
}

/// The demo's fonts (None where the system face can't be read: the web).
struct Fonts {
    /// Bold 14: the titles and "ADD TO CART".
    bold: Font,
    /// 14: the descriptions and the sheet's message.
    body: Font,
    /// Bold 20: the sheet's title.
    heading: Font,
    /// Bold 10: the badges.
    badge: Font,
    /// Feather 18.
    icon: Font,
}

impl Fonts {
    fn load() -> Option<Fonts> {
        Some(Fonts {
            bold: skia::match_ui_font(14.0, 700.0)?,
            body: skia::match_ui_font(14.0, 400.0)?,
            heading: skia::match_ui_font(20.0, 700.0)?,
            badge: skia::match_ui_font(10.0, 700.0)?,
            icon: Font::new(FEATHER, ICON_SIZE).map(Font::with_ui_layout)?,
        })
    }

    fn metrics(&self) -> Metrics {
        let line = |f: &Font| gfx::line_height(f) as f64;
        Metrics {
            line14: line(&self.body),
            line20: line(&self.heading),
            line10: line(&self.badge),
            icon: [self.icon.advance_width(CART) as f64, line(&self.icon)],
            cta: self.bold.advance_width(CTA) as f64,
        }
    }
}

/// Where each pre-drawn layer sits in the atlas (device pixels: the layer's box origin) and the
/// box it covers (points, relative to its own view).
#[derive(Clone, Debug, Default)]
struct Atlas {
    size: [u32; 2],
    photo: [f64; 2],
    icon: [f64; 2],
    cta: [f64; 2],
    title: [f64; 2],
    message: [f64; 2],
    /// Each row's badge (circle and count): its origin, and its box relative to the badge's
    /// top-left (the count may overhang the circle).
    badges: Vec<([f64; 2], [f64; 4])>,
}

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AddToCart::new())
}

struct AddToCart {
    safe_top: f64,
    layout: Layout,
    fonts: Option<Fonts>,
    titles: Vec<String>,
    counts: [u32; ITEMS],
    count_text: Vec<String>,
    /// The description's lines at its width: the first line's range and the truncated rest.
    description: (usize, usize),
    description_tail: String,
    description_lines: usize,
    message_lines: Vec<(usize, usize)>,
    scratch: Vec<(usize, usize)>,
    scroll: UiScroll,
    /// animationProgress.
    progress: Spring,
    /// onDismiss's withSpring callback is armed (cleared when replaced).
    dismissing: bool,
    /// layoutData: pageX, pageY, width, height.
    data: Option<[f64; 4]>,
    /// selectedIndex.
    selected: Option<usize>,
    tap: press::RowTap,
    pressto: press::Pressto,
    touch: Option<Touch>,
    posted: Vec<String>,
    now: f64,
    atlas: Atlas,
    atlas_dirty: bool,
    canvas: Canvas,
    layer_canvas: Canvas,
    renderer: Renderer,
    layer_renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    generation: u32,
    photo: Images,
    atlas: Images,
    atlas_view: wgpu::TextureView,
    atlas_size: [u32; 2],
}

/// The photo with its edge pixels repeated one more round (clamped sampling at its border),
/// opaque RGBA.
fn photo_padded() -> skia::Image {
    let rgb = miniz_oxide::inflate::decompress_to_vec_zlib(PHOTO).unwrap_or_default();
    let [w, h] = PHOTO_PX;
    let (pw, ph) = (w + 2, h + 2);
    let mut rgba = vec![200u8; (pw * ph * 4) as usize];
    if rgb.len() == (w * h * 3) as usize {
        for y in 0..ph {
            let sy = y.saturating_sub(1).min(h - 1);
            for x in 0..pw {
                let sx = x.saturating_sub(1).min(w - 1);
                let s = ((sy * w + sx) * 3) as usize;
                let d = ((y * pw + x) * 4) as usize;
                rgba[d..d + 3].copy_from_slice(&rgb[s..s + 3]);
                rgba[d + 3] = 255;
            }
        }
    }
    skia::Image::from_rgba(pw, ph, rgba)
}

/// `text` cut at a character so that it and "…" fit `width` (TextKit's tail truncation of a
/// last line: the whole rest of the paragraph), into `out`; all of it when it fits.
fn truncate_tail(font: &Font, text: &str, width: f32, out: &mut String) {
    out.clear();
    if font.advance_width(text) <= width {
        out.push_str(text);
        return;
    }
    let mut end = 0;
    let mut probe = String::with_capacity(text.len() + 3);
    for (i, c) in text.char_indices() {
        let next = i + c.len_utf8();
        probe.clear();
        probe.push_str(&text[..next]);
        probe.push('\u{2026}');
        if font.advance_width(&probe) > width {
            break;
        }
        end = next;
    }
    out.push_str(&text[..end]);
    out.push('\u{2026}');
}

/// Lines `text` takes wrapped at `width` (TextKit's word wrap).
fn line_count(font: &Font, text: &str, width: f64, scratch: &mut Vec<(usize, usize)>) -> usize {
    crate::email_demo::wrap(font, text, 0.0, width as f32, scratch);
    scratch.len().max(1)
}

impl AddToCart {
    fn new() -> AddToCart {
        AddToCart {
            safe_top: 0.0,
            layout: Layout::default(),
            fonts: None,
            titles: (0..ITEMS).map(|i| format!("Item {i}")).collect(),
            counts: [0; ITEMS],
            count_text: vec![String::new(); ITEMS],
            description: (0, 0),
            description_tail: String::new(),
            description_lines: 0,
            message_lines: Vec::new(),
            scratch: Vec::new(),
            scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
            progress: Spring::at(0.0),
            dismissing: false,
            data: None,
            selected: None,
            tap: press::RowTap::new(),
            pressto: press::Pressto::new(),
            touch: None,
            posted: Vec::new(),
            now: 0.0,
            atlas: Atlas::default(),
            atlas_dirty: true,
            canvas: Canvas::default(),
            layer_canvas: Canvas::default(),
            renderer: Renderer::default(),
            layer_renderer: Renderer::default(),
            gpu: None,
        }
    }

    /// The layout for this window; the texts wrapped for it.
    fn lay_out(&mut self, w: f64, h: f64, s: f64) {
        let l = &self.layout;
        if l.metrics.is_some() && (l.w, l.h, l.s, l.safe_top) == (w, h, s, self.safe_top) {
            return;
        }
        if self.fonts.is_none() {
            self.fonts = Fonts::load();
        }
        // Without fonts (the web), the iOS SF and Feather numbers.
        let m = self.fonts.as_ref().map_or(
            Metrics {
                line14: 16.70703125,
                line20: 23.8671875,
                line10: 11.93359375,
                icon: [18.0, 18.4921875],
                cta: 95.9,
            },
            Fonts::metrics,
        );
        self.layout = Layout::new(w, h, s, self.safe_top, m);
        let max = (self.layout.content_h - h).max(0.0);
        self.scroll.max = max;
        self.scroll.port = h;
        self.scroll.offset = self.scroll.offset.min(max);
        if let Some(f) = self.fonts.as_ref() {
            let width = self.layout.rows[0].description.size[0] as f32;
            crate::email_demo::wrap(&f.body, DESCRIPTION, 0.0, width, &mut self.scratch);
            self.description_lines = self.scratch.len().min(2);
            self.description = self.scratch.first().copied().unwrap_or((0, 0));
            self.description_tail.clear();
            if let Some(&(start, _)) = self.scratch.get(1) {
                truncate_tail(
                    &f.body,
                    &DESCRIPTION[start..],
                    width,
                    &mut self.description_tail,
                );
            }
            let mw = self.layout.sheet.message.size[0] as f32;
            crate::email_demo::wrap(&f.body, SHEET_MESSAGE, 0.0, mw, &mut self.message_lines);
            // The message's Text box: its lines (one, the layout assumed).
            let n = self.message_lines.len().max(1) as f64;
            let sh = self.layout.sheet;
            let view = sh
                .sheet
                .child(0.0, 0.0, w, SHEET_H - SHEET_OFFSET, false, s);
            let title_h = text_side(m.line20, s);
            self.layout.sheet.message = view.child(
                SHEET_PAD_H * w,
                SHEET_PAD_V + title_h + MESSAGE_GAP,
                w - 2.0 * SHEET_PAD_H * w,
                text_side(n * m.line14, s),
                true,
                s,
            );
        }
        self.atlas_dirty = true;
    }

    /// The scroll's offset as drawn (UIScrollView's contentOffset is on the pixel grid).
    fn offset(&self) -> f64 {
        let s = self.layout.s.max(1.0);
        (self.scroll.offset * s).round() / s
    }

    fn p(&self) -> f64 {
        self.progress.value
    }

    /// The ConfirmButton now.
    fn confirm(&mut self) -> Option<ConfirmGeom> {
        let data = self.data?;
        let p = self.p();
        let scratch = std::cell::RefCell::new(std::mem::take(&mut self.scratch));
        let g = self
            .layout
            .confirm(p, data, |width| match self.fonts.as_ref() {
                Some(f) => line_count(&f.bold, CTA, width, &mut scratch.borrow_mut()),
                None => 1,
            });
        self.scratch = scratch.into_inner();
        Some(g)
    }

    /// The sheet's translateY.
    fn sheet_ty(&self) -> f64 {
        interpolate(
            self.p(),
            &[0.0, 1.0],
            &[SHEET_H, SHEET_OFFSET],
            Extrapolation::Extend,
        )
    }

    /// A point in row `i`'s PressableScale View (its bounds' coordinates, through its scale
    /// about its centre), from a window point.
    fn press_local(&self, i: usize, x: f32, y: f32) -> (f64, f64) {
        let p = self.layout.rows[i].press;
        let k = self.tap.scales[i].value.max(1e-6);
        let (cx, cy) = (
            p.at[0] + BUTTON / 2.0,
            p.at[1] - self.offset() + BUTTON / 2.0,
        );
        (
            BUTTON / 2.0 + (x as f64 - cx) / k,
            BUTTON / 2.0 + (y as f64 - cy) / k,
        )
    }

    /// The row whose buy button (or badge) a touch-down at (x, y) lands on.
    fn press_hit(&self, x: f32, y: f32) -> Option<usize> {
        (0..ITEMS).find(|&i| {
            let (lx, ly) = self.press_local(i, x, y);
            let inside = (0.0..BUTTON).contains(&lx) && (0.0..BUTTON).contains(&ly);
            let g = self.layout.rows[i];
            let (bx, by) = (g.badge.at[0] - g.press.at[0], g.badge.at[1] - g.press.at[1]);
            let badge_visible = self.counts[i] > 0 && self.badge_opacity(i) >= 0.01;
            inside
                || (badge_visible
                    && (bx..bx + BADGE).contains(&lx)
                    && (by..by + BADGE).contains(&ly))
        })
    }

    fn badge_opacity(&self, i: usize) -> f64 {
        if self.selected == Some(i) {
            (1.0 - self.p()).powi(2)
        } else {
            1.0
        }
    }

    /// Whether the ConfirmButton (shown, through pressto's scale) is under (x, y).
    fn confirm_hit(&mut self, x: f32, y: f32) -> bool {
        let Some(g) = self.confirm() else {
            return false;
        };
        let k = self.pressto.scale();
        let f = g.frame;
        let (cx, cy) = (f.at[0] + f.size[0] / 2.0, f.at[1] + f.size[1] / 2.0);
        let (lx, ly) = (
            (x as f64 - cx) / k + f.size[0] / 2.0,
            (y as f64 - cy) / k + f.size[1] / 2.0,
        );
        (0.0..f.size[0]).contains(&lx) && (0.0..f.size[1]).contains(&ly)
    }

    fn sheet_hit(&self, y: f32) -> bool {
        let top = self.layout.sheet.sheet.at[1] + self.sheet_ty();
        (y as f64) >= top && (y as f64) < top + SHEET_H
    }

    /// onTap (JS): cancelAnimation, progress 0, layoutData, selectedIndex, withSpring(1).
    fn on_tap(&mut self, row: usize) {
        let g = self.layout.rows[row].press;
        // measure(viewRef): the button's frame in the window (its press scale is not in the
        // shadow tree), the scroll's offset taken off.
        self.data = Some([g.at[0], g.at[1] - self.offset(), g.size[0], g.size[1]]);
        self.progress.set(0.0);
        self.dismissing = false;
        self.selected = Some(row);
        gfx::spring_to(&mut self.progress, 1.0, SPRING_MS, SPRING_RATIO);
    }

    /// onDismiss: withSpring(0), the callback clearing the selection when it completes.
    fn on_dismiss(&mut self) {
        let was_running = self.progress.running;
        if !was_running && self.progress.value == 0.0 {
            // The value is the target already: the callback runs at once, finished.
            self.dismissing = false;
            self.data = None;
            self.selected = None;
            return;
        }
        gfx::spring_to(&mut self.progress, 0.0, SPRING_MS, SPRING_RATIO);
        self.dismissing = true;
    }

    /// onConfirm: count the selected item, then dismiss.
    fn on_confirm(&mut self) {
        let Some(i) = self.selected else { return };
        self.counts[i] += 1;
        self.count_text[i].clear();
        use std::fmt::Write;
        let _ = write!(self.count_text[i], "{}", self.counts[i]);
        self.atlas_dirty = true;
        self.on_dismiss();
    }

    /// The row Tap fails (or is cancelled): onFinalize.
    fn tap_fail(&mut self) {
        self.tap.finalize();
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at: f64) {
        match phase {
            Phase::Down => {
                if self.touch.is_some() {
                    return;
                }
                let touch = if self.confirm_hit(x, y) {
                    self.pressto.down(id);
                    Touch::Confirm(id)
                } else if self.sheet_hit(y) {
                    Touch::Sheet(id)
                } else if self.p() != 0.0 {
                    Touch::Backdrop(id)
                } else {
                    let caught = self.scroll.moving();
                    self.scroll.input(id, Phase::Down, y, x, at, true);
                    if !caught {
                        if let Some(i) = self.press_hit(x, y) {
                            self.tap.down(id, i, at);
                        }
                    }
                    Touch::List(id)
                };
                self.touch = Some(touch);
            }
            Phase::Move => {
                if let Some(Touch::List(t)) = self.touch {
                    if t != id {
                        return;
                    }
                    self.scroll.input(id, Phase::Move, y, x, at, true);
                    if let Some((_, row, _)) = self.tap.finger {
                        let (lx, ly) = self.press_local(row, x, y);
                        let outside = !((0.0..BUTTON).contains(&lx) && (0.0..BUTTON).contains(&ly));
                        // shouldCancelWhenOutside, or the scroll view's pan began.
                        if outside || self.scroll.dragging() {
                            self.tap_fail();
                        }
                    }
                }
            }
            Phase::Up | Phase::Cancel => {
                let Some(touch) = self.touch else { return };
                if touch.id() != id {
                    return;
                }
                self.touch = None;
                match touch {
                    Touch::Confirm(_) => {
                        let inside = self.confirm_hit(x, y);
                        if self.pressto.up(id) && phase == Phase::Up && inside {
                            // PressablesConfig's onPress, then the button's.
                            self.posted.push("haptic:selection".into());
                            self.on_confirm();
                        }
                    }
                    Touch::Backdrop(_) => {
                        if phase == Phase::Up {
                            self.on_dismiss();
                        }
                    }
                    Touch::Sheet(_) => {}
                    Touch::List(_) => {
                        self.scroll.input(id, phase, y, x, at, true);
                        if let Some((_, row, _)) = self.tap.finger {
                            if phase == Phase::Up {
                                // onTouchesUp → onPress (measure, onTap), then onFinalize.
                                self.on_tap(row);
                            }
                            self.tap_fail();
                        }
                    }
                }
            }
        }
    }

    /// Advances everything to `now`; whether anything still moves.
    fn step(&mut self, now: f64) -> bool {
        self.now = now;
        let mut moving = self.scroll.step(now);
        let was = self.progress.running;
        moving |= self.progress.step(now);
        if was && !self.progress.running && self.dismissing {
            self.dismissing = false;
            self.data = None;
            self.selected = None;
        }
        if let Some((_, _, down)) = self.tap.finger {
            // maxDuration(5000): cancelled after 5 s held.
            if now - down >= TAP_MAX_MS {
                self.tap_fail();
            }
        }
        moving |= self.tap.step(now);
        moving |= self.pressto.progress.step(now);
        moving || self.touch.is_some()
    }

    /// Plans the atlas: every layer's place.
    fn plan_atlas(&mut self) {
        let (Some(f), Some(m)) = (self.fonts.as_ref(), self.layout.metrics) else {
            self.atlas = Atlas {
                size: [1, 1],
                ..Atlas::default()
            };
            return;
        };
        let s = self.layout.s;
        let px = |v: f64| (v * s).ceil();
        let mut y = GUTTER;
        let mut width: f64 = 0.0;
        let mut take = |w: f64, h: f64| {
            let at = [GUTTER, y];
            y += h + 2.0 * GUTTER;
            width = width.max(w + 2.0 * GUTTER);
            at
        };
        // The photo's padded copy starts a pixel above and left of its origin.
        let photo = take(PHOTO_PX[0] as f64 + 2.0, PHOTO_PX[1] as f64 + 2.0);
        let photo = [photo[0] + 1.0, photo[1] + 1.0];
        let icon = self.layout.rows[0].icon;
        let icon_at = take(px(icon.size[0]), px(icon.size[1]));
        let cta = take(
            px(text_side(m.cta, s) + 2.0 * CTA_PAD),
            px(text_side(m.line14, s)),
        );
        let sh = self.layout.sheet;
        let title = take(px(sh.title.size[0]), px(sh.title.size[1]));
        let message = take(px(sh.message.size[0]), px(sh.message.size[1]));
        let mut badges = Vec::with_capacity(ITEMS);
        for i in 0..ITEMS {
            let bx = badge_text(&self.layout, f, &self.count_text[i], i);
            let r = [
                bx.0.min(0.0),
                bx.1.min(0.0),
                (bx.0 + bx.2).max(BADGE),
                (bx.1 + bx.3).max(BADGE),
            ];
            let at = take(px(r[2] - r[0]), px(r[3] - r[1]));
            badges.push((at, [r[0], r[1], r[2] - r[0], r[3] - r[1]]));
        }
        self.atlas = Atlas {
            size: [width.ceil() as u32, y.ceil() as u32],
            photo,
            icon: icon_at,
            cta,
            title,
            message,
            badges,
        };
    }

    /// Records the atlas's layers into `layer_canvas` (points at scale s; origin top-left).
    fn record_atlas(&mut self) {
        let s = self.layout.s as f32;
        let c = &mut self.layer_canvas;
        c.begin(s);
        let Some(f) = self.fonts.as_ref() else { return };
        let a = &self.atlas;
        let pt = |v: [f64; 2]| (v[0] as f32 / s, v[1] as f32 / s);
        // The photo (padded by its edge), one texel per pixel.
        let (ox, oy) = pt([a.photo[0] - 1.0, a.photo[1] - 1.0]);
        let (pw, ph) = ((PHOTO_PX[0] + 2) as f32, (PHOTO_PX[1] + 2) as f32);
        c.draw_rect(
            ox,
            oy,
            pw / s,
            ph / s,
            &Paint::image(
                skia::ImageRef {
                    layer: 0,
                    width: pw,
                    height: ph,
                },
                Matrix::translate(-ox, -oy).then(Matrix::scale(s, s)),
            ),
        );
        let white = Paint::fill(Color::WHITE);
        let black = Paint::fill(Color::BLACK);
        // An RN Text's backing store: the glyphs cut at its frame.
        let text = |c: &mut Canvas,
                    at: [f64; 2],
                    size: [f64; 2],
                    draw: &mut dyn FnMut(&mut Canvas, f32, f32)| {
            let (x, y) = pt(at);
            c.save();
            c.clip_rect(x, y, size[0] as f32, size[1] as f32);
            draw(c, x, y);
            c.restore();
        };
        let icon = self.layout.rows[0].icon;
        text(c, a.icon, icon.size, &mut |c, x, y| {
            c.draw_text(CART, x, gfx::baseline(&f.icon, y), &f.icon, &white)
        });
        let m = self.layout.metrics.unwrap();
        let cta_size = [
            text_side(m.cta, self.layout.s) + 2.0 * CTA_PAD,
            text_side(m.line14, self.layout.s),
        ];
        text(c, a.cta, cta_size, &mut |c, x, y| {
            c.draw_text(
                CTA,
                x + CTA_PAD as f32,
                gfx::baseline(&f.bold, y),
                &f.bold,
                &white,
            )
        });
        let sh = self.layout.sheet;
        text(c, a.title, sh.title.size, &mut |c, x, y| {
            c.draw_text(
                SHEET_TITLE,
                x,
                gfx::baseline(&f.heading, y),
                &f.heading,
                &black,
            )
        });
        let line = gfx::line_height(&f.body);
        let lines = &self.message_lines;
        text(c, a.message, sh.message.size, &mut |c, x, y| {
            for (k, &(i, j)) in lines.iter().enumerate() {
                c.draw_text(
                    &SHEET_MESSAGE[i..j],
                    x,
                    gfx::baseline(&f.body, y + k as f32 * line),
                    &f.body,
                    &black,
                );
            }
        });
        // Each badge: the circle (radius 10 on 15: CA's clamp to 7.5) and its count, centred
        // in the ceiled Text box.
        let red = Paint::fill(Color::view_hex(BADGE_COLOR));
        for i in 0..ITEMS {
            if self.counts[i] == 0 {
                continue;
            }
            let (at, r) = a.badges[i];
            let (x, y) = pt(at);
            let (bx, by) = (x - r[0] as f32, y - r[1] as f32);
            c.draw_rrect(bx, by, BADGE as f32, BADGE as f32, BADGE as f32 / 2.0, &red);
            let t = badge_text(&self.layout, f, &self.count_text[i], i);
            let adv = f.badge.advance_width(&self.count_text[i]);
            c.save();
            c.clip_rect(bx + t.0 as f32, by + t.1 as f32, t.2 as f32, t.3 as f32);
            c.draw_text(
                &self.count_text[i],
                bx + t.0 as f32 + (t.2 as f32 - adv) / 2.0,
                gfx::baseline(&f.badge, by + t.1 as f32),
                &f.badge,
                &white,
            );
            c.restore();
        }
    }

    /// Draws a pre-drawn layer: its box `frame` (points, where it shows untransformed) from the
    /// atlas at `origin` (its box's top-left, pixels), sampled bilinearly through the canvas's
    /// current transform, at `opacity`.
    fn layer(
        c: &mut Canvas,
        images: &Images,
        origin: [f64; 2],
        frame: [f32; 4],
        s: f32,
        opacity: f32,
    ) {
        if opacity <= 0.0 {
            return;
        }
        let g = GUTTER as f32 / s;
        let to = Matrix::translate(-frame[0], -frame[1])
            .then(Matrix::scale(s, s))
            .then(Matrix::translate(origin[0] as f32, origin[1] as f32));
        c.draw_rect(
            frame[0] - g,
            frame[1] - g,
            frame[2] + 2.0 * g,
            frame[3] + 2.0 * g,
            &Paint::image(images.image(0), to).with_opacity(opacity),
        );
    }

    fn record(&mut self, images: &Images) {
        let (w, h) = (self.layout.w as f32, self.layout.h as f32);
        let s = self.layout.s as f32;
        let p = self.p();
        let o = self.offset() as f32;
        let confirm = self.confirm();
        let ty = self.sheet_ty() as f32;
        let c = &mut self.canvas;
        c.begin(s);
        // styles.container: white.
        c.draw_rect(0.0, 0.0, w, h, &Paint::fill(Color::WHITE));
        let fonts = self.fonts.as_ref();
        let a = &self.atlas;
        for i in 0..ITEMS {
            let g = self.layout.rows[i];
            let top = g.row.y() - o;
            if top > h + 30.0 || top + ROW_H as f32 + 30.0 < 0.0 {
                continue;
            }
            let (rx, rw, rh) = (g.row.x(), g.row.w(), g.row.h());
            // RCTBoxShadow: outside the view only.
            c.save();
            c.clip_with(|b| {
                skia::add_rect(b, rx - 40.0, top - 40.0, rw + 80.0, rh + 80.0);
                skia::add_rrect_hole(b, rx, top, rw, rh, RADIUS);
            });
            c.draw_rrect_shadow(
                rx,
                top + SHADOW_Y,
                rw,
                rh,
                RADIUS,
                SHADOW_SIGMA,
                Color::BLACK.alpha(SHADOW_ALPHA),
            );
            c.restore();
            c.draw_continuous_rrect(rx, top, rw, rh, RADIUS, &Paint::fill(Color::WHITE));
            // The photo, aspect-filled, its circular radius 10.
            let (ix, iy, iw, ih) = (g.image.x(), g.image.y() - o, g.image.w(), g.image.h());
            let k = (iw as f64 / PHOTO_PT[0]).max(ih as f64 / PHOTO_PT[1]);
            let (dx, dy) = (
                ix as f64 + (iw as f64 - PHOTO_PT[0] * k) / 2.0,
                iy as f64 + (ih as f64 - PHOTO_PT[1] * k) / 2.0,
            );
            let px_per_pt = (PHOTO_PX[0] as f64 / PHOTO_PT[0] / k) as f32;
            let to = Matrix::translate(-dx as f32, -dy as f32)
                .then(Matrix::scale(px_per_pt, px_per_pt))
                .then(Matrix::translate(a.photo[0] as f32, a.photo[1] as f32));
            c.save();
            c.clip_rrect(ix, iy, iw, ih, RADIUS);
            c.draw_rect(ix, iy, iw, ih, &Paint::image(images.image(0), to));
            c.restore();
            if let Some(f) = fonts {
                c.draw_text(
                    &self.titles[i],
                    g.title.x(),
                    gfx::baseline(&f.bold, g.title.y() - o),
                    &f.bold,
                    &Paint::fill(Color::BLACK),
                );
                let line = gfx::line_height(&f.body);
                let gray = Paint::fill(Color::BLACK.alpha(0.8));
                let (dx, dy) = (g.description.x(), g.description.y() - o);
                c.save();
                c.clip_rect(dx, dy, g.description.w(), g.description.h());
                let (a0, a1) = self.description;
                c.draw_text(
                    &DESCRIPTION[a0..a1],
                    dx,
                    gfx::baseline(&f.body, dy),
                    &f.body,
                    &gray,
                );
                if self.description_lines > 1 {
                    c.draw_text(
                        &self.description_tail,
                        dx,
                        gfx::baseline(&f.body, dy + line),
                        &f.body,
                        &gray,
                    );
                }
                c.restore();
            }
            // The PressableScale View: its scale about its centre.
            let k = self.tap.scales[i].value as f32;
            let (px, py) = (g.press.x(), g.press.y() - o);
            c.save();
            c.translate(px + BUTTON as f32 / 2.0, py + BUTTON as f32 / 2.0);
            c.scale(k, k);
            c.translate(-(px + BUTTON as f32 / 2.0), -(py + BUTTON as f32 / 2.0));
            if self.selected != Some(i) {
                c.draw_continuous_rrect(
                    px,
                    py,
                    BUTTON as f32,
                    BUTTON as f32,
                    RADIUS,
                    &Paint::fill(Color::BLACK),
                );
                Self::layer(
                    c,
                    images,
                    a.icon,
                    [g.icon.x(), g.icon.y() - o, g.icon.w(), g.icon.h()],
                    s,
                    1.0,
                );
            }
            if self.counts[i] > 0 {
                let (at, r) = a.badges[i];
                let frame = [
                    g.badge.x() + r[0] as f32,
                    g.badge.y() - o + r[1] as f32,
                    r[2] as f32,
                    r[3] as f32,
                ];
                let opacity = if self.selected == Some(i) {
                    (1.0 - p).powi(2)
                } else {
                    1.0
                };
                Self::layer(c, images, at, frame, s, opacity as f32);
            }
            c.restore();
        }
        // Backdrop: rgba(0, 0, 0, 0.75) at opacity p.
        if p > 0.0 {
            c.draw_rect(
                0.0,
                0.0,
                w,
                h,
                &Paint::fill(Color::BLACK.alpha(BACKDROP_ALPHA * p.min(1.0) as f32)),
            );
        }
        // BottomSheet, translated; its texts' layers resampled at the fractional offset.
        let sh = self.layout.sheet;
        if sh.sheet.y() + ty < h {
            c.draw_continuous_rrect(
                0.0,
                sh.sheet.y() + ty,
                w,
                SHEET_H as f32,
                SHEET_RADIUS,
                &Paint::fill(Color::WHITE),
            );
            let opacity = interpolate(p, &[0.2, 1.0], &[0.0, 1.0], Extrapolation::Clamp) as f32;
            c.save();
            c.translate(0.0, ty);
            Self::layer(
                c,
                images,
                a.title,
                [sh.title.x(), sh.title.y(), sh.title.w(), sh.title.h()],
                s,
                opacity,
            );
            Self::layer(
                c,
                images,
                a.message,
                [
                    sh.message.x(),
                    sh.message.y(),
                    sh.message.w(),
                    sh.message.h(),
                ],
                s,
                opacity,
            );
            c.restore();
        }
        // ConfirmButton.
        if let Some(g) = confirm {
            let k = self.pressto.scale() as f32;
            let fr = g.frame;
            let (cx, cy) = (fr.x() + fr.w() / 2.0, fr.y() + fr.h() / 2.0);
            c.save();
            c.translate(cx, cy);
            c.scale(k, k);
            c.translate(-cx, -cy);
            c.draw_continuous_rrect(
                fr.x(),
                fr.y(),
                fr.w(),
                fr.h(),
                RADIUS,
                &Paint::fill(Color::BLACK),
            );
            let opacity = interpolate(p, &[0.5, 1.0], &[0.0, 1.0], Extrapolation::Clamp) as f32;
            if opacity > 0.0 {
                if g.lines == 1 {
                    let t = g.text;
                    let slot_w =
                        (text_side(self.layout.metrics.map_or(0.0, |m| m.cta), self.layout.s)
                            + 2.0 * CTA_PAD) as f32;
                    Self::layer(
                        c,
                        images,
                        a.cta,
                        [t.x(), t.y(), t.w().min(slot_w), t.h()],
                        s,
                        opacity,
                    );
                } else if let Some(f) = fonts {
                    // Wrapped (a narrow window): the lines drawn as they are.
                    let t = g.text;
                    crate::email_demo::wrap(
                        &f.bold,
                        CTA,
                        0.0,
                        (t.w() - 2.0 * CTA_PAD as f32).max(0.0),
                        &mut self.scratch,
                    );
                    let line = gfx::line_height(&f.bold);
                    c.save();
                    c.clip_rect(t.x(), t.y(), t.w(), t.h());
                    let paint = Paint::fill(Color::WHITE).with_opacity(opacity);
                    for (n, &(i, j)) in self.scratch.iter().enumerate() {
                        c.draw_text(
                            &CTA[i..j],
                            t.x() + CTA_PAD as f32,
                            gfx::baseline(&f.bold, t.y() + n as f32 * line),
                            &f.bold,
                            &paint,
                        );
                    }
                    c.restore();
                }
            }
            Self::layer(
                c,
                images,
                a.icon,
                [g.icon.x(), g.icon.y(), g.icon.w(), g.icon.h()],
                s,
                1.0,
            );
            c.restore();
        }
    }
}

/// Row `i`'s badge count Text for `text`: (x, y, w, h) relative to the badge's rounded top-left
/// (centred in the 15 pt badge, its box ceiled, its position floored).
fn badge_text(layout: &Layout, f: &Fonts, text: &str, i: usize) -> (f64, f64, f64, f64) {
    let s = layout.s;
    let g = layout.rows[i].badge;
    let bw = text_side(f.badge.advance_width(text) as f64, s);
    let bh = text_side(layout.metrics.map_or(0.0, |m| m.line10), s);
    let t = g.child((BADGE - bw) / 2.0, (BADGE - bh) / 2.0, bw, bh, true, s);
    (t.at[0] - g.at[0], t.at[1] - g.at[1], t.size[0], t.size[1])
}

impl Surface for AddToCart {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let safe_top = inputs
            .first()
            .map(|v| exact_gpu::json::number(v, "safeTop"))
            .transpose()?
            .unwrap_or(0.0);
        if safe_top != self.safe_top {
            self.safe_top = safe_top;
            if self.layout.metrics.is_some() {
                let (w, h, s) = (self.layout.w, self.layout.h, self.layout.s);
                self.layout = Layout::default();
                self.lay_out(w, h, s);
            }
        }
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
        let confirm = self.confirm().map(|g| g.frame);
        Some(format!(
            "{{\"progress\":{:.4},\"selected\":{},\"counts\":{:?},\"scroll\":{:.2},\"confirm\":{},\"held\":{}}}",
            self.p(),
            self.selected.map_or("null".to_string(), |i| i.to_string()),
            self.counts,
            self.scroll.offset + 0.0,
            confirm.map_or("null".to_string(), |f| format!("[{:.3},{:.3},{:.3},{:.3}]", f.at[0], f.at[1], f.size[0], f.size[1])),
            self.touch.is_some()
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
        self.lay_out(frame.width as f64, frame.height as f64, frame.scale as f64);
        let moving = self.step(frame.now_ms);
        if self
            .gpu
            .as_ref()
            .is_none_or(|g| g.generation != frame.shader_generation)
        {
            let photo = match self.gpu.take() {
                Some(g) => g.photo,
                None => Images::upload(device, queue, &[&photo_padded()]),
            };
            self.layer_renderer.set_images(&photo);
            let atlas = Images::target(device, 1, 1);
            let atlas_view = atlas.render_view();
            self.gpu = Some(Gpu {
                generation: frame.shader_generation,
                photo,
                atlas,
                atlas_view,
                atlas_size: [0, 0],
            });
            self.atlas_dirty = true;
        }
        if self.atlas_dirty {
            self.plan_atlas();
            let size = self.atlas.size;
            let gpu = self.gpu.as_mut().unwrap();
            if gpu.atlas_size != size {
                gpu.atlas = Images::target(device, size[0], size[1]);
                gpu.atlas_view = gpu.atlas.render_view();
                gpu.atlas_size = size;
                self.renderer.set_images(&gpu.atlas);
            }
            self.record_atlas();
            let gpu = self.gpu.as_ref().unwrap();
            self.layer_renderer.draw(
                device,
                queue,
                encoder,
                &self.layer_canvas,
                &gpu.atlas_view,
                wgpu::TextureFormat::Rgba8Unorm,
                size[0],
                size[1],
                wgpu::Color::TRANSPARENT,
            );
            self.atlas_dirty = false;
        }
        let gpu = self.gpu.take().unwrap();
        self.record(&gpu.atlas);
        self.gpu = Some(gpu);
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
            wgpu::Color::WHITE,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    const FRAME_MS: f64 = 1000.0 / 60.0;
    /// iOS's SF and Feather numbers (UIFont.lineHeight; Feather's hhea), so the layout checks
    /// don't depend on the Mac's fonts.
    const IOS: Metrics = Metrics {
        line14: 16.70703125,
        line20: 23.8671875,
        line10: 11.93359375,
        icon: [18.0, 18.4921875],
        cta: 95.939,
    };

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-3
    }

    fn at(n: Node, x: f64, y: f64, w: f64, h: f64) {
        assert!(
            close(n.at[0], x) && close(n.at[1], y) && close(n.size[0], w) && close(n.size[1], h),
            "{n:?} vs ({x}, {y}, {w}, {h})"
        );
    }

    /// exact/parity-tools/add-to-cart: `/tmp/add-to-cart-yoga 420 912 3 62 40 16.70703125 18
    /// 18.4921875 6 11.93359375 210 340 …` (React Native's Yoga).
    #[test]
    fn rows_and_sheet_sit_where_yoga_puts_them() {
        let l = Layout::new(420.0, 912.0, 3.0, 62.0, IOS);
        let g = l.rows[0];
        at(g.row, 21.0, 96.0, 378.0, 85.0);
        at(
            g.image,
            36.0,
            110.0 + 2.0 / 3.0,
            55.0 + 1.0 / 3.0,
            55.0 + 1.0 / 3.0,
        );
        at(
            g.title,
            101.0 + 1.0 / 3.0,
            110.0 + 2.0 / 3.0,
            234.0 + 2.0 / 3.0,
            17.0,
        );
        at(
            g.description,
            101.0 + 1.0 / 3.0,
            132.0 + 2.0 / 3.0,
            188.0,
            33.0 + 2.0 / 3.0,
        );
        at(g.press, 339.0, 118.0 + 2.0 / 3.0, 40.0, 40.0);
        at(
            g.icon,
            349.0 + 2.0 / 3.0,
            129.0 + 1.0 / 3.0,
            18.0 + 1.0 / 3.0,
            18.0 + 2.0 / 3.0,
        );
        at(g.badge, 366.0 + 2.0 / 3.0, 116.0 + 1.0 / 3.0, 15.0, 15.0);
        // The badge's "1" (6 wide, SF 10's line): (371, 117.667), 6.333 × 12.
        let bt = g.badge.child(
            (BADGE - text_side(6.0, 3.0)) / 2.0,
            (BADGE - text_side(IOS.line10, 3.0)) / 2.0,
            text_side(6.0, 3.0),
            text_side(IOS.line10, 3.0),
            true,
            3.0,
        );
        at(bt, 371.0, 117.0 + 2.0 / 3.0, 6.0 + 1.0 / 3.0, 12.0);
        at(l.sheet.sheet, 0.0, 612.0, 420.0, 300.0);
        at(l.sheet.title, 21.0, 632.0, 378.0, 24.0);
        at(l.sheet.message, 21.0, 666.0, 378.0, 17.0);
        // Row 7: 7 cells of 105 further down.
        at(
            l.rows[7].press,
            339.0,
            118.0 + 2.0 / 3.0 + 735.0,
            40.0,
            40.0,
        );
        assert!(close(l.content_h, 62.0 + 24.0 + 2100.0 + 100.0));
    }

    /// The runner's ConfirmButton (`… 95.939 30.34 19.45 37.8 3.67 0 0.01 0.3 0.37 0.5 0.75 0.9 1`:
    /// "ADD TO CART" 95.939 wide). The text's lines below p 0.5 (invisible) are not compared:
    /// the runner doesn't break a word wider than its line as TextKit does.
    #[test]
    fn the_confirm_button_lays_out_as_yoga_at_each_progress() {
        let l = Layout::new(420.0, 912.0, 3.0, 62.0, IOS);
        let g = l.rows[0].press;
        let data = [g.at[0], g.at[1], g.size[0], g.size[1]];
        // One line when it fits; else at least two (the runner's count at these widths).
        let lines = |width: f64| {
            if IOS.cta <= width {
                1
            } else if width >= 53.46 {
                2
            } else {
                3
            }
        };
        let check = |p: f64, frame: [f64; 4], tv: [f64; 4], icon: [f64; 2], text_visible: bool| {
            let c = l.confirm(p, data, lines);
            at(c.frame, frame[0], frame[1], frame[2], frame[3]);
            assert!(
                close(c.text_view.at[0], tv[0]) && close(c.text_view.size[0], tv[2]),
                "{p}: {:?}",
                c.text_view
            );
            if text_visible {
                at(c.text_view, tv[0], tv[1], tv[2], tv[3]);
            }
            assert!(
                close(c.icon.at[0], icon[0]) && close(c.icon.at[1], icon[1]),
                "{p}: {:?}",
                c.icon
            );
        };
        let t = |v: f64| (v * 3.0).round() / 3.0;
        check(
            0.0,
            [339.0, t(118.6667), 40.0, 40.0],
            [339.0, t(113.6667), t(40.3333), t(50.3333)],
            [370.0, t(129.3333)],
            false,
        );
        check(
            0.01,
            [t(335.6667), t(125.6667), t(43.6667), 40.0],
            [t(335.6667), 0.0, t(1.6667), 0.0],
            [349.0, t(136.3333)],
            false,
        );
        check(
            0.3,
            [t(243.6667), t(326.6667), t(141.3333), t(41.6667)],
            [t(243.6667), 0.0, 77.0, 0.0],
            [t(343.3333), 338.0],
            false,
        );
        check(
            0.5,
            [180.0, t(465.3333), 209.0, t(42.6667)],
            [180.0, 478.0, t(139.3333), 17.0],
            [345.0, t(477.3333)],
            true,
        );
        check(
            0.75,
            [t(100.6667), t(638.6667), t(293.3333), t(43.6667)],
            [t(100.6667), 652.0, 220.0, 17.0],
            [348.0, t(651.3333)],
            true,
        );
        check(
            0.37,
            [t(221.3333), t(375.3333), 165.0, t(41.6667)],
            [t(221.3333), 0.0, t(98.6667), 0.0],
            [344.0, 387.0],
            false,
        );
        check(
            0.9,
            [t(52.6667), t(742.6667), t(344.3333), t(44.6667)],
            [t(52.6667), t(756.3333), t(269.6667), 17.0],
            [350.0, t(755.6667)],
            true,
        );
        check(
            1.0,
            [21.0, 812.0, 378.0, 45.0],
            [21.0, 826.0, t(302.3333), 17.0],
            [t(351.6667), t(825.3333)],
            true,
        );
    }

    fn ready() -> AddToCart {
        let mut a = AddToCart::new();
        a.bind(&[Value::Number(62.0)], None).unwrap();
        a.lay_out(420.0, 912.0, 3.0);
        a
    }

    fn touch(a: &mut AddToCart, phase: Phase, x: f32, y: f32, ms: f64) {
        a.pointer(1, phase, x, y, ms);
    }

    /// Runs frames from `from` until nothing moves (or `until`); the time reached.
    fn settle(a: &mut AddToCart, from: f64, until: f64) -> f64 {
        let mut t = from;
        while a.step(t) && t < until {
            t += FRAME_MS;
        }
        t
    }

    fn button_centre(a: &AddToCart, i: usize) -> (f32, f32) {
        let p = a.layout.rows[i].press;
        (p.at[0] as f32 + 20.0, (p.at[1] - a.offset()) as f32 + 20.0)
    }

    #[test]
    fn a_tap_flies_the_button_down_and_confirming_counts_the_item() {
        let mut a = ready();
        let (x, y) = button_centre(&a, 2);
        touch(&mut a, Phase::Down, x, y, 0.0);
        a.step(16.0);
        a.step(100.0);
        assert!(
            a.tap.scales[2].value < 0.99,
            "pressed: {}",
            a.tap.scales[2].value
        );
        touch(&mut a, Phase::Up, x, y, 120.0);
        assert_eq!(a.selected, Some(2));
        let data = a.data.unwrap();
        assert!(
            close(data[0], 339.0)
                && close(data[1], a.layout.rows[2].press.at[1])
                && data[2] == 40.0
        );
        // The first frame shows p = 0 (valueSetter steps at the start's timestamp).
        a.step(130.0);
        assert_eq!(a.p(), 0.0);
        // withSpring(1, { dampingRatio 1, duration 500 }): critically damped, no overshoot.
        let mut t = 130.0;
        let mut last = 0.0;
        while a.step(t) {
            assert!(a.p() >= last - 1e-12 && a.p() <= 1.0, "{} at {t}", a.p());
            last = a.p();
            t += FRAME_MS;
            assert!(t < 2000.0);
        }
        assert_eq!(a.p(), 1.0);
        let g = a.confirm().unwrap();
        at(g.frame, 21.0, 812.0, 378.0, 45.0);
        // Its press: pressto, then onConfirm.
        let (cx, cy) = (200.0, 830.0);
        touch(&mut a, Phase::Down, cx, cy, t);
        assert!(matches!(a.touch, Some(Touch::Confirm(_))));
        touch(&mut a, Phase::Up, cx, cy, t + 80.0);
        assert_eq!(a.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(a.counts[2], 1);
        assert_eq!(a.selected, Some(2), "until the dismissal completes");
        let end = settle(&mut a, t + 90.0, t + 3000.0);
        assert!(end < t + 3000.0);
        assert_eq!((a.selected, a.data, a.p()), (None, None, 0.0));
    }

    #[test]
    fn the_backdrop_dismisses_without_counting() {
        let mut a = ready();
        let (x, y) = button_centre(&a, 0);
        touch(&mut a, Phase::Down, x, y, 0.0);
        touch(&mut a, Phase::Up, x, y, 50.0);
        let t = settle(&mut a, 60.0, 3000.0);
        // The sheet's area takes the touch and does nothing.
        touch(&mut a, Phase::Down, 200.0, 760.0, t);
        touch(&mut a, Phase::Up, 200.0, 760.0, t + 50.0);
        assert_eq!(a.p(), 1.0);
        touch(&mut a, Phase::Down, 200.0, 300.0, t + 100.0);
        touch(&mut a, Phase::Up, 200.0, 300.0, t + 150.0);
        assert!(a.progress.running && a.dismissing);
        settle(&mut a, t + 160.0, t + 3000.0);
        assert_eq!((a.selected, a.counts[0]), (None, 0));
    }

    #[test]
    fn a_drag_scrolls_the_list_and_fails_the_tap() {
        let mut a = ready();
        let (x, y) = button_centre(&a, 3);
        touch(&mut a, Phase::Down, x, y, 0.0);
        let mut t = 0.0;
        for k in 1..=10 {
            t = 120.0 + k as f64 * 16.0;
            touch(&mut a, Phase::Move, x - 1.0, y - 8.0 * k as f32, t);
        }
        assert!(a.scroll.offset > 40.0, "{}", a.scroll.offset);
        assert!(a.tap.finger.is_none());
        touch(&mut a, Phase::Up, x - 1.0, y - 80.0, t + 120.0);
        assert_eq!(a.selected, None);
        settle(&mut a, t + 130.0, t + 3000.0);
        assert_eq!(a.tap.scales[3].value, 1.0);
    }

    #[test]
    fn leaving_the_button_or_holding_five_seconds_fails_the_tap() {
        let mut a = ready();
        let (x, y) = button_centre(&a, 1);
        touch(&mut a, Phase::Down, x, y, 0.0);
        // 21 pt left of its centre: outside its 40 pt (no scroll: 9 pt is under the slop).
        touch(&mut a, Phase::Move, x - 21.0, y, 30.0);
        touch(&mut a, Phase::Move, x - 22.0, y, 46.0);
        touch(&mut a, Phase::Up, x - 22.0, y, 60.0);
        assert_eq!(a.selected, None);
        settle(&mut a, 70.0, 3000.0);
        touch(&mut a, Phase::Down, x, y, 4000.0);
        a.step(4000.0 + TAP_MAX_MS + 1.0);
        touch(&mut a, Phase::Up, x, y, 4000.0 + TAP_MAX_MS + 20.0);
        assert_eq!(a.selected, None);
    }

    #[test]
    fn a_touch_on_the_moving_list_only_stops_it() {
        let mut a = ready();
        touch(&mut a, Phase::Down, 200.0, 600.0, 0.0);
        let mut t = 0.0;
        for k in 1..=6 {
            t = k as f64 * 16.0;
            touch(&mut a, Phase::Move, 200.0, 600.0 - 30.0 * k as f32, t);
        }
        touch(&mut a, Phase::Up, 200.0, 420.0, t + 8.0);
        a.step(t + 16.0);
        assert!(a.scroll.moving());
        a.step(t + 32.0);
        let (x, y) = button_centre(&a, 2);
        touch(&mut a, Phase::Down, x, y, t + 40.0);
        assert!(a.tap.finger.is_none());
        touch(&mut a, Phase::Up, x, y, t + 60.0);
        assert_eq!(a.selected, None);
    }

    #[test]
    fn the_description_wraps_and_truncates_as_textkit() {
        let Some(f) = Fonts::load() else {
            return eprintln!("no system font; skipped");
        };
        let mut lines = Vec::new();
        crate::email_demo::wrap(&f.body, DESCRIPTION, 0.0, 188.0, &mut lines);
        assert!(lines.len() > 2);
        // The Mac's TextKit at 188: "Lorem, ipsum dolor sit amet" / "consectetur adipisicing elit…".
        assert_eq!(
            &DESCRIPTION[lines[0].0..lines[0].1],
            "Lorem, ipsum dolor sit amet"
        );
        let mut tail = String::new();
        truncate_tail(&f.body, &DESCRIPTION[lines[1].0..], 188.0, &mut tail);
        assert!(
            tail.starts_with("consectetur adipisicing elit") && tail.ends_with('\u{2026}'),
            "{tail}"
        );
    }

    fn frame(now: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms: now,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    #[test]
    fn renders_the_list_the_flight_and_the_sheet() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut a = ready();
        a.counts[1] = 3;
        a.count_text[1] = "3".into();
        let (img, _) = fixture::render(&gpu, &mut a, &frame(0.0)).unwrap();
        img.save("add-to-cart-rest");
        let px = |img: &fixture::Pixels, x: f32, y: f32| img.at((x * 3.0) as u32, (y * 3.0) as u32);
        // The first row's cart button: black at its corner, the row white, the badge red.
        assert_eq!(&px(&img, 342.0, 138.0)[..3], &[0, 0, 0]);
        assert_eq!(&px(&img, 300.0, 100.0)[..3], &[255, 255, 255]);
        let badge = px(&img, 374.0, 116.5 + 105.0 + 2.0);
        assert!(badge[0] > 180 && badge[1] < 80, "{badge:?}");
        // Tap row 0, then a frame mid-flight and the end.
        let (x, y) = button_centre(&a, 0);
        touch(&mut a, Phase::Down, x, y, 10.0);
        touch(&mut a, Phase::Up, x, y, 60.0);
        let (first, _) = fixture::render(&gpu, &mut a, &frame(70.0)).unwrap();
        first.save("add-to-cart-first-frame");
        let mut t = 70.0;
        while a.p() < 0.5 {
            t += FRAME_MS;
            a.step(t);
        }
        let (mid, _) = fixture::render(&gpu, &mut a, &frame(t)).unwrap();
        mid.save("add-to-cart-mid");
        let end = settle(&mut a, t, t + 3000.0);
        let (open, _) = fixture::render(&gpu, &mut a, &frame(end + FRAME_MS)).unwrap();
        open.save("add-to-cart-open");
        // The backdrop over the list: 0.25 of white.
        let d = px(&open, 10.0, 400.0);
        assert!((60..=68).contains(&d[0]), "{d:?}");
        // The sheet (white) at 712 + 20, the confirm button black at (21, 812).
        assert_eq!(&px(&open, 5.0, 760.0)[..3], &[255, 255, 255]);
        assert_eq!(&px(&open, 30.0, 834.0)[..3], &[0, 0, 0]);
    }
}
