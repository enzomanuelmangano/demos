//! The canvas into a surface's target, as Graphite renders it: a single-sampled pass unless a
//! draw needs MSAA (a path, a stroke of a path, a clip drawn into depth), then 4× with a resolve;
//! painter's order and clips in the depth buffer (each draw its own depth, tested LESS and
//! written, so a sample takes each draw once); path winding in the stencil; rects, rounded rects,
//! circles and lines through AnalyticRRectRenderStep's mesh and coverage.

use crate::graphite::{reference, RRectInstance};
use crate::{wgpu, Canvas, GpuPaint, Op, Vertex};

/// `ContextOptions::fInternalMultisampleCount`.
const MSAA: u32 = 4;
const DEPTH: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

const SHADER: &str = r#"
struct View { size: vec2<f32>, srgb: f32, _p: f32 };
struct Paint {
    head: vec4<f32>, geometry: vec4<f32>, offsets: array<vec4<f32>, 2>, colors: array<vec4<f32>, 8>,
    clip_xform: vec4<f32>, clip_rect: vec4<f32>, clip_radii: vec4<f32>,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> paints: array<Paint>;
@group(0) @binding(2) var images: texture_2d_array<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var glyph_atlas: texture_2d<f32>;

// Graphite's device-to-NDC step (rtAdjust): x · 2/w − 1, y · −2/h + 1.
fn ndc(p: vec2<f32>, depth: f32) -> vec4<f32> {
    return vec4<f32>(p.x * (2.0 / view.size.x) - 1.0, p.y * (-2.0 / view.size.y) + 1.0, depth, 1.0);
}

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) paint: u32,
    @location(1) px: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) uv: vec2<f32>,
};

@vertex fn vs(@location(0) pos: vec2<f32>, @location(1) depth: f32, @location(2) paint: u32, @location(3) color: u32, @location(4) uv: vec2<f32>) -> Out {
    var o: Out;
    o.pos = ndc(pos, depth);
    o.paint = paint;
    o.px = pos;
    o.color = unpack4x8unorm(color);
    o.uv = uv;
    return o;
}

fn offset(p: Paint, i: u32) -> f32 { return p.offsets[i / 4u][i % 4u]; }

fn ramp(p: Paint, t0: f32) -> vec4<f32> {
    let n = u32(p.head.y);
    let t = clamp(t0, 0.0, 1.0);
    if (t <= offset(p, 0u)) { return p.colors[0]; }
    for (var i = 1u; i < n; i = i + 1u) {
        let o = offset(p, i);
        if (t <= o) {
            let a = offset(p, i - 1u);
            let k = select((t - a) / (o - a), 1.0, o - a <= 0.0);
            return mix(p.colors[i - 1u], p.colors[i], k);
        }
    }
    return p.colors[n - 1u];
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded Display P3 to encoded sRGB (clipped to the sRGB gamut).
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}

// A rounded rect blurred by a Gaussian (Evan Wallace, "Fast Rounded Rectangle Shadows").
fn erf2(x0: vec2<f32>) -> vec2<f32> {
    let s = sign(x0);
    let a = abs(x0);
    var x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    x = x * x;
    return s - s / (x * x);
}
fn gaussian(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066282746 * sigma);
}
fn shadow_x(x: f32, y: f32, sigma: f32, corner: f32, half: vec2<f32>) -> f32 {
    let delta = min(half.y - corner - abs(y), 0.0);
    let curved = half.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
    let integral = 0.5 + 0.5 * erf2((x + vec2<f32>(-curved, curved)) * (0.7071067812 / sigma));
    return integral.y - integral.x;
}
fn shadow(lower: vec2<f32>, upper: vec2<f32>, p0: vec2<f32>, sigma: f32, corner: f32) -> f32 {
    let center = (lower + upper) * 0.5;
    let half = (upper - lower) * 0.5;
    let p = p0 - center;
    let low = p.y - half.y;
    let high = p.y + half.y;
    let start = clamp(-3.0 * sigma, low, high);
    let end = clamp(3.0 * sigma, low, high);
    let step = (end - start) / 4.0;
    var y = start + step * 0.5;
    var value = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        value = value + shadow_x(p.x, p.y - y, sigma, corner, half) * gaussian(y, sigma) * step;
        y = y + step;
    }
    return value;
}

// sk_analytic_clip (sksl_graphite_frag.sksl): the clip's coverage at the device pixel centre.
fn analytic_clip(p: Paint, frag: vec2<f32>) -> f32 {
    if (all(p.clip_radii == vec4<f32>(0.0))) { return 1.0; }
    let xform = p.clip_xform;
    let rect = p.clip_rect;
    let coords = mat2x2<f32>(xform.xy, xform.zw) * frag;
    let signs = sign(p.clip_radii);
    let scale = signs.x;
    let bias = 0.5 * (signs.y + signs.z);
    let radii = abs(p.clip_radii) - 1.0;
    var dxs = coords.x + vec4<f32>(-1.0, 1.0, 1.0, -1.0) * radii - rect.xzzx;
    var dys = coords.y + vec4<f32>(-1.0, -1.0, 1.0, 1.0) * radii - rect.yyww;
    let is_edge = vec4<bool>(dxs.x >= 0.0 || dys.x >= 0.0, dxs.y <= 0.0 || dys.y >= 0.0,
                             dxs.z <= 0.0 || dys.z <= 0.0, dxs.w >= 0.0 || dys.w <= 0.0);
    dxs = select(dxs, vec4<f32>(-0.5, 0.0, 0.5, 0.0), is_edge);
    dys = select(dys, vec4<f32>(0.0, -0.5, 0.0, -0.5), is_edge);
    let gxs = dxs * xform.x + dys * xform.y;
    let gys = dxs * xform.z + dys * xform.w;
    let igl = 0.5 / (abs(gxs) + abs(gys));
    let dist = select(radii * radii - dxs * dxs - dys * dys, vec4<f32>(coords, rect.zw) - vec4<f32>(rect.xy, coords), is_edge);
    let alphas = saturate(0.5 + igl * dist);
    return bias + scale * (alphas.x * alphas.y * alphas.z * alphas.w);
}

