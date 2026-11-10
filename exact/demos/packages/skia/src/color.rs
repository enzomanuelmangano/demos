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

    /// The `color` package's `Color(c).lighten(ratio).hex()` (color 4, color-convert): HSL
    /// lightness × (1 + ratio), then each channel rounded to 8 bits as `.hex()` writes it; alpha
    /// kept. In f64 and in color-convert's order of operations, so the rounding is the same.
    pub fn lighten(self, ratio: f64) -> Color {
        self.scale_lightness(1.0, ratio)
    }

    /// The `color` package's `Color(c).darken(ratio).hex()`: HSL lightness × (1 − ratio).
    pub fn darken(self, ratio: f64) -> Color {
        self.scale_lightness(-1.0, ratio)
    }

    fn scale_lightness(self, sign: f64, ratio: f64) -> Color {
        // convert.rgb.hsl, from the 8-bit channels.
        let [r, g, b] = [0, 1, 2].map(|i| (self.0[i] as f64 * 255.0).round() / 255.0);
        let (max, min) = (r.max(g).max(b), r.min(g).min(b));
        let delta = max - min;
        let mut h = if max == min {
            0.0
        } else if r == max {
            (g - b) / delta
        } else if g == max {
            2.0 + (b - r) / delta
        } else {
            4.0 + (r - g) / delta
        };
        h = (h * 60.0).min(360.0);
        if h < 0.0 {
            h += 360.0;
        }
        let l = (min + max) / 2.0;
        let s = if max == min { 0.0 } else if l <= 0.5 { delta / (max + min) } else { delta / (2.0 - max - min) };
        let (s100, mut l100) = (s * 100.0, l * 100.0);
        // lighten / darken: hsl.color[2] ± hsl.color[2] * ratio.
        l100 += sign * (l100 * ratio);
        // convert.hsl.rgb.
        let (h, s, l) = (h / 360.0, s100 / 100.0, l100 / 100.0);
        let mut rgb = [l * 255.0; 3];
        if s != 0.0 {
            let t2 = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
            let t1 = 2.0 * l - t2;
            for (i, out) in rgb.iter_mut().enumerate() {
                let mut t3 = h + 1.0 / 3.0 * -(i as f64 - 1.0);
                if t3 < 0.0 {
                    t3 += 1.0;
                }
                if t3 > 1.0 {
                    t3 -= 1.0;
                }
                let val = if 6.0 * t3 < 1.0 {
                    t1 + (t2 - t1) * 6.0 * t3
                } else if 2.0 * t3 < 1.0 {
                    t2
                } else if 3.0 * t3 < 2.0 {
                    t1 + (t2 - t1) * (2.0 / 3.0 - t3) * 6.0
                } else {
                    t1
                };
                *out = val * 255.0;
            }
        }
        let [r, g, b] = rgb.map(|v| (v.round().clamp(0.0, 255.0) / 255.0) as f32);
        Color([r, g, b, self.0[3]])
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

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(c: Color) -> String {
        let [r, g, b, _] = c.0.map(|v| (v * 255.0).round() as u8);
        format!("#{r:02X}{g:02X}{b:02X}")
    }

    #[test]
    fn lighten_and_darken_match_the_color_package() {
        // What color 4.2.3 prints (node): radar-chart's #E5E600 and #00E5E6 among them.
        assert_eq!(hex(Color::parse("#ffff00").darken(0.1)), "#E5E600");
        assert_eq!(hex(Color::parse("#00ffff").darken(0.1)), "#00E5E6");
        assert_eq!(hex(Color::parse("#336699").darken(0.1)), "#2E5C8A");
        assert_eq!(hex(Color::parse("#FFCC00").darken(0.1)), "#E6B800");
        assert_eq!(hex(Color::parse("#47A1E6").lighten(0.6)), "#E6F2FC");
        assert_eq!(hex(Color::parse("#5BC682").lighten(0.6)), "#DCF3E4");
        assert_eq!(hex(Color::parse("#CD5454").lighten(0.6)), "#F4DADA");
    }
}
