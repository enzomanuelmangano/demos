//! Glyph masks from CoreText and CoreGraphics through raw FFI (Apple targets only).
//!
//! This module wraps Apple's CoreText; it does not rasterise text itself. Each glyph is drawn into a
//! CoreGraphics bitmap and reduced to an A8 coverage mask through the pre-blend table of [`crate::glyphs`].
//! - [`smooth_behavior`] probes CoreGraphics once with a glyph drawn smoothed and unsmoothed. `none`
//!   (iOS has no font smoothing) draws plain unhinted A8 with smoothing off; `some` (macOS stem
//!   darkening) keeps normal hinting, draws smoothed, linearises the coverage and halves the
//!   luminance colour.
//! - The bitmap is 32-bit host-order `NoneSkipFirst` DeviceRGB, each side the next power of two of the
//!   glyph's. The glyph is drawn black on white at (−left, top + height) through the inverse
//!   transform, antialiased, with subpixel quantization off.
//! - Coverage is 255 minus a pixel's channels, reduced to luminance and looked up in the pre-blend table.
//! - Bounds are CoreText's bounding rect through the transform, y flipped, rounded out and outset by 1;
//!   empty bounds draw nothing. The strike's font is the typeface's CTFont at the device text size,
//!   its optical size kept, no tracking.

#![allow(non_upper_case_globals, non_snake_case)]

use std::ffi::c_void;