// The paint at a fragment, premultiplied, in the target's encoding.
fn shade(p: Paint, px: vec2<f32>, uv0: vec2<f32>, color: vec4<f32>, gx: vec2<f32>, gy: vec2<f32>) -> vec4<f32> {
    let dims = vec2<f32>(textureDimensions(images));
    let kind = u32(p.head.x);
    var c = p.colors[0];
    if (kind == 1u) {
        let a = p.geometry.xy; let d = p.geometry.zw - a;
        c = ramp(p, dot(px - a, d) / max(dot(d, d), 1e-6));
    } else if (kind == 2u) {
        c = ramp(p, length(px - p.geometry.xy) / max(p.geometry.z, 1e-6));
    } else if (kind == 3u) {
        let v = px - p.geometry.xy;
        c = ramp(p, fract(atan2(v.y, v.x) / 6.283185307 + 1.0));
    } else if (kind == 4u) {
        let uv = clamp(uv0, vec2<f32>(0.5), max(p.geometry.xy - vec2<f32>(0.5), vec2<f32>(0.5))) / dims;
        let t = textureSampleGrad(images, smp, uv, i32(p.geometry.z), gx, gy);
        if (p.geometry.w > 0.5) {
            c = vec4<f32>(color.rgb, color.a * t.a);
        } else {
            c = vec4<f32>(t.rgb / max(t.a, 1e-5), t.a) * color;
        }
    } else if (kind == 5u) {
        // In device pixels, or (offsets.z = 1) in the shape's own space: the quad's uv.
        let q = select(px, uv0, p.offsets[0].z > 0.5);
        c.a = c.a * shadow(p.geometry.xy, p.geometry.zw, q, p.offsets[0].y, p.offsets[0].x);
    }
    if (p.head.w > 0.5) { c = vec4<f32>(p3_to_srgb(c.rgb), c.a); }
    if (kind != 4u) { c = c * color; }
    let a = c.a * p.head.z;
    var rgb = c.rgb;
    if (view.srgb > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb * a, a);
}

@fragment fn fs(in: Out) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(images));
    let gx = dpdx(in.uv) / dims;
    let gy = dpdy(in.uv) / dims;
    let p = paints[in.paint];
    return shade(p, in.px, in.uv, in.color, gx, gy) * analytic_clip(p, in.pos.xy);
}

@fragment fn clip() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }

// ---- BitmapTextRenderStep (text_vertex_fn / bitmap_text_coverage_fn), A8 masks ----

struct GOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) paint: u32,
    @location(1) px: vec2<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) atlas: vec2<f32>,
};

@vertex fn vs_glyph(@location(0) pos: vec2<f32>, @location(1) depth: f32, @location(2) paint: u32, @location(3) texel: u32, @location(4) uv: vec2<f32>) -> GOut {
    var o: GOut;
    o.pos = ndc(pos, depth);
    o.paint = paint;
    o.px = pos;
    o.uv = uv;
    o.atlas = vec2<f32>(f32(texel & 0xffffu), f32(texel >> 16u));
    return o;
}

@fragment fn fs_glyph(in: GOut) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(images));
    let gx = dpdx(in.uv) / dims;
    let gy = dpdy(in.uv) / dims;
    let p = paints[in.paint];
    // Nearest: the texel under the pixel centre (the quad sits on whole pixels).
    let coverage = textureLoad(glyph_atlas, vec2<i32>(floor(in.atlas)), 0).r;
    return shade(p, in.px, in.uv, vec4<f32>(1.0), gx, gy) * (coverage * analytic_clip(p, in.pos.xy));
}

// ---- AnalyticRRectRenderStep (analytic_rrect_vertex_fn / analytic_rrect_coverage_fn) ----

struct RIn {
    @location(0) corner: u32,
    @location(1) position: vec2<f32>,
    @location(2) normal: vec2<f32>,
    @location(3) scales: vec2<f32>,
    @location(4) xr: vec4<f32>,
    @location(5) rq: vec4<f32>,
    @location(6) lq: vec4<f32>,
    @location(7) center: vec4<f32>,
    @location(8) mat0: vec3<f32>,
    @location(9) mat1: vec3<f32>,
    @location(10) mat2: vec3<f32>,
    @location(11) depth: f32,
    @location(12) paint: u32,
};

struct ROut {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) paint: u32,
    @location(1) px: vec2<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) jac: vec4<f32>,
    @location(4) edge: vec4<f32>,
    @location(5) @interpolate(flat) xrad: vec4<f32>,
    @location(6) @interpolate(flat) yrad: vec4<f32>,
    @location(7) @interpolate(flat) sp: vec2<f32>,
    @location(8) ppc: vec2<f32>,
};

fn perp(v: vec2<f32>) -> vec2<f32> { return vec2<f32>(-v.y, v.x); }
fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 { return determinant(mat2x2<f32>(a, b)); }

