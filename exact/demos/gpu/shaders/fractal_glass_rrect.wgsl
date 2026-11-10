// Fractal Glass's circles as Skia m157 Graphite draws an anti-aliased <Circle>: drawCircle →
// drawOval → drawRRect(oval), a simple shape, so AnalyticRRectRenderStep. This is that step for
// a filled round rect with one circular radius under scale(s) + translate: its 36-vertex
// template (AnalyticRRectRenderStep.cpp, get_per_corner_vertex_attrs), its 69-index triangle
// strip (write_index_buffer), analytic_rrect_vertex_fn (sksl_graphite_vert.sksl) and
// analytic_rrect_coverage_fn (sksl_graphite_frag.sksl), branch for branch. The pipeline tests
// depth LESS with writes, as the step's Renderer does (kUseNonAAInnerFill), so a pixel that two
// triangles of the strip cover takes the first.
struct Mesh {
    // The rect in local points: left, top, right, bottom.
    ltrb: vec4<f32>,
    // The corner radius (points), the scale s (device pixels per point), the AA radius
    // (localAARadius = 1 / s, or -1 when opposite insets intersect: kComplexAAInsets).
    shape: vec4<f32>,
    // The target's texel (0, 0) in device pixels (x, y), the target's size in pixels.
    surface: vec4<f32>,
    // The paint's colour, straight, 8-bit values (alpha 1).
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> m: Mesh;

struct V {
    @builtin(position) pos: vec4<f32>,
    // The local position (points) the edge distances are measured from.
    @location(0) local: vec2<f32>,
    // perPixelControl.
    @location(1) ppc: vec2<f32>,
};

const ROUND: f32 = 0.41421356237; // kRoundScale
const HR2: f32 = 0.70710678118; // 0.5 · √2

fn perp(v: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(-v.y, v.x);
}

@vertex
fn rrect_vs(@builtin(vertex_index) k: u32) -> V {
    // write_index_buffer, kTL = 0, kTR = 9, kBR = 18, kBL = 27.
    var indices = array<u32, 69>(
        0u, 4u, 1u, 5u, 2u, 3u, 5u,
        9u, 13u, 10u, 14u, 11u, 12u, 14u,
        18u, 22u, 19u, 23u, 20u, 21u, 23u,
        27u, 31u, 28u, 32u, 29u, 30u, 32u,
        0u, 4u,
        4u, 6u, 5u, 7u,
        13u, 15u, 14u, 16u,
        22u, 24u, 23u, 25u,
        31u, 33u, 32u, 34u,
        4u, 6u,
        6u, 8u, 7u, 7u, 17u,
        15u, 17u, 16u, 16u, 26u,
        24u, 26u, 25u, 25u, 35u,
        33u, 35u, 34u, 34u, 8u,
        6u);
    // get_per_corner_vertex_attrs: position, normal, normalScale, centerWeight.
    var positions = array<vec2<f32>, 9>(
        vec2(1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 1.0),
        vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0));
    var normals = array<vec2<f32>, 9>(
        vec2(1.0, 0.0), vec2(HR2, HR2), vec2(HR2, HR2), vec2(0.0, 1.0),
        vec2(HR2, HR2), vec2(HR2, HR2), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0));
    var scales = array<f32, 9>(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, -1.0, -1.0, -1.0);
    var weights = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    let index = indices[k];
    let corner = index / 9u;
    let t = index % 9u;
    let position = positions[t];
    let normal = normals[t];
    let normal_scale = scales[t];
    let center_weight = weights[t];

    let ltrb = m.ltrb;
    let xs = vec4<f32>(ltrb.x, ltrb.z, ltrb.z, ltrb.x);
    let ys = vec4<f32>(ltrb.y, ltrb.y, ltrb.w, ltrb.w);
    // Normalised L, T, R, B edge vectors (xs − xs.wxyz).
    let dx = vec4<f32>(0.0, 1.0, 0.0, -1.0);
    let dy = vec4<f32>(-1.0, 0.0, 1.0, 0.0);
    let next = (corner + 1u) % 4u;
    let x_axis = -vec2<f32>(dx[next], dy[next]);
    let y_axis = vec2<f32>(dx[corner], dy[corner]);
    let r = m.shape.x;
    let s = m.shape.y;
    let aa = m.shape.z;
    let radii = vec2<f32>(r);
    let center = vec2<f32>(0.5 * (ltrb.x + ltrb.z), 0.5 * (ltrb.y + ltrb.w));

    var local: vec2<f32>;
    var snap = false;
    if (normal_scale < 0.0) {
        // Filled: center.z = kSolidInterior (1).
        if (aa < 0.0 || center_weight != 0.0) {
            snap = true;
        } else if (any(radii <= vec2<f32>(aa))) {
            local = radii - aa;
        } else {
            local = radii * position - aa * normal;
        }
    } else {
        local = radii * (position + ROUND * position.yx);
    }
    if (snap) {
        local = center;
    } else {
        local = local - radii;
        local = vec2<f32>(xs[corner], ys[corner]) + x_axis * local.x + y_axis * local.y;
    }
    // localToDevice = scale(s) then the target's translation.
    var dev = local * s - m.surface.xy;
    var ppc = vec2<f32>(0.0);
    if (normal_scale > 0.0) {
        // The Jacobian is the inverse's 2 × 2, diag(1 / s); cornerAspectRatio = radii.yx.
        let nx = r * normal.x * perp(-y_axis) / s;
        let ny = r * normal.y * perp(x_axis) / s;
        dev = dev + normalize(nx + ny);
        ppc.y = -1.0;
    }
    ppc.x = select(0.0, 1.0, center_weight != 0.0);
    var o: V;
    o.pos = vec4<f32>(dev.x / m.surface.z * 2.0 - 1.0, 1.0 - dev.y / m.surface.w * 2.0, 0.5, 1.0);
    o.local = local;
    o.ppc = ppc;
    return o;
}

@fragment
fn rrect_fs(in: V) -> @location(0) vec4<f32> {
    let ltrb = m.ltrb;
    let r = m.shape.x;
    let s = m.shape.y;
    // edgeDistances (LTRB, local): dy·(xs − x) − dx·(ys − y).
    let e = vec4<f32>(in.local.x - ltrb.x, in.local.y - ltrb.y, ltrb.z - in.local.x, ltrb.w - in.local.y);
    var c = 1.0;
    if (in.ppc.x <= 0.0) {
        // inverse_grad_len of the axes under diag(1 / s): s.
        let outer = s * min(e.xy, e.zw);
        var d = vec2<f32>(min(outer.x, outer.y), -1.0);
        // A solid interior (perPixelControl.x > −0.95).
        let dim = s * (e.xy + e.zw);
        let scale = min(min(dim.x, dim.y), 1.0);
        let bias = 1.0 - 0.5 * scale;
        let corners = array<vec2<f32>, 4>(e.xy, e.zy, e.zw, e.xw);
        for (var i = 0; i < 4; i = i + 1) {
            let uv = vec2<f32>(r) - corners[i];
            if (all(uv > vec2<f32>(0.0)) && r > 0.0) {
                let norm = uv / (r * r);
                let inv_grad = inverseSqrt(dot(norm / s, norm / s));
                let f = 0.5 * inv_grad * (dot(uv, norm) - 1.0);
                d = min(d, vec2<f32>(-f, -f));
            }
        }
        let outset = min(in.ppc.y, 0.0);
        c = clamp(scale * (min(d.x + outset, -d.y) + bias), 0.0, 1.0);
    }
    return vec4<f32>(m.color.rgb * c, c);
}
