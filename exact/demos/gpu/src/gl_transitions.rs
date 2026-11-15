//! A notes app whose way back from the "new note" screen is a GL transition: a directional warp
//! between two snapshots of the screen, from the screen being left to the home screen.
//!
//! - The whole demo is drawn here, so each screen can be drawn again as a snapshot. A snapshot is
//!   the live scene rendered into a texture on the frame it is taken.
//! - The text field and the "Empty Note" alert belong to the Contract. The field's text comes back
//!   as an input, so the snapshot draws it where the field shows it.
//! - "+" slides the add-note screen up. The check saves the note and runs the transition; the close
//!   runs it without saving. An empty note shows an alert instead.
//! - Cards: the masonry keys each card by its id inside its column, so a new note moves every card to
//!   the other column. Every card leaves and re-enters with a stagger, as on the first mount.
//! - Motion: cards fade and slide 25 pt in and out over 300 ms. The transition runs for 1.5 s, and the
//!   screen goes back 1 s in. The add-note screen slides up over 500 ms on a critically damped spring.
//!   That timing is not measured against the device.

use std::rc::Rc;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use pressto::{PressEvent, Pressable};
use reanimated::{Easing, Spring, Timing};
use skia::blur::GRAPHITE_FORMAT;
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::ui_scroll::{self, UiScroll};
use crate::{gfx, shaders};
use shaders::gl_transitions::{entry, module, Uniforms, GROUP_0, IMAGE1, IMAGE2, SMP, U};

/// Palette.
const BACKGROUND: u32 = 0xF0F0F0;
const SURFACE: u32 = 0xFFFFFF;
const PRIMARY: u32 = 0xEB6439;
const TEXT: u32 = 0x333333;
/// Height of the top button row, pt.
const BUTTON_ROW: f32 = 56.0;
/// Button size and corner radius, pt.
const BUTTON: f32 = 48.0;
/// Header row spacing, pt.
const HEADER: f32 = 50.0;
const HEADER_BELOW: f32 = 16.0;
const HEADER_PAD: f32 = 16.0;
/// Letter spacing of the title, pt.
const TITLE_SPACING: f32 = 0.6;
/// Gap between note columns and rows, pt.
const GAP: f32 = 35.0 / 3.0;
/// Note card corner radius, padding, line height and shadow.
const CARD_RADIUS: f32 = 10.0;
const CARD_PAD: f32 = 15.0;
const CARD_LINE: f32 = 24.0;
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.05;
/// Enter and exit animations: duration, offset and stagger per card.
const FADE_MS: f64 = 300.0;
const FADE_DY: f32 = 25.0;
const STAGGER_MS: f64 = 100.0;
/// Add-note screen spacing, pt.
const ADD_PAD: f32 = 8.0;
const BOX_TOP: f32 = 16.0;
const BOX_RADIUS: f32 = 8.0;
const BOX_MIN: f32 = 200.0;
const BOX_PAD: f32 = 16.0;
const LABEL_TOP: f32 = 8.0;
const LABEL_BELOW: f32 = 4.0;
const INPUT_TOP: f32 = 16.0;
const PLACEHOLDER: &str = "Write your ideas here...";
/// Timing of the transition, and when the screen goes back.
const TRANSITION_MS: f64 = 1500.0;
const BACK_MS: f64 = 1000.0;
/// Presentation and dismissal, not measured against the device.
const PRESENT_MS: f64 = 500.0;
/// The text field's placeholder colour.
const PLACEHOLDER_RGBA: [f32; 4] = [60.0 / 255.0, 60.0 / 255.0, 67.0 / 255.0, 0.3];

/// Icon font, cut to the plus, close and check glyphs.
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-gl-transitions-subset.ttf");
const PLUS: &str = "\u{F21A}";
const CLOSE: &str = "\u{F430}";
const CHECK: &str = "\u{F141}";

/// Starting notes.
const NOTES: [&str; 20] = [
    "Remember to buy groceries on the way back home from work. Don't forget the milk and eggs.",
    "Research new investment opportunities in the tech sector. Look into emerging startups and trends.",
    "Practice guitar chords for at least 30 minutes every day. Focus on mastering barre chords.",
    "Draft outline for upcoming presentation on climate change. Incorporate recent data and case studies.",
    "Plan weekend getaway with friends. Consider options for hiking or beach destinations.",
    "Schedule dentist appointment for annual check-up. Call to confirm insurance coverage beforehand.",
    "Start reading 'The Great Gatsby' for book club meeting next month. Take notes on themes and characters.",
    "Review Spanish vocabulary flashcards for upcoming language proficiency test. Focus on verbs and conjugations.",
    "Attend networking event next Thursday. Prepare elevator pitch and bring plenty of business cards.",
    "Begin home renovation project by researching contractors and obtaining quotes. Focus on kitchen upgrades.",
    "Volunteer at local animal shelter this weekend. Sign up for morning shift to help with feeding and cleaning.",
    "Set SMART goals for personal fitness. Aim to run a half marathon by the end of the year.",
    "Experiment with new recipes for meal prep. Incorporate more plant-based options for a healthier diet.",
    "Update resume with recent achievements and skills. Tailor it for specific job applications.",
    "Plan monthly budget and track expenses using spreadsheet or budgeting app. Allocate funds for savings and investments.",
    "Start learning basic coding skills online. Explore HTML, CSS, and JavaScript tutorials.",
    "Organize closet and donate unused clothing items to charity. Declutter and create more space.",
    "Research mindfulness and meditation techniques for stress relief. Practice deep breathing exercises daily.",
    "Sign up for photography class to improve skills. Explore different techniques and compositions.",
    "Create a gratitude journal to reflect on positive moments each day. Write down three things to be grateful for.",
];

/// The demo's surface: `gl_transitions(safeTop, safeBottom, text, field)`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(GlTransitions::new())
}

/// Rounds a layout edge to the nearest device pixel, halves up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// Rounds a text's measured size up to the device pixel.
fn ceil_grid(v: f32, scale: f32) -> f32 {
    ((v * scale - 1e-3).ceil()) / scale
}

/// A text line's height: ascender plus descender, without the line gap.
fn natural(font: &Font) -> f32 {
    gfx::line_height(font)
}

/// Baseline of an icon glyph in a line box whose top is `top`.
fn icon_baseline(font: &Font, top: f32) -> f32 {
    top - font.metrics().ascent
}

/// The demo's fonts; None where the system face cannot be read.
struct Fonts {
    /// Title font.
    title: Font,
    /// Note font.
    card: Font,
    /// Heading font.
    heading: Font,
    /// Label font.
    label: Font,
    /// Text input font.
    input: Font,
}

impl Fonts {
    fn new() -> Option<Fonts> {
        Some(Fonts {
            title: skia::match_ui_font(20.0, 600.0)?,
            card: skia::match_ui_font(16.0, 600.0)?,
            heading: skia::match_ui_font(18.0, 400.0)?,
            label: skia::match_ui_font(12.0, 500.0)?,
            input: skia::match_ui_font(20.0, 400.0)?,
        })
    }
}

/// Icon glyphs at 24 and 32 pt.
struct Icons {
    small: Font,
    large: Font,
}

