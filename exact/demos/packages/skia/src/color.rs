//! Colours as Skia reads them in RN: straight (unpremultiplied) sRGB, from `#rgb`, `#rrggbb`,
//! `#rrggbbaa`, `rgb(…)`, `rgba(…)` or a CSS name.

/// A straight sRGB colour, each channel 0…1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Color(pub [f32; 4]);

impl Color {
    /// Black.
    pub const BLACK: Color = Color([0.0, 0.0, 0.0, 1.0]);
    /// White.
    pub const WHITE: Color = Color([1.0, 1.0, 1.0, 1.0]);
    /// Transparent black.
    pub const TRANSPARENT: Color = Color([0.0, 0.0, 0.0, 0.0]);

    /// From 8-bit channels.
    pub fn rgba8(r: u8, g: u8, b: u8, a: u8) -> Color {
        Color([r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, a as f32 / 255.0])
    }
    /// From 8-bit channels, opaque.
    pub fn rgb8(r: u8, g: u8, b: u8) -> Color {
        Color::rgba8(r, g, b, 255)
    }
    /// From `0xRRGGBB`.
    pub fn hex(rgb: u32) -> Color {
        Color::rgb8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8)
    }
    /// This colour at alpha `a` (0…1), as `Color(c).alpha(a)`.
    pub fn alpha(self, a: f32) -> Color {
        Color([self.0[0], self.0[1], self.0[2], a])
    }

    /// A CSS colour string as `Skia.Color(…)` parses it; black when it cannot.
    pub fn parse(s: &str) -> Color {
        let s = s.trim();
        if let Some(hex) = s.strip_prefix('#') {
            let v = |i: usize, n: usize| u8::from_str_radix(&hex[i..i + n], 16).unwrap_or(0);
            return match hex.len() {
                3 => Color::rgba8(v(0, 1) * 17, v(1, 1) * 17, v(2, 1) * 17, 255),
                4 => Color::rgba8(v(0, 1) * 17, v(1, 1) * 17, v(2, 1) * 17, v(3, 1) * 17),
                6 => Color::rgba8(v(0, 2), v(2, 2), v(4, 2), 255),
                8 => Color::rgba8(v(0, 2), v(2, 2), v(4, 2), v(6, 2)),
                _ => Color::BLACK,
            };
        }
        if let Some(args) = s.strip_prefix("rgba(").or_else(|| s.strip_prefix("rgb(")).and_then(|r| r.strip_suffix(')')) {
            let n: Vec<f32> = args.split(',').filter_map(|p| p.trim().parse().ok()).collect();
            if n.len() >= 3 {
                return Color([n[0] / 255.0, n[1] / 255.0, n[2] / 255.0, n.get(3).copied().unwrap_or(1.0)]);
            }
        }
        match s.to_ascii_lowercase().as_str() {
            "white" => Color::WHITE,
            "black" => Color::BLACK,
            "transparent" => Color::TRANSPARENT,
            "red" => Color::rgb8(255, 0, 0),
            "green" => Color::rgb8(0, 128, 0),
            "lime" => Color::rgb8(0, 255, 0),
            "blue" => Color::rgb8(0, 0, 255),
            "cyan" | "aqua" => Color::rgb8(0, 255, 255),
            "magenta" | "fuchsia" => Color::rgb8(255, 0, 255),
            "yellow" => Color::rgb8(255, 255, 0),
            "orange" => Color::rgb8(255, 165, 0),
            "purple" => Color::rgb8(128, 0, 128),
            "pink" => Color::rgb8(255, 192, 203),
            "gray" | "grey" => Color::rgb8(128, 128, 128),
            "lightblue" => Color::rgb8(173, 216, 230),
            "skyblue" => Color::rgb8(135, 206, 235),
            "gold" => Color::rgb8(255, 215, 0),
            "violet" => Color::rgb8(238, 130, 238),
            "indigo" => Color::rgb8(75, 0, 130),
            "silver" => Color::rgb8(192, 192, 192),
            "navy" => Color::rgb8(0, 0, 128),
            "teal" => Color::rgb8(0, 128, 128),
            _ => Color::BLACK,
        }
    }
}