fn inverse3(m: mat3x3<f32>) -> mat3x3<f32> {
    let a00 = m[0].x; let a01 = m[0].y; let a02 = m[0].z;
    let a10 = m[1].x; let a11 = m[1].y; let a12 = m[1].z;
    let a20 = m[2].x; let a21 = m[2].y; let a22 = m[2].z;
    let b01 = a22 * a11 - a12 * a21;
    let b11 = -a22 * a10 + a12 * a20;
    let b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    let id = 1.0 / det;
    return mat3x3<f32>(
        vec3<f32>(b01, -a22 * a01 + a02 * a21, a12 * a01 - a02 * a11) * id,
        vec3<f32>(b11, a22 * a00 - a02 * a20, -a12 * a00 + a02 * a10) * id,
        vec3<f32>(b21, -a21 * a00 + a01 * a20, a11 * a00 - a01 * a10) * id);
}

@vertex fn vs_rrect(v: RIn) -> ROut {
    let ROUND = 0.41421356237;
    var join_scale = 1.0;
    let corner = v.corner;
    let next = (corner + 1u) % 4u;
    let bidir = v.center.z <= 0.0;
    var device_space = false;
    var xs: vec4<f32>;
    var ys: vec4<f32>;
    var edge_aa = vec4<f32>(1.0);
    var stroked_line = false;
    var xrad: vec4<f32>;
    var yrad: vec4<f32>;
    var sp: vec2<f32>;
    if (v.xr.x < -1.0) {
        stroked_line = v.xr.y > 0.0;
        xs = select(v.lq.xzzx, v.lq.xxzz, stroked_line);
        ys = v.lq.yyww;
        if (v.xr.y < 0.0) {
            xrad = -v.xr - 2.0;
            yrad = v.rq;
            sp = vec2<f32>(0.0, 1.0);
        } else {
            xrad = v.rq;
            yrad = xrad;
            sp = v.xr.zw;
            join_scale = select(sign(sp.y), ROUND, sp.y < 0.0);
        }
    } else if (any(v.xr > vec4<f32>(0.0))) {
        xs = v.lq.xzzx;
        ys = v.lq.yyww;
        xrad = v.xr;
        yrad = v.rq;
        sp = vec2<f32>(0.0, -1.0);
    } else {
        xs = v.rq;
        ys = v.lq;
        edge_aa = -v.xr;
        xrad = vec4<f32>(0.0);
        yrad = vec4<f32>(0.0);
        sp = vec2<f32>(0.0, 1.0);
        device_space = true;
    }
    var corner_radii = vec2<f32>(xrad[corner], yrad[corner]);
    if (corner % 2u != 0u) { corner_radii = corner_radii.yx; }
    var aspect = vec2<f32>(1.0);
    if (all(corner_radii > vec2<f32>(0.0))) {
        join_scale = ROUND;
        aspect = corner_radii.yx;
    }
    var dx = xs - xs.wxyz;
    var dy = ys - ys.wxyz;
    let inv_mag = 1.0 / max(abs(dx), max(abs(dy), vec4<f32>(1.0)));
    dx = dx * inv_mag;
    dy = dy * inv_mag;
    var sq = dx * dx + dy * dy;
    let mask = sign(sq);
    var edge_bias = vec4<f32>(0.0);
    var stroke_radius = vec2<f32>(sp.x);
    if (any(mask == vec4<f32>(0.0))) {
        if (all(mask == vec4<f32>(0.0))) {
            dx = vec4<f32>(0.0, 1.0, 0.0, -1.0);
            dy = vec4<f32>(-1.0, 0.0, 1.0, 0.0);
            sq = vec4<f32>(1.0);
        } else {
            let triangle = (mask.x + mask.y + mask.z + mask.w) > 2.5;
            let ex = select(dy.yzwx, dx.yzwx, triangle);
            let ey = select(-dx.yzwx, dy.yzwx, triangle);
            dx = mix(ex, dx, mask);
            dy = mix(ey, dy, mask);
            sq = mix(sq.yzwx, sq, mask);
            edge_aa = mix(edge_aa.yzwx, edge_aa, mask);
            if (!triangle && join_scale == 0.0) {
                stroke_radius = stroke_radius * vec2<f32>(mask[corner], mask[next]);
                edge_bias = (mask - 1.0) * sp.x;
                sp.y = 1.0;
                join_scale = 1.0;
            }
        }
    }
    let inv_len = inverseSqrt(sq);
    dx = dx * inv_len;
    dy = dy * inv_len;
    let x_axis = -vec2<f32>(dx[next], dy[next]);
    let y_axis = vec2<f32>(dx[corner], dy[corner]);
    var local = vec2<f32>(0.0);
    var snap = false;
    if (v.scales.x < 0.0) {
        if (v.center.w < 0.0 || v.scales.y * v.center.z != 0.0) {
            snap = true;
        } else {
            let aa = v.center.w;
            let inset = corner_radii + select(stroke_radius, -stroke_radius, bidir);
            if (join_scale == 1.0 || any(inset <= vec2<f32>(aa))) {
                local = inset - aa;
            } else {
                local = inset * v.position - aa * v.normal;
            }
        }
    } else {
        local = (corner_radii + stroke_radius) * (v.position + join_scale * v.position.yx);
    }
    if (snap) {
        local = v.center.xy;
    } else {
        local = local - corner_radii;
        local = vec2<f32>(xs[corner], ys[corner]) + x_axis * local.x + y_axis * local.y;
    }
    var edge = dy * (xs - local.x) - dx * (ys - local.y) + edge_bias;
    let m = mat3x3<f32>(v.mat0, v.mat1, v.mat2);
    let inv = inverse3(m);
    let dev = m * vec3<f32>(local, 1.0);
    var jac = vec4<f32>(inv[0].xy - inv[0].z * local, inv[1].xy - inv[1].z * local);
    var ppc = vec2<f32>(0.0);
    if (device_space) {
        let gx = -dy * (inv[0].x - inv[0].z * xs) + dx * (inv[0].y - inv[0].z * ys);
        let gy = -dy * (inv[1].x - inv[1].z * xs) + dx * (inv[1].y - inv[1].z * ys);
        edge = edge * inverseSqrt(gx * gx + gy * gy);
        edge = edge + (1.0 - edge_aa) * abs(dev.z);
        let subpixel = all(edge_aa == vec4<f32>(1.0)) && dot(abs(dx * dx.yzwx + dy * dy.yzwx), vec4<f32>(1.0)) < 0.00024;
        if (subpixel) {
            let dim = edge.xy + edge.zw;
            ppc.y = 1.0 + min(min(dim.x, dim.y), abs(dev.z));
        } else {
            ppc.y = 1.0 + abs(dev.z);
        }
    }
    var dpos = dev.xy;
    if (v.scales.x > 0.0 && dev.z > 0.0) {
        let J = mat2x2<f32>(jac.xy, jac.zw);
        let eaan = vec2<f32>(edge_aa[corner], edge_aa[next]) * v.normal;
        var nx = aspect.x * eaan.x * (perp(-y_axis) * J);
        var ny = aspect.y * eaan.y * (perp(x_axis) * J);
        let mid = all(eaan != vec2<f32>(0.0));
        if (join_scale == 1.0 && mid) {
            nx = normalize(nx);
            ny = normalize(ny);
            if (dot(nx, ny) < -0.8) {
                let s = sign(cross2(nx, ny));
                nx = s * perp(nx);
                ny = -s * perp(ny);
            }
        }
        dpos = dpos + dev.z * normalize(nx + ny);
        if (device_space) {
            edge = edge - dev.z;
        } else {
            ppc.y = -dev.z;
        }
    } else if (!device_space) {
        ppc.y = 0.0;
    }
    ppc.x = select(select(0.0, -1.0, bidir), 1.0, v.scales.y != 0.0);
    if (stroked_line) {
        let r = mat2x2<f32>(vec2<f32>(dy.x, -dy.y), vec2<f32>(-dx.x, dx.y)) * mat2x2<f32>(jac.xy, jac.zw);
        jac = vec4<f32>(r[0], r[1]);
    }
    var o: ROut;
    o.pos = ndc(dpos, v.depth);
    o.paint = v.paint;
    o.px = dev.xy;
    let p = paints[v.paint];
    let a = p.offsets[0];
    let b = p.offsets[1];
    o.uv = vec2<f32>(a.x * local.x + a.z * local.y + b.x, a.y * local.x + a.w * local.y + b.y);
    o.jac = jac;
    o.edge = edge;
    o.xrad = xrad;
    o.yrad = yrad;
    o.sp = sp;
    o.ppc = ppc;
    return o;
}