/// Where a wrapped note breaks into lines: at spaces and after hyphens. A word wider than the
/// line breaks between characters. Byte ranges into `text`.
fn wrap(font: &Font, text: &str, width: f32, out: &mut Vec<(usize, usize)>) {
    out.clear();
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let n = chars.len();
    let byte = |i: usize| if i < n { chars[i].0 } else { text.len() };
    // Opportunities: (end of the line's ink, start of the next line), as char indices.
    let mut breaks: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        let c = chars[i].1;
        if c == ' ' {
            let mut j = i;
            while j < n && chars[j].1 == ' ' {
                j += 1;
            }
            if j < n {
                breaks.push((i, j));
            }
            i = j;
            continue;
        }
        if c == '-'
            && i > 0
            && i + 1 < n
            && chars[i - 1].1.is_alphanumeric()
            && chars[i + 1].1.is_alphanumeric()
        {
            breaks.push((i + 1, i + 1));
        }
        i += 1;
    }
    breaks.push((n, n));
    let fits = |a: usize, b: usize| font.advance_width(&text[byte(a)..byte(b)]) <= width + 1e-3;
    let mut start = 0;
    let mut k = 0;
    while start < n {
        let mut last: Option<(usize, usize)> = None;
        while k < breaks.len() {
            let (end, next) = breaks[k];
            if end <= start {
                k += 1;
                continue;
            }
            if fits(start, end) {
                last = Some((end, next));
                k += 1;
            } else {
                break;
            }
        }
        match last {
            Some((end, next)) => {
                out.push((byte(start), byte(end)));
                start = next;
            }
            None => {
                // The word alone overflows: as many characters as fit (at least one).
                let mut end = start + 1;
                while end < n && fits(start, end + 1) {
                    end += 1;
                }
                out.push((byte(start), byte(end)));
                start = end;
            }
        }
        if k >= breaks.len() && start < n {
            out.push((byte(start), text.len()));
            break;
        }
    }
}

/// One note's card as the masonry lays it out (content coordinates), and its layout animation.
#[derive(Clone, Debug)]
struct Card {
    text: Rc<str>,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    lines: Vec<(usize, usize)>,
    /// When it mounted (NaN: at the next frame), and when it began to leave.
    enter_at: f64,
    delay: f64,
    exit_at: f64,
}

/// Which screen shows.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Route {
    Home,
    /// The add-note screen slides up (`present`: 0 → 1).
    Presenting,
    AddNote,
    /// It slides down (`present`: 1 → 0).
    Dismissing,
}

/// A running transition.
struct Run {
    progress: Timing,
    /// Its first frame (the snapshot's; NaN until then).
    start: f64,
    /// The check (a note is added at the end) rather than the close.
    save: bool,
    /// goBack has run.
    back: bool,
}

/// The pixel-grid layout of both screens (screen coordinates; Home's in content coordinates).
#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    w: f32,
    h: f32,
    scale: f32,
    /// Home: the header row's top, the title's box top, the + button's left, the cards' top.
    row: f32,
    title_top: f32,
    plus_x: f32,
    cards: f32,
    /// Add note: the row's top, the heading's box, the container, the label's top, the input.
    add_row: f32,
    heading: (f32, f32),
    /// The heading centred on the glass buttons' row (safe top, 48 tall), when they are its
    /// header.
    heading_glass: (f32, f32),
    check_x: f32,
    box_y: f32,
    box_h: f32,
    label_top: f32,
    input: [f32; 4],
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32, safe_top: f32, fonts: Option<&Fonts>, glass: bool) -> Layout {
        // Under the glass header the screens' own rows go: the content starts 16 under it.
        let row = grid(safe_top + BUTTON_ROW, scale);
        let content_top = if glass { safe_top + BUTTON + 16.0 } else { row + HEADER + HEADER_BELOW };
        let (title_h, heading_w, heading_h, label_h, input_h) = match fonts {
            Some(f) => (
                ceil_grid(natural(&f.title), scale),
                ceil_grid(f.heading.advance_width("Create a new Note"), scale),
                ceil_grid(natural(&f.heading), scale),
                ceil_grid(natural(&f.label), scale),
                natural(&f.input),
            ),
            None => (24.0, 150.0, 21.0 + 2.0 / 3.0, 14.0 + 1.0 / 3.0, 23.867_188),
        };
        let title_top = grid(row + (HEADER - title_h) / 2.0, scale);
        let plus_x = grid(w - HEADER_PAD - BUTTON, scale);
        let cards = content_top;
        // Centre the text between the two buttons, both ways.
        let (cx0, cw) = (ADD_PAD + BUTTON, w - 2.0 * (ADD_PAD + BUTTON));
        let heading = (
            grid(cx0 + (cw - heading_w) / 2.0, scale),
            grid(row + (BUTTON - heading_h) / 2.0, scale),
        );
        let box_y = if glass { content_top } else { row + BUTTON + BOX_TOP };
        let label_top = box_y + BOX_PAD + LABEL_TOP;
        let input_y = label_top + label_h + LABEL_BELOW + INPUT_TOP;
        let content = BOX_PAD + LABEL_TOP + label_h + LABEL_BELOW + INPUT_TOP + input_h + BOX_PAD;
        let box_h = grid(box_y + content.max(BOX_MIN), scale) - grid(box_y, scale);
        let ix = ADD_PAD + BOX_PAD;
        let input = [
            grid(ix, scale),
            grid(input_y, scale),
            grid(w - ix, scale) - grid(ix, scale),
            grid(input_y + input_h, scale) - grid(input_y, scale),
        ];
        Layout {
            w,
            h,
            scale,
            row,
            title_top,
            plus_x,
            cards,
            add_row: row,
            heading,
            heading_glass: (
                grid((w - heading_w) / 2.0, scale),
                grid(safe_top + (BUTTON - heading_h) / 2.0, scale),
            ),
            check_x: grid(w - ADD_PAD - BUTTON, scale),
            box_y: grid(box_y, scale),
            box_h,
            label_top: grid(label_top, scale),
            input,
        }
    }

    fn on_plus(&self, x: f32, y: f32, scroll: f32) -> bool {
        let top = self.row - scroll;
        (self.plus_x..=self.plus_x + BUTTON).contains(&x) && (top..=top + BUTTON).contains(&y)
    }

    fn on_close(&self, x: f32, y: f32) -> bool {
        (ADD_PAD..=ADD_PAD + BUTTON).contains(&x)
            && (self.add_row..=self.add_row + BUTTON).contains(&y)
    }

    fn on_check(&self, x: f32, y: f32) -> bool {
        (self.check_x..=self.check_x + BUTTON).contains(&x)
            && (self.add_row..=self.add_row + BUTTON).contains(&y)
    }
}

/// The masonry: each note's card in data order, and the content's height.
fn masonry(
    notes: &[Rc<str>],
    l: &Layout,
    safe_bottom: f32,
    font: Option<&Font>,
) -> (Vec<Card>, f32) {
    let s = l.scale;
    let half = l.w / 2.0;
    let mut cursor = [l.cards; 2];
    let mut cards = Vec::with_capacity(notes.len());
    for (i, text) in notes.iter().enumerate() {
        let col = i % 2;
        let x0 = col as f32 * half + GAP;
        let w = half - GAP - if col == 1 { GAP } else { 0.0 };
        let mut lines = Vec::new();
        if let Some(f) = font {
            wrap(f, text, w - 2.0 * CARD_PAD, &mut lines);
        }
        let n = lines.len().max(1) as f32;
        // TextKit measures a hair over n × lineHeight, and the box rounds up to a whole pixel.
        let h = 2.0 * CARD_PAD + ceil_grid(n * CARD_LINE, s) + 1.0 / s;
        let (left, top) = (grid(x0, s), grid(cursor[col], s));
        cards.push(Card {
            text: text.clone(),
            x: left,
            y: top,
            w: grid(x0 + w, s) - left,
            h: grid(cursor[col] + h, s) - top,
            lines,
            enter_at: f64::NAN,
            delay: if i == 0 { 0.0 } else { i as f64 * STAGGER_MS },
            exit_at: f64::NAN,
        });
        cursor[col] += h + GAP;
    }
    let bottom = cursor[0].max(cursor[1]);
    (cards, bottom + safe_bottom)
}

