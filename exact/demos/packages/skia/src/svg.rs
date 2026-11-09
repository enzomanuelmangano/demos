//! `Skia.Path.MakeFromSVGString(d)`: an SVG path's `d` attribute (every command, absolute and
//! relative, arcs included) as a [`Path`].

use lyon::math::{point, vector, Angle};
use lyon::path::builder::SvgPathBuilder;
use lyon::path::{ArcFlags, Path};

struct Tokens<'a> {
    s: &'a [u8],
    i: usize,
}

impl Tokens<'_> {
    fn skip(&mut self) {
        while self.i < self.s.len() && (self.s[self.i].is_ascii_whitespace() || self.s[self.i] == b',') {
            self.i += 1;
        }
    }
    fn command(&mut self) -> Option<u8> {
        self.skip();
        let c = *self.s.get(self.i)?;
        if c.is_ascii_alphabetic() && c != b'e' && c != b'E' {
            self.i += 1;
            Some(c)
        } else {
            None
        }
    }
    fn at_number(&mut self) -> bool {
        self.skip();
        matches!(self.s.get(self.i), Some(c) if c.is_ascii_digit() || *c == b'-' || *c == b'+' || *c == b'.')
    }
    fn number(&mut self) -> Option<f32> {
        self.skip();
        let start = self.i;
        let s = self.s;
        if matches!(s.get(self.i), Some(b'-' | b'+')) {
            self.i += 1;
        }
        let mut dot = false;
        while let Some(&c) = s.get(self.i) {
            if c.is_ascii_digit() {
                self.i += 1;
            } else if c == b'.' && !dot {
                dot = true;
                self.i += 1;
            } else {
                break;
            }
        }
        if matches!(s.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(s.get(self.i), Some(b'-' | b'+')) {
                self.i += 1;
            }
            while matches!(s.get(self.i), Some(c) if c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        std::str::from_utf8(&s[start..self.i]).ok()?.parse().ok()
    }
    /// An arc flag: one digit, which may touch the next number ("a1 1 0 01 2 2").
    fn flag(&mut self) -> Option<bool> {
        self.skip();
        let c = *self.s.get(self.i)?;
        self.i += 1;
        match c {
            b'0' => Some(false),
            b'1' => Some(true),
            _ => None,
        }
    }
}

/// `Skia.Path.MakeFromSVGString(d)`; `None` where `d` does not parse, as Skia's null.
pub fn path_from_svg(d: &str) -> Option<Path> {
    let mut svg = Path::builder().with_svg();
    parse(d, &mut svg)?;
    Some(lyon::path::traits::Build::build(svg))
}

fn parse(d: &str, b: &mut dyn SvgPathBuilder) -> Option<()> {
    let mut t = Tokens { s: d.as_bytes(), i: 0 };
    let mut cmd = t.command()?;
    loop {
        let rel = cmd.is_ascii_lowercase();
        match cmd.to_ascii_uppercase() {
            b'M' => {
                let (x, y) = (t.number()?, t.number()?);
                if rel { b.relative_move_to(vector(x, y)) } else { b.move_to(point(x, y)) }
                // Pairs after a move are lines.
                cmd = if rel { b'l' } else { b'L' };
                if !t.at_number() {
                    cmd = t.command().unwrap_or(0);
                }
                if cmd == 0 {
                    break;
                }
                continue;
            }
            b'L' => {
                let (x, y) = (t.number()?, t.number()?);
                if rel { b.relative_line_to(vector(x, y)) } else { b.line_to(point(x, y)) }
            }
            b'H' => {
                let x = t.number()?;
                if rel { b.relative_horizontal_line_to(x) } else { b.horizontal_line_to(x) }
            }
            b'V' => {
                let y = t.number()?;
                if rel { b.relative_vertical_line_to(y) } else { b.vertical_line_to(y) }
            }
            b'C' => {
                let n: [f32; 6] = [t.number()?, t.number()?, t.number()?, t.number()?, t.number()?, t.number()?];
                if rel {
                    b.relative_cubic_bezier_to(vector(n[0], n[1]), vector(n[2], n[3]), vector(n[4], n[5]))
                } else {
                    b.cubic_bezier_to(point(n[0], n[1]), point(n[2], n[3]), point(n[4], n[5]))
                }
            }
            b'S' => {
                let n: [f32; 4] = [t.number()?, t.number()?, t.number()?, t.number()?];
                if rel {
                    b.smooth_relative_cubic_bezier_to(vector(n[0], n[1]), vector(n[2], n[3]))
                } else {
                    b.smooth_cubic_bezier_to(point(n[0], n[1]), point(n[2], n[3]))
                }
            }
            b'Q' => {
                let n: [f32; 4] = [t.number()?, t.number()?, t.number()?, t.number()?];
                if rel {
                    b.relative_quadratic_bezier_to(vector(n[0], n[1]), vector(n[2], n[3]))
                } else {
                    b.quadratic_bezier_to(point(n[0], n[1]), point(n[2], n[3]))
                }
            }
            b'T' => {
                let (x, y) = (t.number()?, t.number()?);
                if rel { b.smooth_relative_quadratic_bezier_to(vector(x, y)) } else { b.smooth_quadratic_bezier_to(point(x, y)) }
            }
            b'A' => {
                let (rx, ry, rot) = (t.number()?, t.number()?, t.number()?);
                let flags = ArcFlags { large_arc: t.flag()?, sweep: t.flag()? };
                let (x, y) = (t.number()?, t.number()?);
                let (radii, angle) = (vector(rx, ry), Angle::degrees(rot));
                if rel { b.relative_arc_to(radii, angle, flags, vector(x, y)) } else { b.arc_to(radii, angle, flags, point(x, y)) }
            }
            b'Z' => {
                b.close();
                match t.command() {
                    Some(c) => {
                        cmd = c;
                        continue;
                    }
                    None if t.i >= t.s.len() => break,
                    None => return None,
                }
            }
            _ => return None,
        }
        if t.at_number() {
            continue;
        }
        t.skip();
        if t.i >= t.s.len() {
            break;
        }
        cmd = t.command()?;
    }
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_relative_commands_and_arcs() {
        let p = path_from_svg("M288 320a224 224 0 1 0 448 0 224 224 0 1 0-448 0zm544 608H160a32 32 0 0 1-32-32v-96z").unwrap();
        let bb = lyon::algorithms::aabb::bounding_box(p.iter());
        assert!((bb.min.x - 128.0).abs() < 1.0 && (bb.max.x - 832.0).abs() < 1.0, "{bb:?}");
        assert!((bb.min.y - 96.0).abs() < 1.0 && (bb.max.y - 928.0).abs() < 1.0, "{bb:?}");
        let q = path_from_svg("M21.71,11.29l-9-9a1,1,0,0,0-1.42,0L3,13Z").unwrap();
        assert!(q.iter().count() > 3);
        assert!(path_from_svg("M 1 2 X").is_none());
    }
}