fn inverse_grad_len(g: vec2<f32>, j: mat2x2<f32>) -> f32 {
    let d = g * j;
    return inverseSqrt(dot(d, d));
}

fn elliptical_distance(uv: vec2<f32>, radii: vec2<f32>, sr: f32, j: mat2x2<f32>) -> vec2<f32> {
    let inv_r2 = 1.0 / (radii * radii + sr * sr);
    let n = inv_r2 * uv;
    let igl = inverse_grad_len(n, j);
    let f = 0.5 * igl * (dot(uv, n) - 1.0);
    let width = radii.x * sr * inv_r2.x * igl;
    return vec2<f32>(width - f, width + f);
}

fn corner_distance(d0: vec2<f32>, j: mat2x2<f32>, sp: vec2<f32>, ced: vec2<f32>, flip: vec2<f32>, radii: vec2<f32>) -> vec2<f32> {
    var d = d0;
    let uv = radii - ced;
    if (all(uv > vec2<f32>(0.0))) {
        if (all(radii > vec2<f32>(0.0)) || (sp.x > 0.0 && sp.y < 0.0)) {
            var e = elliptical_distance(uv * flip, radii, sp.x, j);
            e.y = select(-e.y, 1.0, radii.x - sp.x <= 0.0);
            d = min(d, e);
        } else if (sp.y == 0.0) {
            let bevel = (sp.x - uv.x - uv.y) * inverse_grad_len(flip, j);
            d.x = min(d.x, bevel);
        }
    }
    return d;
}

