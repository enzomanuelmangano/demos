//! 3D transforms as RN Skia's `Matrix4.ts` builds them for a `<Group transform>` with
//! `perspective`, `rotateX` or `rotateY` (`processTransform3d`): 4×4 row-major matrices acting
//! on column vectors, a list's first operation outermost, so the last one meets a point first.
//! React Native's own view transforms (`transform: [{ perspective }, { rotateX }, …]` with a
//! `transformOrigin`) compose to the same matrices (ReactCommon Transform.cpp, which stores the
//! transpose and multiplies the other way round).
//!
//! A drawing at z = 0 seen through one is [`Matrix4::to_matrix3`] (Skia's `toMatrix3`): a
//! projective 3×3 a shader inverts to find, per pixel, the local point it shows.

use crate::{point, Point};

/// A 4×4 transform, row-major, acting on column vectors `(x, y, z, 1)`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Matrix4(pub [f32; 16]);

impl Matrix4 {
    /// `Matrix4()`.
    pub const IDENTITY: Matrix4 = Matrix4([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);

    /// `translate(x, y, z)`.
    pub fn translate(x: f32, y: f32, z: f32) -> Matrix4 {
        Matrix4([1.0, 0.0, 0.0, x, 0.0, 1.0, 0.0, y, 0.0, 0.0, 1.0, z, 0.0, 0.0, 0.0, 1.0])
    }
    /// `perspective(p)`: w = 1 − z / p.
    pub fn perspective(p: f32) -> Matrix4 {
        Matrix4([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0 / p, 1.0])
    }
    /// `scale(sx, sy, sz)`.
    pub fn scale(sx: f32, sy: f32, sz: f32) -> Matrix4 {
        Matrix4([sx, 0.0, 0.0, 0.0, 0.0, sy, 0.0, 0.0, 0.0, 0.0, sz, 0.0, 0.0, 0.0, 0.0, 1.0])
    }
    /// `rotateX(radians)`: a positive angle takes the top (y < 0) away from the viewer.
    pub fn rotate_x(radians: f32) -> Matrix4 {
        let (s, c) = radians.sin_cos();
        Matrix4([1.0, 0.0, 0.0, 0.0, 0.0, c, -s, 0.0, 0.0, s, c, 0.0, 0.0, 0.0, 0.0, 1.0])
    }
    /// `rotateY(radians)`: a positive angle takes the right (x > 0) away from the viewer.
    pub fn rotate_y(radians: f32) -> Matrix4 {
        let (s, c) = radians.sin_cos();
        Matrix4([c, 0.0, s, 0.0, 0.0, 1.0, 0.0, 0.0, -s, 0.0, c, 0.0, 0.0, 0.0, 0.0, 1.0])
    }
    /// `rotate` / `rotateZ(radians)`: clockwise on screen.
    pub fn rotate_z(radians: f32) -> Matrix4 {
        let (s, c) = radians.sin_cos();
        Matrix4([c, -s, 0.0, 0.0, s, c, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0])
    }

    /// `multiply4(self, b)`: `b` meets a point first. `processTransform3d([A, B])` is
    /// `A.multiply(B)`.
    pub fn multiply(self, b: Matrix4) -> Matrix4 {
        let (a, b) = (self.0, b.0);
        let mut r = [0.0; 16];
        for i in 0..4 {
            for j in 0..4 {
                r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[j + 4] + a[i * 4 + 2] * b[j + 8] + a[i * 4 + 3] * b[j + 12];
            }
        }
        Matrix4(r)
    }

    /// `pivot(m, p)`, a `<Group origin>`: `self` about (x, y).
    pub fn pivot(self, x: f32, y: f32) -> Matrix4 {
        Matrix4::translate(x, y, 0.0).multiply(self).multiply(Matrix4::translate(-x, -y, 0.0))
    }

    /// `toMatrix3`: what it does to the plane z = 0.
    pub fn to_matrix3(&self) -> Matrix3 {
        let m = self.0;
        Matrix3([m[0], m[1], m[3], m[4], m[5], m[7], m[12], m[13], m[15]])
    }
}

/// A projective 3×3 transform (Skia's `SkMatrix` with perspective), row-major, acting on
/// column vectors `(x, y, 1)`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Matrix3(pub [f32; 9]);

impl Matrix3 {
    /// The identity.
    pub const IDENTITY: Matrix3 = Matrix3([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);

    /// Maps a point (with the perspective divide).
    pub fn map(&self, x: f32, y: f32) -> Point {
        let m = self.0;
        let w = m[6] * x + m[7] * y + m[8];
        point((m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w)
    }

    /// The inverse, `None` when singular. (A projective map's inverse is defined up to scale:
    /// this one is the adjugate over the determinant.)
    pub fn invert(&self) -> Option<Matrix3> {
        let [a, b, c, d, e, f, g, h, i] = self.0;
        let (ca, cb, cc) = (e * i - f * h, f * g - d * i, d * h - e * g);
        let det = a * ca + b * cb + c * cc;
        if det.abs() < 1e-12 {
            return None;
        }
        let k = 1.0 / det;
        Some(Matrix3([
            ca * k,
            (c * h - b * i) * k,
            (b * f - c * e) * k,
            cb * k,
            (a * i - c * g) * k,
            (c * d - a * f) * k,
            cc * k,
            (b * g - a * h) * k,
            (a * e - b * d) * k,
        ]))
    }

    /// The rows padded to three `vec4`s, as a WGSL uniform takes a `mat3x3` written by rows.
    pub fn rows(&self) -> [[f32; 4]; 3] {
        let m = self.0;
        [[m[0], m[1], m[2], 0.0], [m[3], m[4], m[5], 0.0], [m[6], m[7], m[8], 0.0]]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotations_take_the_far_edge_away() {
        // perspective 500, rotateX 18°: the top edge (y = −150) recedes, so it shrinks.
        let m = Matrix4::perspective(500.0).multiply(Matrix4::rotate_x(18f32.to_radians())).to_matrix3();
        let top = m.map(150.0, -150.0);
        let bottom = m.map(150.0, 150.0);
        assert!(top.x < 150.0 && bottom.x > 150.0, "{top:?} {bottom:?}");
        let inv = m.invert().unwrap();
        let back = inv.map(top.x, top.y);
        assert!((back.x - 150.0).abs() < 1e-3 && (back.y + 150.0).abs() < 1e-3, "{back:?}");
    }
}