/// The scroll view's content: its height and the cards (for drawing).
struct Home {
    notes: Vec<Rc<str>>,
    cards: Vec<Card>,
    leaving: Vec<Card>,
    content: f32,
    /// The width the cards were laid out for.
    width: f32,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    copy: wgpu::RenderPipeline,
    transition: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    /// The live scene (and, while a transition runs, the second snapshot), the first snapshot.
    live: wgpu::TextureView,
    first: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

/// The pipelines for `format` and the shader `generation`. `keep`, at the same pixel size, hands
/// over its targets: a new shader generation (a hot reload) or target format rebuilds only the
/// pipelines, so the snapshots taken so far (`first`, the frozen `live`) survive it.
fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    keep: Option<Gpu>,
) -> Gpu {
    let keep = keep.filter(|g| g.pixels == pixels);
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let copy =
        skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COPY_FS, format, None);
    let transition = skia::render::fullscreen_pipeline(
        device,
        &shader,
        &layout,
        entry::TRANSITION_FS,
        format,
        None,
    );
    let (live, first, uniforms) = match keep {
        Some(g) => (g.live, g.first, g.uniforms),
        None => (
            skia::render::sampled_target(
                device,
                "gl transitions live",
                GRAPHITE_FORMAT,
                pixels.0,
                pixels.1,
            ),
            skia::render::sampled_target(
                device,
                "gl transitions first",
                GRAPHITE_FORMAT,
                pixels.0,
                pixels.1,
            ),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("gl transitions"),
                size: Uniforms::SIZE as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
        ),
    };
    let sampler = skia::render::linear_sampler(device);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("gl transitions"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: IMAGE1.binding,
                resource: wgpu::BindingResource::TextureView(&live),
            },
            wgpu::BindGroupEntry {
                binding: IMAGE2.binding,
                resource: wgpu::BindingResource::TextureView(&first),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    Gpu {
        format,
        generation,
        pixels,
        copy,
        transition,
        uniforms,
        live,
        first,
        bind,
    }
}

struct GlTransitions {
    safe_top: f32,
    /// Inputs 4 and 5: the Back count, and whether the glass close button is the way back. When it is,
    /// the screen's own close is not drawn.
    chrome_back: bool,
    backs: Option<f64>,
    /// Inputs 6 and 7: the glass header's add and check presses. With the glass header, the screens
    /// draw no header row of their own.
    adds: Option<f64>,
    checks: Option<f64>,
    safe_bottom: f32,
    /// The field's text (the Contract's `text`), and whether the field is mounted over the canvas.
    text: String,
    field: bool,
    layout: Layout,
    home: Home,
    scroll: UiScroll,
    /// The button presses.
    plus: Pressable,
    close: Pressable,
    check: Pressable,
    route: Route,
    present: Spring,
    /// The presentation's first frame.
    present_at: Option<f64>,
    run: Option<Run>,
    /// The note the check saves (the field's text at goBack).
    saved: Option<String>,
    /// The Home snapshot is taken at the next frame.
    snap_first: bool,
    ease: Easing,
    fonts: Option<Fonts>,
    icons: Option<Icons>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

impl GlTransitions {
    fn new() -> GlTransitions {
        GlTransitions {
            safe_top: 0.0,
            chrome_back: false,
            backs: None,
            adds: None,
            checks: None,
            safe_bottom: 0.0,
            text: String::new(),
            field: false,
            layout: Layout::default(),
            home: Home {
                notes: NOTES.iter().map(|n| Rc::from(*n)).collect(),
                cards: Vec::new(),
                leaving: Vec::new(),
                content: 0.0,
                width: 0.0,
            },
            scroll: UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, ui_scroll::Snap::Free),
            plus: Pressable::new(),
            close: Pressable::new(),
            check: Pressable::new(),
            route: Route::Home,
            present: Spring::at(0.0),
            present_at: None,
            run: None,
            saved: None,
            snap_first: false,
            ease: Easing::timing_default(),
            fonts: Fonts::new(),
            icons: match (
                Font::new(ANTDESIGN, 24.0).map(Font::with_ui_layout),
                Font::new(ANTDESIGN, 32.0).map(Font::with_ui_layout),
            ) {
                (Some(small), Some(large)) => Some(Icons { small, large }),
                _ => None,
            },
            posted: Vec::new(),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
            gpu: None,
        }
    }

    /// Lays the cards out again for the width (the first frame), keeping their animations.
    fn relayout(&mut self) {
        let (mut cards, content) = masonry(
            &self.home.notes,
            &self.layout,
            self.safe_bottom,
            self.fonts.as_ref().map(|f| &f.card),
        );
        for (card, old) in cards.iter_mut().zip(self.home.cards.iter()) {
            card.enter_at = old.enter_at;
        }
        self.home.cards = cards;
        self.home.content = content;
        self.home.width = self.layout.w;
        self.scroll.max = (content - self.layout.h).max(0.0) as f64;
    }

/// Adds the checked note to the front: every card moves to the other column, so each re-enters,
/// staggered by its new index.
    fn add_note(&mut self, title: String) {
        self.home.notes.insert(0, Rc::from(title));
        let leaving = std::mem::take(&mut self.home.cards);
        self.home.leaving.extend(leaving.into_iter().map(|mut c| {
            c.exit_at = f64::NAN;
            c
        }));
        let (cards, content) = masonry(
            &self.home.notes,
            &self.layout,
            self.safe_bottom,
            self.fonts.as_ref().map(|f| &f.card),
        );
        self.home.cards = cards;
        self.home.content = content;
        self.scroll.max = (content - self.layout.h).max(0.0) as f64;
    }

    /// Whether the canvas takes touches for the screens (no transition, no presentation).
    fn settled(&self) -> bool {
        self.run.is_none() && !self.snap_first && matches!(self.route, Route::Home | Route::AddNote)
    }

    /// runTransition: the screen's snapshot at the next frame, then the timing.
    fn run_transition(&mut self, save: bool) {
        let mut progress = Timing::at(0.0);
        progress.to(1.0, TRANSITION_MS, Easing::Linear);
        self.run = Some(Run {
            progress,
            start: f64::NAN,
            save,
            back: false,
        });
        self.posted.push("transition".into());
    }