fn rrect_coverage(in: ROut) -> f32 {
    let e = in.edge;
    let sp = in.sp;
    let ppc = in.ppc;
    if (ppc.x > 0.0) { return 1.0; }
    if (ppc.y > 1.0) {
        let od = min(e.xy, e.zw);
        let c = min(od.x, od.y);
        let scale = ppc.y - 1.0;
        let bias = 1.0 - 0.5 * scale;
        return saturate(scale * (c + bias));
    }
    let J = mat2x2<f32>(in.jac.xy, in.jac.zw);
    let igl = vec2<f32>(inverse_grad_len(vec2<f32>(1.0, 0.0), J), inverse_grad_len(vec2<f32>(0.0, 1.0), J));
    let outer = igl * (sp.x + min(e.xy, e.zw));
    var d = vec2<f32>(min(outer.x, outer.y), -1.0);
    var scale: f32;
    var bias: f32;
    if (ppc.x > -0.95) {
        let dim = igl * (e.xy + e.zw + 2.0 * sp.xx);
        scale = min(min(dim.x, dim.y), 1.0);
        bias = 1.0 - 0.5 * scale;
    } else {
        let sw = 2.0 * sp.x * igl;
        let inner = sw - outer;
        d.y = -max(inner.x, inner.y);
        if (sp.x > 0.0) {
            let narrow = min(sw.x, sw.y);
            let dim = select(vec2<f32>(narrow), sw, inner >= vec2<f32>(-0.5));
            scale = saturate(max(dim.x, dim.y));
            bias = 1.0 - 0.5 * scale;
        } else {
            scale = 1.0;
            bias = 1.0;
        }
    }
    d = corner_distance(d, J, sp, e.xy, vec2<f32>(-1.0, -1.0), vec2<f32>(in.xrad.x, in.yrad.x));
    d = corner_distance(d, J, sp, e.zy, vec2<f32>(1.0, -1.0), vec2<f32>(in.xrad.y, in.yrad.y));
    d = corner_distance(d, J, sp, e.zw, vec2<f32>(1.0, 1.0), vec2<f32>(in.xrad.z, in.yrad.z));
    d = corner_distance(d, J, sp, e.xw, vec2<f32>(-1.0, 1.0), vec2<f32>(in.xrad.w, in.yrad.w));
    let outset = min(ppc.y, 0.0);
    return saturate(scale * (min(d.x + outset, -d.y) + bias));
}

@fragment fn fs_rrect(in: ROut) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(images));
    let gx = dpdx(in.uv) / dims;
    let gy = dpdy(in.uv) / dims;
    let p = paints[in.paint];
    let c = shade(p, in.px, in.uv, vec4<f32>(1.0), gx, gy);
    return c * (rrect_coverage(in) * analytic_clip(p, in.pos.xy));
}
"#;

/// Draws [`Canvas`] frames into a surface's targets. One per surface; buffers grow and stay.
#[derive(Default)]
pub struct Renderer {
    built: Option<Built>,
    size: (u32, u32),
    /// The 4× colour target and the depth-stencil attachments (4× and 1×), at `size`.
    msaa: Option<wgpu::TextureView>,
    depth: [Option<wgpu::TextureView>; 2],
    vertices: Option<(wgpu::Buffer, u64)>,
    indices: Option<(wgpu::Buffer, u64)>,
    paints: Option<(wgpu::Buffer, u64)>,
    rrects: Option<(wgpu::Buffer, u64)>,
    bind: Option<wgpu::BindGroup>,
    /// The images paints sample ([`Renderer::set_images`]); a blank layer until set.
    images: Option<wgpu::TextureView>,
    /// This renderer's copy of the glyph atlas: the texture (its height), the atlas epoch it
    /// holds, and how many of the atlas's written masks it has uploaded.
    atlas: Option<(wgpu::Texture, wgpu::TextureView, u32)>,
    atlas_epoch: u64,
    atlas_seen: usize,
}

/// One sample count's pipelines.
struct Pipes {
    tri: wgpu::RenderPipeline,
    tri_once: wgpu::RenderPipeline,
    stencil: wgpu::RenderPipeline,
    cover: wgpu::RenderPipeline,
    clip_cover: wgpu::RenderPipeline,
    rrect: wgpu::RenderPipeline,
    glyph: wgpu::RenderPipeline,
}

struct Built {
    format: wgpu::TextureFormat,
    /// Single-sampled, then 4×.
    pipes: [Pipes; 2],
    layout: wgpu::BindGroupLayout,
    view: wgpu::Buffer,
    blank: wgpu::TextureView,
    blank_mask: wgpu::TextureView,
    sampler: wgpu::Sampler,
    /// AnalyticRRectRenderStep's static vertex and index buffers.
    template: wgpu::Buffer,
    strip: wgpu::Buffer,
}

fn grow(slot: &mut Option<(wgpu::Buffer, u64)>, device: &wgpu::Device, label: &str, usage: wgpu::BufferUsages, size: u64) -> bool {
    if slot.as_ref().is_some_and(|(_, cap)| *cap >= size) {
        return false;
    }
    let cap = size.max(4096).next_power_of_two();
    *slot = Some((device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size: cap, usage: usage | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }), cap));
    true
}

/// The static per-vertex attributes: cornerID, position, normal, (normalScale, centerWeight).
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct TemplateVertex {
    corner: u32,
    position: [f32; 2],
    normal: [f32; 2],
    scales: [f32; 2],
}

impl Renderer {
    /// The images [`crate::Shader::Image`] and [`Canvas::draw_atlas`] sample from now on
    /// (uploaded once: [`crate::Images::upload`] / [`crate::Images::target`]).
    pub fn set_images(&mut self, images: &crate::Images) {
        self.images = Some(images.view.clone());
        self.bind = None;
    }