type Ref = *const c_void;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct CGPoint {
    pub x: f64,
    pub y: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct CGSize {
    pub width: f64,
    pub height: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct CGRect {
    pub origin: CGPoint,
    pub size: CGSize,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct CGAffineTransform {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub tx: f64,
    pub ty: f64,
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFAllocatorNull: Ref;
    static kCFTypeDictionaryKeyCallBacks: c_void;
    static kCFTypeDictionaryValueCallBacks: c_void;
    fn CFRelease(cf: Ref);
    fn CFGetTypeID(cf: Ref) -> usize;
    fn CFNumberGetTypeID() -> usize;
    fn CFDataCreateWithBytesNoCopy(alloc: Ref, bytes: *const u8, len: isize, dealloc: Ref) -> Ref;
    fn CFDictionaryCreateMutable(alloc: Ref, capacity: isize, keys: *const c_void, values: *const c_void) -> Ref;
    fn CFDictionarySetValue(dict: Ref, key: Ref, value: Ref);
    fn CFNumberCreate(alloc: Ref, kind: isize, value: *const c_void) -> Ref;
    fn CFNumberGetValue(number: Ref, kind: isize, value: *mut c_void) -> bool;
    fn CFStringCreateWithCString(alloc: Ref, s: *const u8, encoding: u32) -> Ref;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGColorSpaceCreateDeviceRGB() -> Ref;
    fn CGColorSpaceRelease(space: Ref);
    fn CGBitmapContextCreate(data: *mut c_void, width: usize, height: usize, bpc: usize, bpr: usize, space: Ref, info: u32) -> Ref;
    fn CGContextRelease(c: Ref);
    fn CGContextSetAllowsFontSubpixelQuantization(c: Ref, v: bool);
    fn CGContextSetShouldSubpixelQuantizeFonts(c: Ref, v: bool);
    fn CGContextSetAllowsFontSubpixelPositioning(c: Ref, v: bool);
    fn CGContextSetShouldSubpixelPositionFonts(c: Ref, v: bool);
    fn CGContextSetTextDrawingMode(c: Ref, mode: i32);
    fn CGContextSetGrayFillColor(c: Ref, gray: f64, alpha: f64);
    fn CGContextSetTextMatrix(c: Ref, t: CGAffineTransform);
    fn CGContextSetShouldAntialias(c: Ref, v: bool);
    fn CGContextSetShouldSmoothFonts(c: Ref, v: bool);
    fn CGAffineTransformInvert(t: CGAffineTransform) -> CGAffineTransform;
    fn CGPointApplyAffineTransform(p: CGPoint, t: CGAffineTransform) -> CGPoint;
    fn CGSizeApplyAffineTransform(s: CGSize, t: CGAffineTransform) -> CGSize;
    fn CGRectApplyAffineTransform(r: CGRect, t: CGAffineTransform) -> CGRect;
    fn CGPathIsEmpty(path: Ref) -> bool;
    fn CGPathRelease(path: Ref);
}

#[link(name = "CoreText", kind = "framework")]
extern "C" {
    static kCTFontVariationAttribute: Ref;
    fn CTFontManagerCreateFontDescriptorFromData(data: Ref) -> Ref;
    fn CTFontCreateWithFontDescriptor(desc: Ref, size: f64, matrix: *const CGAffineTransform) -> Ref;
    fn CTFontDescriptorCreateWithAttributes(attributes: Ref) -> Ref;
    fn CTFontCreateCopyWithAttributes(font: Ref, size: f64, matrix: *const CGAffineTransform, attributes: Ref) -> Ref;
    fn CTFontCopyAttribute(font: Ref, attribute: Ref) -> Ref;
    fn CTFontGetSize(font: Ref) -> f64;
    fn CTFontDrawGlyphs(font: Ref, glyphs: *const u16, positions: *const CGPoint, count: usize, context: Ref);
    fn CTFontGetBoundingRectsForGlyphs(font: Ref, orientation: u32, glyphs: *const u16, rects: *mut CGRect, count: isize) -> CGRect;
    fn CTFontGetAdvancesForGlyphs(font: Ref, orientation: u32, glyphs: *const u16, advances: *mut CGSize, count: isize) -> f64;
    fn CTFontCreatePathForGlyph(font: Ref, glyph: u16, matrix: *const CGAffineTransform) -> Ref;
}

const kCFNumberSInt32Type: isize = 3;
const kCFNumberIntType: isize = 9;
const kCFNumberDoubleType: isize = 13;
const kCFStringEncodingUTF8: u32 = 0x0800_0100;
const kCTFontOrientationHorizontal: u32 = 1;
const kCGTextFill: i32 = 0;
/// Bitmap info: 32-bit little-endian host order, alpha skipped (first).
const BITMAP_INFO: u32 = (2 << 12) | 6;

/// How CoreGraphics smooths glyphs on this platform.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Smooth {
    None,
    Some,
    Subpixel,
}

/// Probes the smoothing behaviour: glyph 3 of a spider symbol font at 16 pt, white on black, drawn smoothed and not.
pub(crate) fn smooth_behavior() -> Smooth {
    static BEHAVIOR: std::sync::OnceLock<Smooth> = std::sync::OnceLock::new();
    *BEHAVIOR.get_or_init(|| unsafe {
        static SPIDER: &[u8] = include_bytes!("spider_symbol.ttf");
        let mut plain = [0u32; 256];
        let mut smooth = [0u32; 256];
        let space = CGColorSpaceCreateDeviceRGB();
        let a = CGBitmapContextCreate(plain.as_mut_ptr() as *mut c_void, 16, 16, 8, 64, space, BITMAP_INFO);
        let b = CGBitmapContextCreate(smooth.as_mut_ptr() as *mut c_void, 16, 16, 8, 64, space, BITMAP_INFO);
        let data = Cf(CFDataCreateWithBytesNoCopy(std::ptr::null(), SPIDER.as_ptr(), SPIDER.len() as isize, kCFAllocatorNull));
        let desc = Cf(CTFontManagerCreateFontDescriptorFromData(data.0));
        let font = Cf(CTFontCreateWithFontDescriptor(desc.0, 16.0, std::ptr::null()));
        for (c, on) in [(a, false), (b, true)] {
            CGContextSetShouldSmoothFonts(c, on);
            CGContextSetShouldAntialias(c, true);
            CGContextSetTextDrawingMode(c, kCGTextFill);
            CGContextSetGrayFillColor(c, 1.0, 1.0);
            let p = CGPoint { x: 0.0, y: 3.0 };
            let g = 3u16;
            CTFontDrawGlyphs(font.0, &g, &p, 1, c);
        }
        CGContextRelease(a);
        CGContextRelease(b);
        CGColorSpaceRelease(space);
        let mut behavior = Smooth::None;
        for x in 0..16 {
            for y in 0..16 {
                let s = smooth[x * 16 + y];
                let (r, g, bl) = ((s >> 16) & 0xFF, (s >> 8) & 0xFF, s & 0xFF);
                if r != g || r != bl {
                    return Smooth::Subpixel;
                }
                if plain[x * 16 + y] != s {
                    behavior = Smooth::Some;
                }
            }
        }
        behavior
    })
}

impl Strike {
    /// How many glyph positions per pixel CoreGraphics' subpixel quantization keeps for this strike (it
    /// depends on the size), found by drawing `glyph` 1/L px right of its origin, from L = 8 down, until
    /// the image differs from the unshifted one.
    pub(crate) fn subpixel_levels(&self, glyph: u16, offscreen: &mut Offscreen) -> u8 {
        let Some(b) = self.bounds(glyph) else { return 1 };
        let b = (b.0, b.1, b.2 + 1, b.3);
        let lut: [u8; 256] = std::array::from_fn(|i| i as u8);
        let mut image = |sub: f64| {
            let mut m = vec![0u8; (b.2 * b.3) as usize];
            offscreen.draw_at(self, glyph, b, &lut, false, Some(sub), &mut m);
            m
        };
        let base = image(0.0);
        for l in [8u8, 6, 5, 4, 3, 2] {
            if image(1.0 / l as f64) != base {
                return l;
            }
        }
        1
    }
}

/// Linearises a CoreGraphics coverage value: (i² + 128) / 255.
fn linear_from_cg(i: u32) -> u32 {
    (i * i + 128) / 255
}

/// An owned CoreFoundation object.
struct Cf(Ref);
impl Drop for Cf {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

fn cf_string(s: &str) -> Cf {
    let mut bytes = s.as_bytes().to_vec();
    bytes.push(0);
    Cf(unsafe { CFStringCreateWithCString(std::ptr::null(), bytes.as_ptr(), kCFStringEncodingUTF8) })
}
fn cf_f64(v: f64) -> Cf {
    Cf(unsafe { CFNumberCreate(std::ptr::null(), kCFNumberDoubleType, &v as *const f64 as *const c_void) })
}
fn cf_i32(v: i32, kind: isize) -> Cf {
    Cf(unsafe { CFNumberCreate(std::ptr::null(), kind, &v as *const i32 as *const c_void) })
}
fn cf_dict() -> Cf {
    unsafe { Cf(CFDictionaryCreateMutable(std::ptr::null(), 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks)) }
}

/// A typeface's CTFont made from font data (at 12 pt) at the font's variation.
pub(crate) struct Typeface {
    font: Cf,
    /// The `opsz` the typeface was made with, if any.
    opsz: Option<f64>,
}

// CoreText objects are immutable and thread-safe once made.
unsafe impl Send for Typeface {}

impl Typeface {
    /// `axes` as [`crate::Font::ct_axes`] gives them; `opsz_set` when `opsz` was among those asked for.
    pub(crate) fn new(data: &'static [u8], axes: &[([u8; 4], f32)], opsz_set: bool) -> Option<Typeface> {
        unsafe {
            let bytes = Cf(CFDataCreateWithBytesNoCopy(std::ptr::null(), data.as_ptr(), data.len() as isize, kCFAllocatorNull));
            let desc = Cf(CTFontManagerCreateFontDescriptorFromData(bytes.0));
            if desc.0.is_null() {
                return None;
            }
            let base = Cf(CTFontCreateWithFontDescriptor(desc.0, 0.0, std::ptr::null()));
            if base.0.is_null() {
                return None;
            }
            if axes.is_empty() {
                return Some(Typeface { font: base, opsz: None });
            }
            let variation = cf_dict();
            for (tag, value) in axes {
                let key = cf_i32(u32::from_be_bytes(*tag) as i32, kCFNumberSInt32Type);
                let value = cf_f64(*value as f64);
                CFDictionarySetValue(variation.0, key.0, value.0);
            }
            let attributes = cf_dict();
            CFDictionarySetValue(attributes.0, kCTFontVariationAttribute, variation.0);
            let vdesc = Cf(CTFontDescriptorCreateWithAttributes(attributes.0));
            let font = Cf(CTFontCreateCopyWithAttributes(base.0, 0.0, std::ptr::null(), vdesc.0));
            if font.0.is_null() {
                return None;
            }
            let opsz = axes.iter().find(|(t, _)| t == b"opsz").filter(|_| opsz_set).map(|(_, v)| *v as f64);
            Some(Typeface { font, opsz })
        }
    }
}

/// A strike's font and transform.
pub(crate) struct Strike {
    font: Cf,
    transform: CGAffineTransform,
    inverse: CGAffineTransform,
    /// [`Strike::subpixel_levels`], once measured (0 until then).
    pub(crate) levels: std::cell::Cell<u8>,
}

unsafe impl Send for Strike {}

impl Strike {
    /// The strike for a text size and the remaining 2×2 `[scaleX, skewX, skewY, scaleY]`.
    pub(crate) fn new(typeface: &Typeface, text_size: f32, sa: [f32; 4], invertible: bool) -> Option<Strike> {
        let [sx, kx, ky, sy] = sa.map(|v| v as f64);
        // The 2×2 as a CoreGraphics affine transform.
        let transform = CGAffineTransform { a: sx, b: -ky, c: -kx, d: sy, tx: 0.0, ty: 0.0 };
        let inverse = if invertible { unsafe { CGAffineTransformInvert(transform) } } else { transform };
        unsafe {
            // An exact copy of the typeface's font at the device text size, its optical size kept.
            let attributes = cf_dict();
            let opsz_key = cf_string("NSCTFontOpticalSizeAttribute");
            let opsz = match typeface.opsz {
                Some(v) => v,
                None => {
                    let attr = Cf(CTFontCopyAttribute(typeface.font.0, opsz_key.0));
                    let mut v = 0.0f64;
                    let ok = !attr.0.is_null() && CFGetTypeID(attr.0) == CFNumberGetTypeID() && CFNumberGetValue(attr.0, kCFNumberDoubleType, &mut v as *mut f64 as *mut c_void) && v > 0.0;
                    if ok {
                        v
                    } else {
                        CTFontGetSize(typeface.font.0)
                    }
                }
            };
            let opsz_value = cf_f64(opsz);
            CFDictionarySetValue(attributes.0, opsz_key.0, opsz_value.0);
            let tracking_key = cf_string("NSCTFontUnscaledTrackingAttribute");
            let zero = cf_i32(0, kCFNumberIntType);
            CFDictionarySetValue(attributes.0, tracking_key.0, zero.0);
            let desc = Cf(CTFontDescriptorCreateWithAttributes(attributes.0));
            let font = Cf(CTFontCreateCopyWithAttributes(typeface.font.0, text_size as f64, std::ptr::null(), desc.0));
            if font.0.is_null() {
                return None;
            }
            Some(Strike { font, transform, inverse, levels: std::cell::Cell::new(0) })
        }
    }

    /// The mask bounds (left, top, width, height), `None` when empty.
    pub(crate) fn bounds(&self, glyph: u16) -> Option<(i32, i32, u32, u32)> {
        self.bounds_sub(glyph, 0.0)
    }

    /// [`Strike::bounds`] of a glyph `sub_x` px right of its whole-pixel origin: the top left must not
    /// move, so only the right edge grows by it before the bounds are rounded out.
    pub(crate) fn bounds_sub(&self, glyph: u16, sub_x: f32) -> Option<(i32, i32, u32, u32)> {
        unsafe {
            let mut advance = CGSize::default();
            CTFontGetAdvancesForGlyphs(self.font.0, kCTFontOrientationHorizontal, &glyph, &mut advance, 1);
            let advance = CGSizeApplyAffineTransform(advance, self.transform);
            let mut rect = CGRect::default();
            CTFontGetBoundingRectsForGlyphs(self.font.0, kCTFontOrientationHorizontal, &glyph, &mut rect, 1);
            let rect = CGRectApplyAffineTransform(rect, self.transform);
            if advance.width == 0.0 && advance.height == 0.0 {
                let path = CTFontCreatePathForGlyph(self.font.0, glyph, std::ptr::null());
                let empty = path.is_null() || CGPathIsEmpty(path);
                if !path.is_null() {
                    CGPathRelease(path);
                }
                if empty {
                    return None;
                }
            }
            // An empty rect.
            if rect.size.width <= 0.0 || rect.size.height <= 0.0 {
                return None;
            }
            // Flip y, round out and outset by 1.
            let l = rect.origin.x as f32;
            let t = (-rect.origin.y - rect.size.height) as f32;
            let r = l + rect.size.width as f32 + sub_x;
            let b = t + rect.size.height as f32;
            let (l, t, r, b) = (l.floor() as i32 - 1, t.floor() as i32 - 1, r.ceil() as i32 + 1, b.ceil() as i32 + 1);
            Some((l, t, (r - l) as u32, (b - t) as u32))
        }
    }
}

/// The CoreGraphics bitmap glyphs are drawn into, grown to powers of two.
pub(crate) struct Offscreen {
    space: Ref,
    context: Ref,
    pixels: Vec<u32>,
    size: (usize, usize),
    /// The subpixel offset of the glyph [`Offscreen::draw_sub`] draws.
    sub_x: f64,
}

unsafe impl Send for Offscreen {}

impl Default for Offscreen {
    fn default() -> Self {
        Offscreen { space: std::ptr::null(), context: std::ptr::null(), pixels: Vec::new(), size: (0, 0), sub_x: 0.0 }
    }
}

impl Drop for Offscreen {
    fn drop(&mut self) {
        unsafe {
            if !self.context.is_null() {
                CGContextRelease(self.context);
            }
            if !self.space.is_null() {
                CGColorSpaceRelease(self.space);
            }
        }
    }
}

impl Offscreen {
    /// Draws an A8 glyph of the given bounds, pre-blended by `lut`, into `out` (`width × height` bytes,
    /// rows top down). `smooth` turns font smoothing on (normal hinting).
    pub(crate) fn draw(&mut self, strike: &Strike, glyph: u16, bounds: (i32, i32, u32, u32), lut: &[u8; 256], smooth: bool, out: &mut [u8]) {
        self.draw_at(strike, glyph, bounds, lut, smooth, None, out)
    }

    /// [`Offscreen::draw`] of a subpixel-positioned glyph: drawn at (−left + sub_x, top + height) with subpixel quantization off.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn draw_sub(&mut self, strike: &Strike, glyph: u16, bounds: (i32, i32, u32, u32), lut: &[u8; 256], smooth: bool, sub_x: f64, out: &mut [u8]) {
        self.sub_x = sub_x;
        self.draw_at(strike, glyph, bounds, lut, smooth, None, out);
        self.sub_x = 0.0;
    }

    /// [`Offscreen::draw`], or with `uikit` = `Some(sub_x)` as a UIKit label's backing store is drawn:
    /// CoreGraphics' default font subpixel positioning and quantization, smoothing off. The glyph is
    /// `sub_x` px right of its whole-pixel origin and its coverage is as drawn.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn draw_at(&mut self, strike: &Strike, glyph: u16, bounds: (i32, i32, u32, u32), lut: &[u8; 256], smooth: bool, uikit: Option<f64>, out: &mut [u8]) {
        let (left, top, gw, gh) = (bounds.0, bounds.1, bounds.2 as usize, bounds.3 as usize);
        unsafe {
            if self.space.is_null() {
                self.space = CGColorSpaceCreateDeviceRGB();
            }
            if self.context.is_null() || self.size.0 < gw || self.size.1 < gh {
                if self.size.0 < gw {
                    self.size.0 = gw.next_power_of_two();
                }
                if self.size.1 < gh {
                    self.size.1 = gh.next_power_of_two();
                }
                if !self.context.is_null() {
                    CGContextRelease(self.context);
                }
                self.pixels = vec![0u32; self.size.0 * self.size.1];
                self.context = CGBitmapContextCreate(self.pixels.as_mut_ptr() as *mut c_void, self.size.0, self.size.1, 8, self.size.0 * 4, self.space, BITMAP_INFO);
                let c = self.context;
                CGContextSetAllowsFontSubpixelQuantization(c, false);
                CGContextSetShouldSubpixelQuantizeFonts(c, false);
                CGContextSetAllowsFontSubpixelPositioning(c, true);
                CGContextSetShouldSubpixelPositionFonts(c, true);
                CGContextSetTextDrawingMode(c, kCGTextFill);
                CGContextSetGrayFillColor(c, 0.0, 1.0);
            }
            let c = self.context;
            CGContextSetShouldAntialias(c, true);
            CGContextSetShouldSmoothFonts(c, smooth);
            CGContextSetAllowsFontSubpixelQuantization(c, uikit.is_some());
            CGContextSetShouldSubpixelQuantizeFonts(c, uikit.is_some());
            // One offscreen serves every strike: the text matrix is set to the strike's.
            CGContextSetTextMatrix(c, strike.transform);
            let width = self.size.0;
            let first = (self.size.1 - gh) * width;
            for y in 0..gh {
                self.pixels[first + y * width..first + y * width + gw].fill(0xFFFF_FFFF);
            }
            let p = CGPoint { x: -left as f64 + uikit.unwrap_or(self.sub_x), y: (top + gh as i32) as f64 };
            let p = CGPointApplyAffineTransform(p, strike.inverse);
            CTFontDrawGlyphs(strike.font.0, &glyph, &p, 1, c);
            for y in 0..gh {
                let row = &self.pixels[first + y * width..first + y * width + gw];
                for (o, &px) in out[y * gw..(y + 1) * gw].iter_mut().zip(row) {
                    let (mut r, mut g, mut b) = ((px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF);
                    if smooth {
                        (r, g, b) = (linear_from_cg(r), linear_from_cg(g), linear_from_cg(b));
                    }
                    let (r, g, b) = (0xFF - r, 0xFF - g, 0xFF - b);
                    *o = lut[((r * 54 + g * 183 + b * 19) >> 8) as usize];
                }
            }
        }
    }
}