    fn draw_home(&mut self, now: f64) {
        let l = self.layout;
        let c = &mut self.canvas;
        c.draw_rect(
            0.0,
            0.0,
            l.w,
            l.h,
            &Paint::fill(Color::view_hex(BACKGROUND)),
        );
        let scroll = self.scroll.offset as f32;
        let row = l.row - scroll;
        let glass = self.chrome_back;
        if let (Some(f), false) = (self.fonts.as_ref(), glass) {
            c.draw_text_spaced(
                "ADD NOTE",
                HEADER_PAD,
                gfx::baseline(&f.title, l.title_top - scroll),
                &f.title,
                &Paint::fill(Color::view_hex(PRIMARY)),
                TITLE_SPACING,
            );
        }
        // The + (PressableScale about its centre); the glass header's + stands for it.
        let k = self.plus.scale() as f32;
        c.save();
        if glass {
            c.opacity(0.0);
        }
        c.translate(l.plus_x + BUTTON / 2.0, row + BUTTON / 2.0);
        c.scale(k, k);
        c.translate(-BUTTON / 2.0, -BUTTON / 2.0);
        c.draw_circle(
            BUTTON / 2.0,
            BUTTON / 2.0,
            BUTTON / 2.0,
            &Paint::fill(Color::view_hex(PRIMARY)),
        );
        if let Some(icons) = self.icons.as_ref() {
            draw_icon(c, &icons.small, PLUS, l.scale, Color::WHITE);
        }
        c.restore();
        let font = self.fonts.as_ref().map(|f| &f.card);
        let ease = &self.ease;
        for card in self.home.leaving.iter() {
            let t = ((now - card.exit_at) / FADE_MS).clamp(0.0, 1.0);
            let p = ease.at(t) as f32;
            draw_card(c, card, font, &l, scroll, 1.0 - p, FADE_DY * p);
        }
        for card in self.home.cards.iter() {
            let t = ((now - card.enter_at - card.delay) / FADE_MS).clamp(0.0, 1.0);
            let p = if now - card.enter_at < card.delay {
                0.0
            } else {
                ease.at(t) as f32
            };
            draw_card(c, card, font, &l, scroll, p, FADE_DY * (1.0 - p));
        }
        if glass {
        // The list fades out under the glass header, and the title sits on the row.
            let edge = l.cards;
            let bands = 32;
            for k in 0..bands {
                let t = k as f32 / bands as f32;
                let a = (1.0 - t) * (1.0 - t);
                c.draw_rect(0.0, edge * t, l.w, edge / bands as f32 + 0.5, &Paint::fill(Color::view_hex(BACKGROUND)).with_opacity(a));
            }
            if let Some(f) = self.fonts.as_ref() {
                let lh = natural(&f.heading);
                let x = (l.w - f.heading.advance_width("Notes")) / 2.0;
                let top = self.safe_top + (BUTTON - lh) / 2.0;
                c.draw_text("Notes", x, gfx::baseline(&f.heading, top), &f.heading, &Paint::fill(Color::view_hex(TEXT)));
            }
        }
    }

    fn draw_add_note(&mut self, top: f32, draw_field: bool) {
        let l = self.layout;
        let s = l.scale;
        let c = &mut self.canvas;
        c.save();
        c.translate(0.0, top);
        c.draw_rect(
            0.0,
            0.0,
            l.w,
            l.h,
            &Paint::fill(Color::view_hex(BACKGROUND)),
        );
        draw_gradient(c, l.w, l.h, s);
        let row = l.add_row;
        // The close (the glass Back stands for it when the demo screen offers one).
        if let (Some(icons), false) = (self.icons.as_ref(), self.chrome_back) {
            let k = self.close.scale() as f32;
            c.save();
            c.translate(ADD_PAD + BUTTON / 2.0, row + BUTTON / 2.0);
            c.scale(k, k);
            c.translate(-BUTTON / 2.0, -BUTTON / 2.0);
            draw_icon(c, &icons.large, CLOSE, s, Color::view_hex(TEXT));
            c.restore();
        }
        // The check (the glass header's checkmark stands for it when there is one).
        let k = self.check.scale() as f32;
        let glass = self.chrome_back;
        c.save();
        if glass {
            c.opacity(0.0);
        }
        c.translate(l.check_x + BUTTON / 2.0, row + BUTTON / 2.0);
        c.scale(k, k);
        c.translate(-BUTTON / 2.0, -BUTTON / 2.0);
        c.draw_circle(
            BUTTON / 2.0,
            BUTTON / 2.0,
            BUTTON / 2.0,
            &Paint::fill(Color::view_hex(PRIMARY)),
        );
        if let Some(icons) = self.icons.as_ref() {
            draw_icon(c, &icons.small, CHECK, s, Color::WHITE);
        }
        c.restore();
        c.draw_continuous_rrect(
            ADD_PAD,
            l.box_y,
            l.w - 2.0 * ADD_PAD,
            l.box_h,
            BOX_RADIUS,
            &Paint::fill(Color::view_hex(SURFACE)),
        );
        if let Some(f) = self.fonts.as_ref() {
            c.draw_text(
                "Create a new Note",
                if self.chrome_back {
                    l.heading_glass.0
                } else {
                    l.heading.0
                },
                gfx::baseline(
                    &f.heading,
                    if self.chrome_back {
                        l.heading_glass.1
                    } else {
                        l.heading.1
                    },
                ),
                &f.heading,
                &Paint::fill(Color::view_hex(TEXT)),
            );
            c.draw_text(
                "ADD A NEW NOTE",
                ADD_PAD + BOX_PAD,
                gfx::baseline(&f.label, l.label_top),
                &f.label,
                &Paint::fill(Color::view_hex(PRIMARY)),
            );
            if draw_field {
                // An overflowing line scrolls to its end, as a text field does, and is clipped.
                let [x, y, w, h] = l.input;
                let baseline = y + (h - natural(&f.input)) / 2.0 - f.input.metrics().ascent;
                if self.text.is_empty() {
                    c.draw_text(
                        PLACEHOLDER,
                        x,
                        baseline,
                        &f.input,
                        &Paint::fill(Color(PLACEHOLDER_RGBA)),
                    );
                } else {
                    let tw = f.input.advance_width(&self.text);
                    c.save();
                    c.clip_rect(x, y, w, h);
                    c.draw_text(
                        &self.text,
                        if tw > w { x + w - tw } else { x },
                        baseline,
                        &f.input,
                        &Paint::fill(Color::view_hex(TEXT)),
                    );
                    c.restore();
                }
            }
        }
        c.restore();
    }

    /// The live scene into the canvas.
    fn draw_scene(&mut self, now: f64, draw_field: bool) {
        let h = self.layout.h;
        let up = self.present.value.clamp(0.0, 1.0) as f32;
        let covered = self.route == Route::AddNote || (up >= 1.0 && self.route != Route::Home);
        if !covered {
            self.draw_home(now);
        }
        if self.route != Route::Home {
            self.draw_add_note(h * (1.0 - self.present.value as f32), draw_field);
        }
    }
}

/// An icon glyph centred in a 48 pt button.
fn draw_icon(c: &mut Canvas, font: &Font, glyph: &str, scale: f32, color: Color) {
    let w = font.advance_width(glyph);
    let h = ceil_grid(natural(font), scale);
    let (x, y) = ((BUTTON - w) / 2.0, (BUTTON - h) / 2.0);
    c.draw_text(glyph, x, icon_baseline(font, y), font, &Paint::fill(color));
}

/// The gradient overlay drawn over the add-note screen.
fn draw_gradient(c: &mut Canvas, w: f32, h: f32, scale: f32) {
    let rows = (h * scale).round() as i32;
    let at = |r: i32| -> (u8, u8) {
        let t = ((r as f32 + 0.5) / scale / h).clamp(0.0, 1.0);
        if t >= 0.5 {
            return (0, 0);
        }
        let k = 1.0 - t / 0.5;
        let a = 0.05 * k;
        ((a * k * 255.0).round() as u8, (a * 255.0).round() as u8)
    };
    let mut r = 0;
    while r < rows {
        let (red, alpha) = at(r);
        if alpha == 0 {
            break;
        }
        let mut end = r + 1;
        while end < rows && at(end) == (red, alpha) {
            end += 1;
        }
        let a = alpha as f32 / 255.0;
        c.draw_rect(
            0.0,
            r as f32 / scale,
            w,
            (end - r) as f32 / scale,
            &Paint::fill(Color([red as f32 / 255.0 / a, 0.0, 0.0, a])),
        );
        r = end;
    }
}