    /// Draws `canvas` into `target` (`format`, `width`×`height` device pixels), cleared to
    /// `clear` first (premultiplied, in the target's encoding). Records into `encoder`.
    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        canvas: &Canvas,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        clear: wgpu::Color,
    ) {
        if self.built.as_ref().map(|b| b.format) != Some(format) {
            self.built = Some(build(device, queue, format));
            self.bind = None;
            self.msaa = None;
        }
        let (width, height) = (width.max(1), height.max(1));
        if self.size != (width, height) {
            self.size = (width, height);
            self.msaa = None;
            self.depth = [None, None];
        }
        let multisampled = canvas.msaa;
        let k = multisampled as usize;
        let make = |format, samples, label| {
            device
                .create_texture(&wgpu::TextureDescriptor {
                    label: Some(label),
                    size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                    mip_level_count: 1,
                    sample_count: samples,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[],
                })
                .create_view(&Default::default())
        };
        if multisampled && self.msaa.is_none() {
            self.msaa = Some(make(format, MSAA, "skia msaa"));
        }
        if self.depth[k].is_none() {
            self.depth[k] = Some(make(DEPTH, if multisampled { MSAA } else { 1 }, "skia depth"));
        }
        let glyphs = canvas.atlas_epoch != 0;
        if glyphs {
            self.upload_atlas(device, queue);
        }
        let built = self.built.as_ref().unwrap();
        let mut view = [0u8; 16];
        view[..4].copy_from_slice(&(width as f32).to_le_bytes());
        view[4..8].copy_from_slice(&(height as f32).to_le_bytes());
        view[8..12].copy_from_slice(&(if format.is_srgb() { 1.0f32 } else { 0.0 }).to_le_bytes());
        queue.write_buffer(&built.view, 0, &view);

        let vb = bytemuck::cast_slice::<Vertex, u8>(&canvas.vertices);
        let ib = bytemuck::cast_slice::<u32, u8>(&canvas.indices);
        let pb = bytemuck::cast_slice::<GpuPaint, u8>(&canvas.paints);
        let rb = bytemuck::cast_slice::<RRectInstance, u8>(&canvas.rrects);
        grow(&mut self.vertices, device, "skia vertices", wgpu::BufferUsages::VERTEX, vb.len() as u64);
        grow(&mut self.indices, device, "skia indices", wgpu::BufferUsages::INDEX, ib.len() as u64);
        grow(&mut self.rrects, device, "skia rrects", wgpu::BufferUsages::VERTEX, rb.len() as u64);
        if grow(&mut self.paints, device, "skia paints", wgpu::BufferUsages::STORAGE, pb.len().max(std::mem::size_of::<GpuPaint>()) as u64) {
            self.bind = None;
        }
        if !vb.is_empty() {
            queue.write_buffer(&self.vertices.as_ref().unwrap().0, 0, vb);
            queue.write_buffer(&self.indices.as_ref().unwrap().0, 0, ib);
        }
        if !rb.is_empty() {
            queue.write_buffer(&self.rrects.as_ref().unwrap().0, 0, rb);
        }
        if !pb.is_empty() {
            queue.write_buffer(&self.paints.as_ref().unwrap().0, 0, pb);
        }
        // Quads recorded against an atlas cleared since are not drawn (it is cleared between
        // frames, so only a canvas recorded before another's clear and drawn after it).
        let glyphs_ok = glyphs && canvas.atlas_epoch == self.atlas_epoch;
        let bind = self.bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("skia"),
                layout: &built.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: built.view.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: self.paints.as_ref().unwrap().0.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(self.images.as_ref().unwrap_or(&built.blank)) },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&built.sampler) },
                    wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(self.atlas.as_ref().map_or(&built.blank_mask, |a| &a.1)) },
                ],
            })
        });
        let (color, resolve, store) = if multisampled {
            (self.msaa.as_ref().unwrap(), Some(target), wgpu::StoreOp::Discard)
        } else {
            (target, None, wgpu::StoreOp::Store)
        };
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("skia"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: color,
                resolve_target: resolve,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(clear), store },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: self.depth[k].as_ref().unwrap(),
                depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                stencil_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(0), store: wgpu::StoreOp::Discard }),
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        if canvas.ops.is_empty() {
            return;
        }
        let pipes = &built.pipes[k];
        pass.set_bind_group(0, &*bind, &[]);
        if !vb.is_empty() {
            pass.set_vertex_buffer(0, self.vertices.as_ref().unwrap().0.slice(..vb.len() as u64));
            pass.set_index_buffer(self.indices.as_ref().unwrap().0.slice(..ib.len() as u64), wgpu::IndexFormat::Uint32);
        }
        let full = [0, 0, width, height];
        let mut scissor = full;
        // What the pass has bound at slot 0 / the index buffer: the canvas's (false) or the
        // rrect template's (true).
        let mut template = false;
        for op in &canvas.ops {
            let want = match *op {
                Op::Tri { scissor, .. } | Op::Stencil { scissor, .. } | Op::Cover { scissor, .. } | Op::RRects { scissor, .. } | Op::Glyphs { scissor, .. } => scissor,
                Op::ClipCover { .. } => None,
            }
            .map(|[x, y, w, h]| {
                let (x, y) = (x.min(width), y.min(height));
                [x, y, w.min(width - x), h.min(height - y)]
            })
            .unwrap_or(full);
            if want != scissor {
                scissor = want;
                pass.set_scissor_rect(want[0], want[1], want[2], want[3]);
            }
            if want[2] == 0 || want[3] == 0 {
                continue;
            }
            let rebind_canvas = |pass: &mut wgpu::RenderPass<'_>, template: &mut bool| {
                if *template {
                    *template = false;
                    pass.set_vertex_buffer(0, self.vertices.as_ref().unwrap().0.slice(..vb.len() as u64));
                    pass.set_index_buffer(self.indices.as_ref().unwrap().0.slice(..ib.len() as u64), wgpu::IndexFormat::Uint32);
                }
            };
            match *op {
                Op::Tri { start, end, once, .. } => {
                    rebind_canvas(&mut pass, &mut template);
                    pass.set_pipeline(if once { &pipes.tri_once } else { &pipes.tri });
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::Stencil { start, end, .. } => {
                    rebind_canvas(&mut pass, &mut template);
                    pass.set_pipeline(&pipes.stencil);
                    pass.set_stencil_reference(0);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::Cover { start, end, .. } => {
                    rebind_canvas(&mut pass, &mut template);
                    pass.set_pipeline(&pipes.cover);
                    pass.set_stencil_reference(0);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::ClipCover { start, end } => {
                    rebind_canvas(&mut pass, &mut template);
                    pass.set_pipeline(&pipes.clip_cover);
                    pass.set_stencil_reference(0);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::Glyphs { start, end, .. } => {
                    if !glyphs_ok {
                        continue;
                    }
                    rebind_canvas(&mut pass, &mut template);
                    pass.set_pipeline(&pipes.glyph);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::RRects { first, count, .. } => {
                    if !template {
                        template = true;
                        pass.set_vertex_buffer(0, built.template.slice(..));
                        pass.set_index_buffer(built.strip.slice(..), wgpu::IndexFormat::Uint16);
                    }
                    pass.set_vertex_buffer(1, self.rrects.as_ref().unwrap().0.slice(..rb.len() as u64));
                    pass.set_pipeline(&pipes.rrect);
                    pass.draw_indexed(0..reference::INDICES.len() as u32, 0, first..first + count);
                }
            }
        }
    }
}

impl Renderer {
    /// Brings this renderer's atlas texture up to the glyph atlas: what was rasterised since the
    /// last upload (whole rows), all of it after a clear or when the atlas outgrew the texture.
    fn upload_atlas(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        use crate::glyphs::{Atlas, ATLAS_W};
        Atlas::with(|atlas| {
            let height = atlas.height.max(1).next_power_of_two().max(256);
            let mut full = atlas.epoch != self.atlas_epoch;
            if self.atlas.as_ref().is_none_or(|a| a.2 < height) {
                let texture = device.create_texture(&wgpu::TextureDescriptor {
                    label: Some("skia glyph atlas"),
                    size: wgpu::Extent3d { width: ATLAS_W, height, depth_or_array_layers: 1 },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: wgpu::TextureFormat::R8Unorm,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                    view_formats: &[],
                });
                let view = texture.create_view(&Default::default());
                self.atlas = Some((texture, view, height));
                self.bind = None;
                full = true;
            }
            let texture = &self.atlas.as_ref().unwrap().0;
            let write = |y0: u32, y1: u32| {
                let y1 = y1.min(atlas.height);
                if y1 <= y0 {
                    return;
                }
                queue.write_texture(
                    wgpu::TexelCopyTextureInfo { texture, mip_level: 0, origin: wgpu::Origin3d { x: 0, y: y0, z: 0 }, aspect: wgpu::TextureAspect::All },
                    &atlas.pixels[(y0 * ATLAS_W) as usize..(y1 * ATLAS_W) as usize],
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(ATLAS_W), rows_per_image: None },
                    wgpu::Extent3d { width: ATLAS_W, height: y1 - y0, depth_or_array_layers: 1 },
                );
            };
            if full {
                write(0, atlas.height);
            } else if let Some(new) = atlas.dirty.get(self.atlas_seen..) {
                // The rows the masks written since the last upload span.
                let (y0, y1) = new.iter().fold((u32::MAX, 0), |(a, b), &(y0, y1)| (a.min(y0), b.max(y1)));
                write(y0, y1);
            }
            self.atlas_epoch = atlas.epoch;
            self.atlas_seen = atlas.dirty.len();
        });
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat) -> Built {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("skia"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("skia"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2Array, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 3, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            wgpu::BindGroupLayoutEntry {
                binding: 4,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
        ],
    });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("skia"), bind_group_layouts: &[Some(&layout)], immediate_size: 0 });
    let premultiplied = Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING);
    let canvas_buffers = [Some(wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Vertex>() as u64,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32, 2 => Uint32, 3 => Uint32, 4 => Float32x2],
    })];
    let rrect_buffers = [
        Some(wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<TemplateVertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Uint32, 1 => Float32x2, 2 => Float32x2, 3 => Float32x2],
        }),
        Some(wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<RRectInstance>() as u64,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &wgpu::vertex_attr_array![4 => Float32x4, 5 => Float32x4, 6 => Float32x4, 7 => Float32x4, 8 => Float32x3, 9 => Float32x3, 10 => Float32x3, 11 => Float32, 12 => Uint32],
        }),
    ];
    let face = |compare, fail_op, depth_fail_op, pass_op| wgpu::StencilFaceState { compare, fail_op, depth_fail_op, pass_op };
    use wgpu::{CompareFunction as C, StencilOperation as S};
    let keep = face(C::Always, S::Keep, S::Keep, S::Keep);
    struct Desc<'a> {
        vs: &'a str,
        fs: &'a str,
        buffers: &'a [Option<wgpu::VertexBufferLayout<'a>>],
        strip: bool,
        color: bool,
        depth_write: bool,
        /// LEQUAL (steps that may overlap themselves) rather than LESS.
        lequal: bool,
        front: wgpu::StencilFaceState,
        back: wgpu::StencilFaceState,
    }
    let pipeline = |d: Desc<'_>, samples: u32| {
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("skia"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some(d.vs), buffers: d.buffers, compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some(d.fs),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: if d.color { premultiplied } else { None },
                    write_mask: if d.color { wgpu::ColorWrites::ALL } else { wgpu::ColorWrites::empty() },
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: if d.strip { wgpu::PrimitiveTopology::TriangleStrip } else { wgpu::PrimitiveTopology::TriangleList },
                strip_index_format: d.strip.then_some(wgpu::IndexFormat::Uint16),
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH,
                depth_write_enabled: Some(d.depth_write),
                depth_compare: Some(if d.lequal { C::LessEqual } else { C::Less }),
                stencil: wgpu::StencilState { front: d.front, back: d.back, read_mask: 0xff, write_mask: 0xff },
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState { count: samples, ..Default::default() },
            multiview_mask: None,
            cache: None,
        })
    };
    let pipes = |samples: u32| Pipes {
        tri: pipeline(Desc { vs: "vs", fs: "fs", buffers: &canvas_buffers, strip: false, color: true, depth_write: true, lequal: true, front: keep, back: keep }, samples),
        tri_once: pipeline(Desc { vs: "vs", fs: "fs", buffers: &canvas_buffers, strip: false, color: true, depth_write: true, lequal: false, front: keep, back: keep }, samples),
        // kWindingStencilPass: increment front faces, decrement back faces (wrapping); depth
        // tested, not written.
        stencil: pipeline(
            Desc { vs: "vs", fs: "clip", buffers: &canvas_buffers, strip: false, color: false, depth_write: false, lequal: false, front: face(C::Always, S::Keep, S::Keep, S::IncrementWrap), back: face(C::Always, S::Keep, S::Keep, S::DecrementWrap) },
            samples,
        ),
        // kRegularCoverPass: where the winding isn't 0, then reset it.
        cover: pipeline(
            Desc { vs: "vs", fs: "fs", buffers: &canvas_buffers, strip: false, color: true, depth_write: true, lequal: false, front: face(C::NotEqual, S::Keep, S::Zero, S::Zero), back: face(C::NotEqual, S::Keep, S::Zero, S::Zero) },
            samples,
        ),
        // kInverseCoverPass, depth only: a clip element's outside.
        clip_cover: pipeline(
            Desc { vs: "vs", fs: "clip", buffers: &canvas_buffers, strip: false, color: false, depth_write: true, lequal: false, front: face(C::Equal, S::Zero, S::Keep, S::Keep), back: face(C::Equal, S::Zero, S::Keep, S::Keep) },
            samples,
        ),
        rrect: pipeline(Desc { vs: "vs_rrect", fs: "fs_rrect", buffers: &rrect_buffers, strip: true, color: true, depth_write: true, lequal: false, front: keep, back: keep }, samples),
        glyph: pipeline(Desc { vs: "vs_glyph", fs: "fs_glyph", buffers: &canvas_buffers, strip: false, color: true, depth_write: true, lequal: true, front: keep, back: keep }, samples),
    };
    let mut template = Vec::with_capacity(36);
    for corner in 0..4u32 {
        for (position, normal, ns, cw) in reference::TEMPLATE {
            template.push(TemplateVertex { corner, position, normal, scales: [ns, cw] });
        }
    }
    let make_buffer = |label: &str, bytes: &[u8], usage: wgpu::BufferUsages| {
        let size = (bytes.len() as u64).div_ceil(4) * 4;
        let b = device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size, usage: usage | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let mut padded = bytes.to_vec();
        padded.resize(size as usize, 0);
        queue.write_buffer(&b, 0, &padded);
        b
    };
    Built {
        format,
        pipes: [pipes(1), pipes(MSAA)],
        template: make_buffer("skia rrect template", bytemuck::cast_slice(&template), wgpu::BufferUsages::VERTEX),
        strip: make_buffer("skia rrect strip", bytemuck::cast_slice(&reference::INDICES), wgpu::BufferUsages::INDEX),
        layout,
        view: device.create_buffer(&wgpu::BufferDescriptor { label: Some("skia view"), size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        blank: device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("skia no image"),
                size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            })
            .create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() }),
        blank_mask: device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("skia no glyphs"),
                size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::R8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            })
            .create_view(&Default::default()),
        sampler: device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("skia images"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        }),
    }
}

/// A texture a pass renders into and a later pass samples.
pub fn sampled_target(device: &wgpu::Device, label: &str, format: wgpu::TextureFormat, width: u32, height: u32) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
        .create_view(&Default::default())
}

/// A clamped, linear sampler.
pub fn linear_sampler(device: &wgpu::Device) -> wgpu::Sampler {
    device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("skia linear"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    })
}

/// A pipeline drawing one full-screen triangle (the module's `vs`) with fragment `fs`.
pub fn fullscreen_pipeline(
    device: &wgpu::Device,
    module: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    fs: &str,
    format: wgpu::TextureFormat,
    blend: Option<wgpu::BlendState>,
) -> wgpu::RenderPipeline {
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(fs), bind_group_layouts: &[Some(layout)], immediate_size: 0 });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(fs),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module,
            entry_point: Some(fs),
            targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: Default::default(),
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    })
}

/// One full-screen draw into `view`, cleared to transparent first.
pub fn fullscreen_pass(encoder: &mut wgpu::CommandEncoder, label: &str, view: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, bind: &wgpu::BindGroup) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind, &[]);
    pass.draw(0..3, 0..1);
}