/// One note's card at `opacity`, `dy` below its place.
fn draw_card(
    c: &mut Canvas,
    card: &Card,
    font: Option<&Font>,
    l: &Layout,
    scroll: f32,
    opacity: f32,
    dy: f32,
) {
    if opacity <= 0.0 {
        return;
    }
    let y = card.y - scroll + dy;
    let margin = 3.0 * SHADOW_SIGMA;
    if y > l.h + margin || y + card.h < -margin {
        return;
    }
    c.save();
    c.opacity(opacity);
    if opacity < 1.0 {
        // The view's opacity is its layer's, the shadow under the opaque card unseen: only what
        // lies outside the card is drawn.
        c.clip_with(|b| {
            skia::add_rect(
                b,
                card.x - margin,
                y - margin,
                card.w + 2.0 * margin,
                card.h + 2.0 * margin,
            );
            skia::add_rrect_hole(b, card.x, y, card.w, card.h, CARD_RADIUS);
        });
        c.draw_rrect_shadow(
            card.x,
            y,
            card.w,
            card.h,
            CARD_RADIUS,
            SHADOW_SIGMA,
            Color::BLACK.alpha(SHADOW_ALPHA),
        );
        c.restore();
        c.save();
        c.opacity(opacity);
    } else {
        c.draw_rrect_shadow(
            card.x,
            y,
            card.w,
            card.h,
            CARD_RADIUS,
            SHADOW_SIGMA,
            Color::BLACK.alpha(SHADOW_ALPHA),
        );
    }
    c.draw_continuous_rrect(
        card.x,
        y,
        card.w,
        card.h,
        CARD_RADIUS,
        &Paint::fill(Color::view_hex(SURFACE)),
    );
    if let Some(f) = font {
        // lineHeight 24: each line's baseline (24 − line height) / 2 above TextKit's.
        let offset = (CARD_LINE - natural(f)) / 2.0 - f.metrics().ascent;
        let paint = Paint::fill(Color::view_hex(TEXT));
        for (i, &(a, b)) in card.lines.iter().enumerate() {
            c.draw_text(
                &card.text[a..b],
                card.x + CARD_PAD,
                y + CARD_PAD + i as f32 * CARD_LINE + offset,
                f,
                &paint,
            );
        }
    }
    c.restore();
}

impl Surface for GlTransitions {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let number = |i: usize, what: &str| {
            inputs
                .get(i)
                .map(|v| exact_gpu::json::number(v, what))
                .transpose()
        };
        self.safe_top = number(0, "safeTop")?.unwrap_or(0.0) as f32;
        let safe_bottom = number(1, "safeBottom")?.unwrap_or(0.0) as f32;
        if safe_bottom != self.safe_bottom {
            // The content's paddingBottom: laid out again at the next frame.
            self.safe_bottom = safe_bottom;
            self.home.width = 0.0;
        }
        if let Some(v) = inputs.get(2) {
            let text = exact_gpu::json::text(v, "text")?;
            if text != self.text {
                self.text = text;
            }
        }
        self.field = match inputs.get(3) {
            Some(Value::Bool(b)) => *b,
            Some(v) => exact_gpu::json::number(v, "field")? != 0.0,
            None => false,
        };
        let backs = number(4, "backs")?;
        if let (Some(seen), Some(now)) = (self.backs, backs) {
            if now != seen && self.route == Route::AddNote && self.run.is_none() {
                self.run_transition(false);
            }
        }
        if backs.is_some() {
            self.backs = backs;
        }
        let adds = number(6, "adds")?;
        if let (Some(seen), Some(now)) = (self.adds, adds) {
            if now != seen && self.route == Route::Home && self.run.is_none() {
                // The + press: prepareTransition (the snapshot), then navigate('AddNote').
                self.snap_first = true;
            }
        }
        if adds.is_some() {
            self.adds = adds;
        }
        let checks = number(7, "checks")?;
        if let (Some(seen), Some(now)) = (self.checks, checks) {
            if now != seen && self.route == Route::AddNote && self.run.is_none() {
                if self.text.is_empty() {
                    self.posted.push("alert".into());
                } else {
                    self.run_transition(true);
                }
            }
        }
        if checks.is_some() {
            self.checks = checks;
        }
        let chrome_back = matches!(inputs.get(5), Some(Value::Bool(true)));
        if chrome_back && !self.chrome_back {
            // The glass back button replaces the screen's own close only when the surface takes it.
            self.posted.push("glass-back".into());
            // The glass header takes its inputs the same way.
            self.posted.push("glass-header".into());
        }
        self.chrome_back = chrome_back;
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let route = match self.route {
            Route::Home => "home",
            Route::Presenting => "presenting",
            Route::AddNote => "addNote",
            Route::Dismissing => "dismissing",
        };
        let progress = self.run.as_ref().map_or(0.0, |r| r.progress.value);
        let first = self.home.notes.first().map_or("", |n| n);
        Some(format!(
            "{{\"route\":\"{route}\",\"progress\":{:.4},\"notes\":{},\"first\":{:?},\"scroll\":{:.2}}}",
            progress + 0.0,
            self.home.notes.len(),
            first,
            self.scroll.offset + 0.0
        ))
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
        let phase = gfx::phase(phase);
        let l = self.layout;
        if !self.settled() {
            // The canvas takes touches during a transition; a finger already down is released.
            if matches!(phase, Phase::Up | Phase::Cancel) {
                for p in [&mut self.plus, &mut self.close, &mut self.check] {
                    if p.finger() == Some(id) {
                        p.cancel();
                    }
                }
                if self.route == Route::Home {
                    self.scroll.input(id, Phase::Cancel, y, x, at_ms, true);
                }
            }
            return;
        }
        match self.route {
            Route::Home => {
                let scroll = self.scroll.offset as f32;
                let glass = self.chrome_back;
                if phase == Phase::Down && !self.scroll.moving() {
                    self.plus.pointer_down(id, !glass && l.on_plus(x, y, scroll));
                }
                // The ScrollView: vertical, so its axis is fed as the crate's x.
                self.scroll.input(id, phase, y, x, at_ms, true);
                if self.scroll.dragging() && self.plus.finger() == Some(id) {
                    // The scroll took the touch: no press.
                    self.plus.cancel();
                }
                if phase != Phase::Down {
                    if let Some(PressEvent::Press(press)) =
                        self.plus.pointer(id, phase, !glass && l.on_plus(x, y, scroll))
                    {
                        // prepareTransition (the snapshot), then navigate('AddNote').
                        self.posted.extend(press.global_message().map(String::from));
                        self.snap_first = true;
                    }
                }
            }
            Route::AddNote => {
                if phase == Phase::Down {
                    if !self
                        .close
                        .pointer_down(id, !self.chrome_back && l.on_close(x, y))
                    {
                        self.check.pointer_down(id, !self.chrome_back && l.on_check(x, y));
                    }
                    return;
                }
                if let Some(PressEvent::Press(press)) =
                    self.close
                        .pointer(id, phase, !self.chrome_back && l.on_close(x, y))
                {
                    self.posted.extend(press.global_message().map(String::from));
                    self.run_transition(false);
                } else if let Some(PressEvent::Press(press)) =
                    self.check.pointer(id, phase, !self.chrome_back && l.on_check(x, y))
                {
                    self.posted.extend(press.global_message().map(String::from));
                    if self.text.is_empty() {
                        self.posted.push("alert".into());
                    } else {
                        self.run_transition(true);
                    }
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
        let now = frame.now_ms;
        self.layout = Layout::new(
            frame.width,
            frame.height,
            frame.scale,
            self.safe_top,
            self.fonts.as_ref(),
            self.chrome_back,
        );
        self.scroll.port = frame.height as f64;
        if self.home.width != frame.width {
            self.relayout();
        }
        let mut moving = false;
        for p in [&mut self.plus, &mut self.close, &mut self.check] {
            moving |= p.step(now);
        }
        moving |= self.scroll.step(now);

        // The presentation.
        let snap_first = std::mem::take(&mut self.snap_first);
        if self.present.running {
            let start = *self.present_at.get_or_insert(now);
            // A UIKit transition ends at its duration.
            if !self.present.step(now) || now - start >= PRESENT_MS {
                let to = self.present.target();
                self.present.set(to);
                self.present_at = None;
                match self.route {
                    Route::Presenting => {
                        self.route = Route::AddNote;
                        self.posted.push("presented".into());
                    }
                    Route::Dismissing => self.route = Route::Home,
                    _ => {}
                }
            }
            moving = true;
        }

        // The transition: its first frame is the snapshot's (progress 0, the canvas under the
        // screen); goBack at 1000 ms; at its end the canvas drops and the note is added.
        let mut transition = None;
        let mut take_second = false;
        if let Some(run) = self.run.as_mut() {
            if run.start.is_nan() {
                run.start = now;
                take_second = true;
            }
            let running = run.progress.step(now);
            if !run.back && now - run.start >= BACK_MS {
                run.back = true;
                if run.save {
                    self.saved = Some(self.text.clone());
                }
                self.route = Route::Dismissing;
                gfx::spring_to(&mut self.present, 0.0, PRESENT_MS, 1.0);
                self.posted.push("dismiss".into());
            }
            if running {
                transition = Some(run.progress.value as f32);
            } else {
                let save = run.save;
                self.run = None;
                if let (true, Some(title)) = (save, self.saved.take()) {
                    self.add_note(title);
                }
            }
            moving = true;
        }

        // The cards mounted (or left) since the last frame start their animations now.
        for card in self.home.cards.iter_mut() {
            if card.enter_at.is_nan() {
                card.enter_at = now;
            }
        }
        for card in self.home.leaving.iter_mut() {
            if card.exit_at.is_nan() {
                card.exit_at = now;
            }
        }
        self.home.leaving.retain(|c| now - c.exit_at < FADE_MS);
        moving |= self
            .home
            .cards
            .iter()
            .any(|c| now - c.enter_at < c.delay + FADE_MS)
            || !self.home.leaving.is_empty();

        let (pw, ph) = frame.pixels();
        if self
            .gpu
            .as_ref()
            .map(|g| (g.format, g.generation, g.pixels))
            != Some((format, frame.shader_generation, (pw, ph)))
        {
            let keep = self.gpu.take();
            self.gpu = Some(build(
                device,
                format,
                frame.shader_generation,
                (pw, ph),
                keep,
            ));
        }
        // What the frame shows: the live scene (into `live`, or into `first` when the Home
        // snapshot is taken), or the transition over the frozen `live` (the second snapshot).
        let showing_transition = matches!(transition, Some(p) if p > 0.0) && !take_second;
        if !showing_transition {
            self.canvas.begin(frame.scale);
            let draw_field = !self.field || take_second;
            self.draw_scene(now, draw_field);
            let gpu = self.gpu.as_ref().unwrap();
            let into = if snap_first { &gpu.first } else { &gpu.live };
            self.renderer.draw(
                device,
                queue,
                encoder,
                &self.canvas,
                into,
                GRAPHITE_FORMAT,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
        }
        if snap_first {
            // navigate('AddNote'): the screen slides up from the next frame.
            self.route = Route::Presenting;
            self.present.set(0.0);
            gfx::spring_to(&mut self.present, 1.0, PRESENT_MS, 1.0);
            moving = true;
        }
        let gpu = self.gpu.as_ref().unwrap();
        // Cover: fitRects("cover", image, (0, 0, width, height)) → rect2rect(src, dst).
        let (w, h) = (frame.width as f64, frame.height as f64);
        let (iw, ih) = (pw as f64, ph as f64);
        let (src_w, src_h) = if w / h > iw / ih {
            (iw, iw * h / w)
        } else {
            (ih * w / h, ih)
        };
        let (src_x, src_y) = ((iw - src_w) / 2.0, (ih - src_h) / 2.0);
        let k = w / src_w;
        let u = Uniforms {
            res: [
                frame.width,
                frame.height,
                frame.scale,
                transition.unwrap_or(0.0),
            ],
            image: [iw as f32, ih as f32, k as f32, gfx::srgb_flag(format)],
            cover: [
                (-src_x * k) as f32,
                (-src_y * k) as f32,
                if snap_first { 1.0 } else { 0.0 },
                0.0,
            ],
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        let pipeline = if showing_transition {
            &gpu.transition
        } else {
            &gpu.copy
        };
        skia::render::fullscreen_pass(encoder, "gl transitions", target, pipeline, &gpu.bind);
        moving
            || self.plus.is_pressed()
            || self.close.is_pressed()
            || self.check.is_pressed()
            || self.snap_first
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;
    const SAFE_TOP: f64 = 68.0;
    const SAFE_BOTTOM: f64 = 34.0;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: W,
            height: H,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

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

    fn tap(s: &mut Box<dyn Surface>, x: f32, y: f32, at_ms: f64) {
        s.input(&pointer(PointerPhase::Down, x, y, at_ms));
        s.input(&pointer(PointerPhase::Up, x, y, at_ms + 60.0));
    }

    fn rgb(img: &fixture::Pixels, x: f32, y: f32) -> [u8; 3] {
        let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
        [p[0], p[1], p[2]]
    }

    fn view(hex: u32) -> [u8; 3] {
        Color::view_hex(hex)
            .0
            .map(|c| (c.clamp(0.0, 1.0) * 255.0).round() as u8)[..3]
            .try_into()
            .unwrap()
    }

    fn close(a: [u8; 3], b: [u8; 3], tol: i32) -> bool {
        a.iter()
            .zip(b)
            .all(|(x, y)| (*x as i32 - y as i32).abs() <= tol)
    }

    fn bind(s: &mut Box<dyn Surface>, text: &str, field: bool) {
        s.bind(
            &[
                Value::Number(SAFE_TOP),
                Value::Number(SAFE_BOTTOM),
                Value::str(text),
                Value::Bool(field),
            ],
            None,
        )
        .unwrap();
    }

    fn render_to(
        gpu: &exact_gpu::Gpu,
        s: &mut Box<dyn Surface>,
        from: f64,
        to: f64,
    ) -> (fixture::Pixels, f64) {
        let mut ms = from;
        loop {
            let (img, _) = fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
            if ms >= to {
                return (img, ms);
            }
            ms = (ms + 16.67).min(to);
        }
    }

    #[test]
    fn notes_wrap_as_textkit_breaks_them() {
        let Some(font) = skia::match_ui_font(16.0, 600.0) else {
            return eprintln!("no system font; skipped");
        };
        let mut lines = Vec::new();
        let text = NOTES[5];
        wrap(&font, text, 168.333, &mut lines);
        assert!(lines.len() >= 3, "{lines:?}");
        for &(a, b) in &lines {
            assert!(
                font.advance_width(&text[a..b]) <= 168.334,
                "{:?}",
                &text[a..b]
            );
            assert!(!text[a..b].ends_with(' ') && !text[a..b].starts_with(' '));
        }
        // Every character is on a line, in order (the spaces at the breaks hang).
        let joined: String = lines
            .iter()
            .map(|&(a, b)| &text[a..b])
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(
            joined.replace("- ", "-").replace(' ', ""),
            text.replace(' ', "")
        );
        // A word wider than the line breaks between characters.
        wrap(
            &font,
            "Supercalifragilisticexpialidocious",
            60.0,
            &mut lines,
        );
        assert!(lines.len() > 2);
    }

    #[test]
    fn the_screens_are_where_rn_lays_them_out_and_the_warp_runs_between_them() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        bind(&mut s, "", false);
        // The first frame: every card waits for its FadeInDown.
        let (first, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(moving);
        let row = SAFE_TOP as f32 + 56.0;
        let cards_top = row + 66.0;
        assert!(
            close(rgb(&first, 30.0, cards_top + 5.0), view(BACKGROUND), 1),
            "{:?}",
            rgb(&first, 30.0, cards_top + 5.0)
        );
        // At rest: 20 × 100 ms + 300 ms later.
        let (home, ms) = render_to(&gpu, &mut s, 16.0, 2400.0);
        gfx::save_over(&home, "gl-transitions-home", [0, 0, 0]);
        // The background, the + (48² at the row's right, 16 in), the title in primary.
        assert!(close(rgb(&home, 200.0, 40.0), view(BACKGROUND), 1));
        assert!(
            close(rgb(&home, W - 16.0 - 24.0, row + 6.0), view(PRIMARY), 1),
            "{:?}",
            rgb(&home, W - 40.0, row + 6.0)
        );
        assert!(
            close(rgb(&home, W - 16.0 - 46.0, row + 2.0), view(BACKGROUND), 1),
            "the + is a circle"
        );
        let title: Vec<[u8; 3]> = (0..60)
            .map(|i| rgb(&home, 16.0 + i as f32 * 1.5, row + 25.0))
            .collect();
        assert!(
            title.iter().any(|p| close(*p, view(PRIMARY), 12)),
            "ADD NOTE in primary"
        );
        // The first card: from x 35/3 to 210, white, its text dark.
        let (cx, cy) = (GAP + 4.0, cards_top + 3.0);
        assert!(
            close(rgb(&home, cx, cy), [255, 255, 255], 0),
            "{:?}",
            rgb(&home, cx, cy)
        );
        assert!(
            !close(rgb(&home, GAP - 2.0, cards_top + 40.0), [255, 255, 255], 3),
            "left of the card"
        );
        let ink = (0..150).any(|i| {
            (0..20).any(|j| rgb(&home, GAP + 15.0 + i as f32, cards_top + 15.0 + j as f32)[0] < 120)
        });
        assert!(ink, "the note's text");
        // The second column starts at 210 + gap.
        assert!(close(
            rgb(&home, 210.0 + GAP + 4.0, cards_top + 3.0),
            [255, 255, 255],
            0
        ));
        assert!(!close(
            rgb(&home, 210.0 + 4.0, cards_top + 40.0),
            [255, 255, 255],
            3
        ));

        // + opens the screen: the haptic, the slide, `presented`.
        let plus = (W - 16.0 - 24.0, row + 24.0);
        tap(&mut s, plus.0, plus.1, ms + 10.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let (sliding, ms) = render_to(&gpu, &mut s, ms + 70.0, ms + 70.0 + 120.0);
        gfx::save_over(&sliding, "gl-transitions-presenting", [0, 0, 0]);
        let (add, ms) = render_to(&gpu, &mut s, ms + 16.0, ms + 900.0);
        assert_eq!(s.messages(), vec!["presented".to_string()]);
        assert!(s.agent("").unwrap().contains("\"route\":\"addNote\""));
        gfx::save_over(&add, "gl-transitions-add-note", [0, 0, 0]);
        // The gradient's red at the top, the container (white, from y row + 64, 200 tall), the
        // check (primary) at the row's right, 8 in.
        let top = rgb(&add, 200.0, 3.0);
        assert!(top[0] > top[1] + 8 && top[1] == top[2], "{top:?}");
        assert!(close(rgb(&add, 200.0, H - 5.0), view(BACKGROUND), 1));
        assert!(close(
            rgb(&add, 200.0, row + 64.0 + 100.0),
            [255, 255, 255],
            0
        ));
        assert!(close(
            rgb(&add, 200.0, row + 64.0 + 203.0),
            view(BACKGROUND),
            2
        ));
        assert!(close(
            rgb(&add, W - 8.0 - 24.0, row + 4.0),
            view(PRIMARY),
            1
        ));
        assert!(
            close(
                rgb(&add, 4.0, row + 100.0),
                rgb(&add, W - 4.0, row + 100.0),
                0
            ),
            "paddingHorizontal 8"
        );
        assert!(!close(rgb(&add, 4.0, row + 100.0), [255, 255, 255], 6));

        // The check with an empty field: the alert, no transition.
        bind(&mut s, "", true);
        let check = (W - 8.0 - 24.0, row + 24.0);
        tap(&mut s, check.0, check.1, ms + 10.0);
        assert_eq!(
            s.messages(),
            vec!["haptic:selection".to_string(), "alert".to_string()]
        );
        let (_, ms) = render_to(&gpu, &mut s, ms + 70.0, ms + 400.0);
        assert!(s.agent("").unwrap().contains("\"route\":\"addNote\""));

        // Typed, then the check: the snapshot (progress 0 shows the screen), the warp.
        bind(&mut s, "Agent device note", true);
        let (typed, ms) = render_to(&gpu, &mut s, ms + 16.0, ms + 32.0);
        tap(&mut s, check.0, check.1, ms + 10.0);
        assert_eq!(
            s.messages(),
            vec!["haptic:selection".to_string(), "transition".to_string()]
        );
        let t0 = ms + 80.0;
        let (p0, _) = fixture::render(&gpu, s.as_mut(), &frame(t0)).unwrap();
        gfx::save_over(&p0, "gl-transitions-progress-0", [0, 0, 0]);
        // The snapshot draws the field's text where the field shows it.
        let ink = (0..100).any(|i| {
            rgb(
                &p0,
                30.0 + i as f32,
                row + 64.0 + 16.0 + 8.0 + 14.4 + 4.0 + 16.0 + 12.0,
            )[0] < 120
        });
        assert!(ink, "the typed text in the snapshot");
        assert!(close(rgb(&p0, 200.0, 3.0), rgb(&typed, 200.0, 3.0), 0));
        let (p_half, _) = render_to(&gpu, &mut s, t0 + 16.0, t0 + 750.0);
        gfx::save_over(&p_half, "gl-transitions-progress-half", [0, 0, 0]);
        // m = 1 at the top (Home, unwarped), 0 at the bottom (the screen, unwarped).
        assert!(
            close(rgb(&p_half, 200.0, 0.03 * H), view(BACKGROUND), 2),
            "{:?}",
            rgb(&p_half, 200.0, 0.03 * H)
        );
        assert!(close(
            rgb(&p_half, 200.0, 0.97 * H),
            rgb(&typed, 200.0, 0.97 * H),
            2
        ));
        assert!(close(
            rgb(&p_half, 200.0, 0.85 * H),
            rgb(&typed, 200.0, 0.85 * H),
            2
        ));
        // goBack at 1000 ms.
        let (_, _) = render_to(&gpu, &mut s, t0 + 760.0, t0 + 1001.0);
        assert_eq!(s.messages(), vec!["dismiss".to_string()]);
        let (p_one, _) = render_to(&gpu, &mut s, t0 + 1010.0, t0 + 1495.0);
        gfx::save_over(&p_one, "gl-transitions-progress-1", [0, 0, 0]);
        // Near 1 the Home as it was at + (its pixels: its cards where the screen is grey).
        for (x, y) in [
            (cx, 0.6 * H),
            (cx, 0.8 * H),
            (210.0 + GAP + 4.0, 0.7 * H),
            (W - 40.0, row + 6.0),
        ] {
            assert!(
                close(rgb(&p_one, x, y), rgb(&home, x, y), 2),
                "({x}, {y}): {:?} vs {:?}",
                rgb(&p_one, x, y),
                rgb(&home, x, y)
            );
        }
        // The end: the live Home, the note prepended, every card entering again.
        let (_, ms) = render_to(&gpu, &mut s, t0 + 1500.0, t0 + 1520.0);
        assert!(
            s.agent("")
                .unwrap()
                .contains("\"notes\":21,\"first\":\"Agent device note\""),
            "{}",
            s.agent("").unwrap()
        );
        let (after, _) = render_to(&gpu, &mut s, ms + 16.0, ms + 2600.0);
        gfx::save_over(&after, "gl-transitions-home-after", [0, 0, 0]);
        // The new note is the first card, one line tall; the old first card moves to column 2.
        let ink = (0..150).any(|i| {
            (0..20)
                .any(|j| rgb(&after, GAP + 15.0 + i as f32, cards_top + 15.0 + j as f32)[0] < 120)
        });
        assert!(ink);
        assert!(
            close(
                rgb(&after, cx, cards_top + 30.0 + 24.0 + 4.0),
                view(BACKGROUND),
                4
            ),
            "one line: 54 tall"
        );
    }

    #[test]
    fn the_close_runs_the_warp_without_a_note_and_the_list_scrolls() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        bind(&mut s, "", false);
        let (_, ms) = render_to(&gpu, &mut s, 0.0, 2400.0);
        // A drag up scrolls the list (a slow lift: no fling), in 15 pt moves.
        s.input(&pointer(PointerPhase::Down, 200.0, 700.0, ms));
        for i in 1..=20 {
            s.input(&pointer(
                PointerPhase::Move,
                200.0,
                700.0 - 15.0 * i as f32,
                ms + 16.0 * i as f64,
            ));
        }
        s.input(&pointer(PointerPhase::Up, 200.0, 400.0, ms + 600.0));
        let (_, ms) = render_to(&gpu, &mut s, ms + 600.0, ms + 4000.0);
        let agent = s.agent("").unwrap();
        let scroll: f64 = agent
            .split("\"scroll\":")
            .nth(1)
            .unwrap()
            .trim_end_matches('}')
            .parse()
            .unwrap();
        // UIScrollView's drag begins on the second move past its 10 pt hysteresis (30 pt here,
        // ui_scroll) and follows from there (300 − 30); lifted still after its last move, it
        // flings on at that move's velocity (UIKit, scroll probe).
        assert!(scroll > 270.0, "{agent}");
        // The + scrolled away: a tap there scrolls nothing and opens nothing.
        let row = SAFE_TOP as f32 + 56.0;
        tap(&mut s, W - 40.0, row + 24.0, ms + 10.0);
        assert!(s.messages().is_empty());
        // Back to the top, then + and the close.
        s.input(&pointer(PointerPhase::Down, 200.0, 300.0, ms + 100.0));
        for i in 1..=20 {
            s.input(&pointer(
                PointerPhase::Move,
                200.0,
                300.0 + 15.0 * i as f32,
                ms + 100.0 + 16.0 * i as f64,
            ));
        }
        s.input(&pointer(PointerPhase::Up, 200.0, 600.0, ms + 700.0));
        let (_, ms) = render_to(&gpu, &mut s, ms + 700.0, ms + 4500.0);
        tap(&mut s, W - 40.0, row + 24.0, ms + 10.0);
        let (_, ms) = render_to(&gpu, &mut s, ms + 70.0, ms + 900.0);
        let _ = s.messages();
        bind(&mut s, "Discarded draft", true);
        tap(&mut s, 32.0, row + 24.0, ms + 10.0);
        assert_eq!(
            s.messages(),
            vec!["haptic:selection".to_string(), "transition".to_string()]
        );
        let (_, _) = render_to(&gpu, &mut s, ms + 80.0, ms + 80.0 + 1530.0);
        assert!(s.messages().contains(&"dismiss".to_string()));
        let agent = s.agent("").unwrap();
        assert!(
            agent.starts_with("{\"route\":\"home\",\"progress\":0.0000,\"notes\":20,"),
            "{agent}"
        );
    }

    #[test]
    fn the_glass_header_adds_checks_and_goes_back() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let with = |s: &mut Box<dyn Surface>, text: &str, field: bool, n: [f64; 3]| {
            s.bind(
                &[
                    Value::Number(SAFE_TOP),
                    Value::Number(SAFE_BOTTOM),
                    Value::str(text),
                    Value::Bool(field),
                    Value::Number(n[0]),
                    Value::Bool(true),
                    Value::Number(n[1]),
                    Value::Number(n[2]),
                ],
                None,
            )
            .unwrap();
        };
        let mut s = surface();
        with(&mut s, "", false, [0.0; 3]);
        assert_eq!(s.messages(), vec!["glass-back".to_string(), "glass-header".to_string()]);
        let (home, ms) = render_to(&gpu, &mut s, 0.0, 2400.0);
        home.save("gl-glass-home");
        // The screen's own + is not drawn nor pressed under the glass header.
        let row = SAFE_TOP as f32 + 56.0;
        tap(&mut s, W - 40.0, row + 24.0, ms + 10.0);
        assert!(s.messages().is_empty());
        // The glass +: the add-note screen slides up.
        with(&mut s, "", false, [0.0, 1.0, 0.0]);
        let (_, ms) = render_to(&gpu, &mut s, ms + 70.0, ms + 900.0);
        assert!(s.messages().contains(&"presented".to_string()));
        with(&mut s, "", true, [0.0, 1.0, 0.0]);
        let (add, ms) = render_to(&gpu, &mut s, ms + 10.0, ms + 100.0);
        add.save("gl-glass-add");
        // Its own close is not there; the glass check on an empty note asks for text.
        tap(&mut s, 32.0, row + 24.0, ms + 10.0);
        assert!(s.messages().is_empty());
        with(&mut s, "", true, [0.0, 1.0, 1.0]);
        assert_eq!(s.messages(), vec!["alert".to_string()]);
        // The glass Back: the close's warp, no note.
        with(&mut s, "", true, [1.0, 1.0, 1.0]);
        let (_, _) = render_to(&gpu, &mut s, ms + 80.0, ms + 80.0 + 1530.0);
        assert!(s.messages().contains(&"dismiss".to_string()));
        let agent = s.agent("").unwrap();
        assert!(agent.starts_with("{\"route\":\"home\",\"progress\":0.0000,\"notes\":20,"), "{agent}");
    }
}
