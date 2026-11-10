//! The renderer against Graphite's own formulas: each analytic draw's coverage, read back from
//! the GPU, against [`graphite::reference`] (AnalyticRRectRenderStep run on the CPU) and against
//! values worked out by hand from `analytic_rrect_coverage_fn`; MSAA path fills against the 4×
//! standard sample pattern over Graphite's curve subdivision; analytic clips against
//! `sk_analytic_clip`.

use crate::graphite::{self, reference};
use crate::*;
use exact_gpu::fixture;

const W: u32 = 96;
const H: u32 = 80;

fn render(gpu: &exact_gpu::Gpu, canvas: &Canvas) -> fixture::Pixels {
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let tex = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("parity"),
        size: wgpu::Extent3d { width: W, height: H, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    let mut r = Renderer::default();
    let mut enc = gpu.device.create_command_encoder(&Default::default());
    r.draw(&gpu.device, &gpu.queue, &mut enc, canvas, &view, format, W, H, wgpu::Color::TRANSPARENT);
    gpu.queue.submit([enc.finish()]);
    fixture::read(gpu, &tex).unwrap()
}

fn gpu() -> Option<exact_gpu::Gpu> {
    fixture::device_or_skip(fixture::device())
}

/// The largest |GPU alpha − reference coverage| over the picture, in coverage units.
fn compare(px: &fixture::Pixels, want: impl Fn(u32, u32) -> f32, name: &str) -> f32 {
    let mut worst = 0.0f32;
    let mut at = (0, 0);
    for y in 0..H {
        for x in 0..W {
            let got = px.at(x, y)[3] as f32 / 255.0;
            let d = (got - want(x, y)).abs();
            if d > worst {
                worst = d;
                at = (x, y);
            }
        }
    }
    eprintln!("{name}: max coverage error {worst:.5} at {at:?} (got {}, want {:.4})", px.at(at.0, at.1)[3], want(at.0, at.1));
    worst
}

/// One analytic draw against the CPU reference of its instance.
fn analytic(gpu: &exact_gpu::Gpu, name: &str, draw: impl Fn(&mut Canvas)) -> f32 {
    let mut c = Canvas::default();
    c.begin(1.0);
    draw(&mut c);
    assert!(!c.msaa, "{name}: an analytic draw needs no MSAA");
    assert_eq!(c.rrects.len(), 1, "{name}: one AnalyticRRect instance");
    let cov = reference::raster(&c.rrects[0], W, H);
    let px = render(gpu, &c);
    px.save(&format!("parity-{name}"));
    compare(&px, |x, y| cov[(y * W + x) as usize].unwrap_or(0.0), name)
}

fn white() -> Paint {
    Paint::fill(Color::WHITE)
}

/// Every shape the analytic step draws, filled and stroked, at sub-pixel offsets, rotated,
/// scaled and non-uniformly scaled: the GPU's coverage is the reference's within rounding.
#[test]
fn analytic_coverage_is_graphites() {
    let Some(gpu) = gpu() else { return };
    let xforms: [(&str, Matrix); 5] = [
        ("id", Matrix::IDENTITY),
        ("sub", Matrix::translate(0.37, 0.81)),
        ("rot", Matrix::rotate(0.3).then(Matrix::translate(30.2, 4.6))),
        ("scale", Matrix::scale(2.5, 2.5).then(Matrix::translate(-20.3, -12.7))),
        ("skew", Matrix::rotate(0.5).then(Matrix::scale(1.7, 0.8)).then(Matrix::translate(20.4, 18.9))),
    ];
    let joins = [(Join::Miter, "miter"), (Join::Round, "round"), (Join::Bevel, "bevel")];
    let mut worst = 0.0f32;
    for (xn, m) in xforms {
        let shapes: Vec<(String, Box<dyn Fn(&mut Canvas)>)> = vec![
            ("rect".into(), Box::new(|c: &mut Canvas| c.draw_rect(10.25, 7.6, 30.5, 20.3, &white()))),
            ("thin-rect".into(), Box::new(|c: &mut Canvas| c.draw_rect(10.25, 7.6, 0.6, 20.3, &white()))),
            ("rrect".into(), Box::new(|c: &mut Canvas| c.draw_rrect(12.3, 9.7, 34.1, 24.6, 6.4, &white()))),
            ("circle".into(), Box::new(|c: &mut Canvas| c.draw_circle(30.37, 25.81, 12.3, &white()))),
            ("dot".into(), Box::new(|c: &mut Canvas| c.draw_circle(30.37, 25.81, 0.8, &white()))),
            ("oval".into(), Box::new(|c: &mut Canvas| c.draw_oval(8.6, 12.2, 41.0, 19.5, &white()))),
            ("ring".into(), Box::new(|c: &mut Canvas| c.draw_circle(30.37, 25.81, 12.3, &Paint::stroke(Color::WHITE, 2.6)))),
            ("thin-ring".into(), Box::new(|c: &mut Canvas| c.draw_circle(30.37, 25.81, 12.3, &Paint::stroke(Color::WHITE, 0.4)))),
            ("hairline-ring".into(), Box::new(|c: &mut Canvas| c.draw_circle(30.37, 25.81, 12.3, &Paint::stroke(Color::WHITE, 0.0)))),
            ("rrect-stroke".into(), Box::new(|c: &mut Canvas| c.draw_rrect(12.3, 9.7, 34.1, 24.6, 6.4, &Paint::stroke(Color::WHITE, 3.3)))),
            ("fat-rect-stroke".into(), Box::new(|c: &mut Canvas| c.draw_rect(20.3, 15.2, 6.0, 5.0, &Paint::stroke(Color::WHITE, 7.5)))),
        ];
        for (sn, draw) in shapes {
            let name = format!("{sn}-{xn}");
            worst = worst.max(analytic(&gpu, &name, |c| {
                c.concat(m);
                draw(c)
            }));
        }
        for (join, jn) in joins {
            let name = format!("rect-stroke-{jn}-{xn}");
            worst = worst.max(analytic(&gpu, &name, |c| {
                c.concat(m);
                c.draw_rect(10.25, 7.6, 30.5, 20.3, &Paint::stroke(Color::WHITE, 3.7).caps(Cap::Butt, join));
            }));
        }
        for (cap, cn) in [(Cap::Butt, "butt"), (Cap::Round, "round"), (Cap::Square, "square")] {
            let name = format!("line-{cn}-{xn}");
            worst = worst.max(analytic(&gpu, &name, |c| {
                c.concat(m);
                c.draw_line(point(8.3, 10.6), point(52.7, 33.1), &Paint::stroke(Color::WHITE, 3.1).caps(cap, Join::Miter));
            }));
        }
        worst = worst.max(analytic(&gpu, &format!("hairline-{xn}"), |c| {
            c.concat(m);
            c.draw_line(point(8.3, 10.6), point(52.7, 33.1), &Paint::stroke(Color::WHITE, 0.0));
        }));
    }
    eprintln!("analytic: max coverage error over all cases {worst:.5}");
    // 8-bit output: the GPU rounds coverage to the nearest 1/255.
    assert!(worst <= 0.5 / 255.0 + 1e-4, "{worst}");
}

/// Values worked out by hand from Graphite's formulas, which a straight area or distance
/// estimate would not give.
#[test]
fn analytic_coverage_matches_hand_values() {
    let Some(gpu) = gpu() else { return };
    let alpha = |draw: &dyn Fn(&mut Canvas), x: u32, y: u32| {
        let mut c = Canvas::default();
        c.begin(1.0);
        draw(&mut c);
        render(&gpu, &c).at(x, y)[3] as f32
    };
    let close = |got: f32, cov: f32| (got - cov * 255.0).abs() <= 0.6;
    // A rect edge at x = 10.3: pixel 10's centre is 0.2 inside: 0.5 + 0.2.
    let a = alpha(&|c| c.draw_rect(10.3, 5.0, 30.0, 20.0, &white()), 10, 10);
    assert!(close(a, 0.7), "{a}");
    let a = alpha(&|c| c.draw_rect(10.3, 5.0, 30.0, 20.0, &white()), 40, 10);
    assert!(close(a, 0.3), "{a}");
    // A rect 0.4 wide over pixel 10: scale 0.4, bias 1 − 0.2: 0.4 · (0.2 + 0.8) = 0.4.
    let a = alpha(&|c| c.draw_rect(10.3, 5.0, 0.4, 20.0, &white()), 10, 10);
    assert!(close(a, 0.4), "{a}");
    // A circle of radius 19.8 about (50, 50.5): pixel (69, 50)'s centre is ρ = 19.5 from it,
    // inside the mesh's inner part: the first-order distance (r² − ρ²) / 2ρ = 0.30231 → 0.80231
    // (the exact distance would give 0.8).
    let a = alpha(&|c| c.draw_circle(50.0, 50.5, 19.8, &white()), 69, 50);
    assert!(close(a, 0.802_31), "{a}");
    // Radius 20.25, pixel (70, 50) is 0.25 outside, in the outset band on the axis: there the
    // local position stays on the curve and the device outset counts linearly: 0.5 − 0.25.
    let a = alpha(&|c| c.draw_circle(50.0, 50.5, 20.25, &white()), 70, 50);
    assert!(close(a, 0.25), "{a}");
}

/// A pixel-aligned filled rect is Graphite's non-AA bounds draw: whole pixels, no instance.
#[test]
fn a_pixel_aligned_rect_is_not_antialiased() {
    let Some(gpu) = gpu() else { return };
    let mut c = Canvas::default();
    c.begin(2.0);
    c.draw_rect(5.0, 5.5, 10.0, 7.0, &white());
    assert!(c.rrects.is_empty() && !c.msaa);
    let px = render(&gpu, &c);
    assert_eq!(px.at(10, 11)[3], 255);
    assert_eq!(px.at(10, 10)[3], 0);
    assert_eq!(px.at(29, 20)[3], 255);
    assert_eq!(px.at(30, 20)[3], 0);
}

/// The winding number of the polygons at `p`.
fn winding(polys: &[Vec<Point>], p: Point) -> i32 {
    let mut w = 0;
    for poly in polys {
        let n = poly.len();
        for i in 0..n {
            let (a, b) = (poly[i], poly[(i + 1) % n]);
            let side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
            if a.y <= p.y && b.y > p.y && side > 0.0 {
                w += 1;
            } else if a.y > p.y && b.y <= p.y && side < 0.0 {
                w -= 1;
            }
        }
    }
    w
}

/// A path fill is Graphite's stencil-and-cover with 4× MSAA: per pixel, the standard 4-sample
/// pattern ((0.375, 0.125), (0.875, 0.375), (0.125, 0.625), (0.625, 0.875)) inside the polygon
/// Graphite's wedges make of the curves, averaged.
#[test]
fn path_fills_are_4x_msaa_of_graphites_tessellation() {
    let Some(gpu) = gpu() else { return };
    let mut b = Path::builder();
    b.begin(point(10.3, 8.1));
    b.cubic_bezier_to(point(60.0, -10.0), point(80.0, 60.0), point(40.2, 50.7));
    b.quadratic_bezier_to(point(20.0, 70.0), point(15.5, 30.2));
    b.line_to(point(30.0, 25.0));
    b.end(true);
    // A second contour wound the same way (nonzero: it adds nothing where they overlap).
    b.begin(point(50.0, 10.0));
    b.line_to(point(70.0, 12.0));
    b.line_to(point(60.0, 30.0));
    b.end(true);
    let path = b.build();
    let m = Matrix::rotate(0.17).then(Matrix::scale(1.1, 1.05)).then(Matrix::translate(3.3, 1.7));
    let mut c = Canvas::default();
    c.begin(1.0);
    c.concat(m);
    c.draw_path(&path, &white());
    assert!(c.msaa && c.rrects.is_empty());
    let px = render(&gpu, &c);
    px.save("parity-path");
    let mut verbs = Vec::new();
    push_verbs(path.iter(), &mut verbs);
    let mut polys: Vec<Vec<Point>> = Vec::new();
    let mut scratch = Vec::new();
    // The rasterizer's 1/256 px vertex snapping.
    graphite::flatten(&verbs, &m, |_, pts| polys.push(pts.iter().map(|p| point((p.x * 256.0).round() / 256.0, (p.y * 256.0).round() / 256.0)).collect()), &mut scratch);
    const SAMPLES: [(f32, f32); 4] = [(0.375, 0.125), (0.875, 0.375), (0.125, 0.625), (0.625, 0.875)];
    let want = |x: u32, y: u32| SAMPLES.iter().filter(|(sx, sy)| winding(&polys, point(x as f32 + sx, y as f32 + sy)) != 0).count() as f32 / 4.0;
    let worst = compare(&px, want, "path");
    assert!(worst <= 0.5 / 255.0 + 1e-4, "{worst}");
    let partial = (0..H).flat_map(|y| (0..W).map(move |x| (x, y))).filter(|&(x, y)| (1..255).contains(&px.at(x, y)[3])).count();
    assert!(partial > 50, "edges are antialiased: {partial}");
}

/// A rotated rounded-rect clip under a draw in another rotation is `sk_analytic_clip`; a flood
/// under a rounded-rect clip becomes the rounded rect itself.
#[test]
fn clips_are_graphites() {
    let Some(gpu) = gpu() else { return };
    let mut c = Canvas::default();
    c.begin(1.0);
    c.save();
    c.translate(48.0, 40.0);
    c.rotate(0.35);
    c.clip_rrect(-30.2, -20.6, 60.5, 41.3, 9.7);
    c.set_matrix(Matrix::rotate(-0.2).then(Matrix::translate(48.0, 40.0)));
    c.draw_rect(-200.0, -200.0, 400.0, 400.0, &white());
    c.restore();
    assert!(!c.msaa && c.rrects.len() == 1);
    let p = c.paints[0].clip;
    let clip = graphite::AnalyticClip { xform: p[0], rect: p[1], radii_with_inverse: p[2] };
    assert!(clip.radii_with_inverse != [0.0; 4]);
    let px = render(&gpu, &c);
    px.save("parity-clip");
    let worst = compare(&px, |x, y| reference::analytic_clip_alpha(&clip, [x as f32 + 0.5, y as f32 + 0.5]).clamp(0.0, 1.0), "analytic-clip");
    assert!(worst <= 0.5 / 255.0 + 1e-4, "{worst}");

    // <Fill> under clipRRect at 3×: drawn as the rrect.
    let mut a = Canvas::default();
    a.begin(3.0);
    a.save();
    a.clip_rrect(4.3, 3.1, 20.2, 15.7, 5.0);
    a.fill(Color::WHITE);
    a.restore();
    let mut b = Canvas::default();
    b.begin(3.0);
    b.draw_rrect(4.3, 3.1, 20.2, 15.7, 5.0, &white());
    assert_eq!(a.rrects.len(), 1);
    assert_eq!(render(&gpu, &a), render(&gpu, &b));

    // A path clip is drawn into depth with MSAA: the draw keeps to its inside.
    let mut d = Canvas::default();
    d.begin(1.0);
    d.save();
    d.clip_with(|b| {
        b.begin(point(10.0, 10.0));
        b.line_to(point(80.0, 15.0));
        b.line_to(point(30.0, 70.0));
        b.end(true);
    });
    d.fill(Color::WHITE);
    d.restore();
    d.draw_rect(85.0, 60.0, 5.0, 5.0, &white());
    assert!(d.msaa);
    let px = render(&gpu, &d);
    px.save("parity-path-clip");
    assert_eq!(px.at(35, 25)[3], 255);
    assert_eq!(px.at(5, 60)[3], 0);
    // After the restore, the clip no longer applies.
    assert_eq!(px.at(87, 62)[3], 255);
}

/// A shape built with lyon's helpers is drawn as Skia draws `addCircle` / `addRRect` paths.
#[test]
fn shape_paths_take_the_analytic_step() {
    let mut c = Canvas::default();
    c.begin(1.0);
    c.draw_with(&white(), |b| add_circle(b, 20.0, 20.0, 7.5));
    c.draw_with(&white(), |b| add_rrect(b, 2.0, 3.0, 40.0, 30.0, 6.0));
    c.draw_with(&white(), |b| add_oval(b, 2.0, 3.0, 40.0, 30.0));
    c.draw_path(&rect_path(1.5, 2.5, 10.0, 10.0), &white());
    c.draw_with(&Paint::stroke(Color::WHITE, 2.0), |b| {
        b.begin(point(0.0, 0.0));
        b.line_to(point(10.0, 3.0));
        b.end(false);
    });
    assert_eq!(c.rrects.len(), 5);
    assert!(!c.msaa);
    // A free-form path is not.
    c.draw_with(&white(), |b| {
        b.begin(point(0.0, 0.0));
        b.cubic_bezier_to(point(10.0, 0.0), point(10.0, 10.0), point(0.0, 10.0));
        b.end(true);
    });
    assert!(c.msaa);
    assert_eq!(c.rrects.len(), 5);
}

/// Inside a convex polygon (either winding).
fn in_convex(poly: &[Point], p: Point) -> bool {
    let n = poly.len();
    let (mut pos, mut neg) = (false, false);
    for i in 0..n {
        let (a, b) = (poly[i], poly[(i + 1) % n]);
        let c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        pos |= c > 0.0;
        neg |= c < 0.0;
    }
    !(pos && neg)
}

/// A polyline stroked with straight segments, bevel and miter joins and butt caps: Graphite's
/// stroke tessellator puts its edges exactly on the offset lines, so 4× MSAA of the exact stroke
/// (segment rects, the bevel triangle, the miter wedge) is what the GPU writes.
#[test]
fn straight_strokes_are_4x_msaa_of_the_exact_outline() {
    let Some(gpu) = gpu() else { return };
    let pts = [point(10.3, 12.7), point(60.2, 30.1), point(30.5, 55.9)];
    let m = Matrix::rotate(0.07).then(Matrix::translate(2.3, -1.4));
    let width = 6.3f32;
    for (join, name) in [(Join::Bevel, "bevel"), (Join::Miter, "miter")] {
        let mut c = Canvas::default();
        c.begin(1.0);
        c.concat(m);
        c.draw_with(&Paint::stroke(Color::WHITE, width).caps(Cap::Butt, join), |b| {
            b.begin(pts[0]);
            b.line_to(pts[1]);
            b.line_to(pts[2]);
            b.end(false);
        });
        assert!(c.msaa && c.rrects.is_empty());
        let px = render(&gpu, &c);
        px.save(&format!("parity-stroke-{name}"));
        // The outline in device space.
        let d: Vec<Point> = pts.iter().map(|p| m.apply(*p)).collect();
        let r = width * 0.5 * m.max_scale();
        let mut polys: Vec<Vec<Point>> = Vec::new();
        let offs = |a: Point, b: Point| {
            let v = b - a;
            let n = vector(-v.y, v.x) * (r / v.length());
            (v / v.length(), n)
        };
        let (d1, n1) = offs(d[0], d[1]);
        let (d2, n2) = offs(d[1], d[2]);
        let snap = |p: Point| point((p.x * 256.0).round() / 256.0, (p.y * 256.0).round() / 256.0);
        polys.push(vec![d[0] + n1, d[1] + n1, d[1] - n1, d[0] - n1]);
        polys.push(vec![d[1] + n2, d[2] + n2, d[2] - n2, d[1] - n2]);
        let b = d[1];
        for s in [1.0f32, -1.0] {
            let (a1, a2) = (b + n1 * s, b + n2 * s);
            polys.push(vec![b, a1, a2]);
            if join == Join::Miter {
                // Offset lines a1 + t d1 and a2 − u d2 meet beyond the joint on the outer side.
                let den = d1.x * (-d2.y) - d1.y * (-d2.x);
                let t = ((a2.x - a1.x) * (-d2.y) - (a2.y - a1.y) * (-d2.x)) / den;
                if t > 0.0 {
                    let tip = a1 + d1 * t;
                    if (tip - b).length() <= 4.0 * r {
                        polys.push(vec![b, a1, tip, a2]);
                    }
                }
            }
        }
        // The rasterizer's 1/256 px vertex snapping (the bevel's inner corner is the joint).
        for p in polys.iter_mut() {
            for q in p.iter_mut() {
                *q = snap(*q);
            }
        }
        const SAMPLES: [(f32, f32); 4] = [(0.375, 0.125), (0.875, 0.375), (0.125, 0.625), (0.625, 0.875)];
        let want = |x: u32, y: u32| SAMPLES.iter().filter(|(sx, sy)| polys.iter().any(|p| in_convex(p, point(x as f32 + sx, y as f32 + sy)))).count() as f32 / 4.0;
        let worst = compare(&px, want, &format!("stroke-{name}"));
        let off = (0..H).flat_map(|y| (0..W).map(move |x| (x, y))).filter(|&(x, y)| (px.at(x, y)[3] as f32 / 255.0 - want(x, y)).abs() > 0.01).count();
        eprintln!("stroke-{name}: {off} pixels a sample off");
        assert!(worst <= 0.5 / 255.0 + 1e-4, "{name}: {worst} ({off} pixels off)");
    }
}

/// A curved stroke with round caps and joins: its chords stay within Graphite's precision
/// (1/4 px) of the exact offset curve, so a pixel is at most two samples off the exact stroke's
/// and nearly all are exact.
#[test]
fn curved_strokes_follow_the_offset_curve() {
    let Some(gpu) = gpu() else { return };
    let (p0, p1, p2, p3) = (point(8.0, 60.0), point(20.0, -10.0), point(70.0, 90.0), point(88.0, 20.0));
    let width = 5.0;
    let mut c = Canvas::default();
    c.begin(1.0);
    c.draw_with(&Paint::stroke(Color::WHITE, width).caps(Cap::Round, Join::Round), |b| {
        b.begin(p0);
        b.cubic_bezier_to(p1, p2, p3);
        b.end(false);
    });
    let px = render(&gpu, &c);
    px.save("parity-stroke-curve");
    let curve = lyon::geom::CubicBezierSegment { from: p0, ctrl1: p1, ctrl2: p2, to: p3 };
    let samples: Vec<Point> = (0..=4000).map(|k| curve.sample(k as f32 / 4000.0)).collect();
    const S: [(f32, f32); 4] = [(0.375, 0.125), (0.875, 0.375), (0.125, 0.625), (0.625, 0.875)];
    let want = |x: u32, y: u32| {
        S.iter()
            .filter(|(sx, sy)| {
                let q = point(x as f32 + sx, y as f32 + sy);
                samples.iter().any(|s| (*s - q).length() <= width * 0.5)
            })
            .count() as f32
            / 4.0
    };
    let worst = compare(&px, want, "stroke-curve");
    let off = (0..H).flat_map(|y| (0..W).map(move |x| (x, y))).filter(|&(x, y)| (px.at(x, y)[3] as f32 / 255.0 - want(x, y)).abs() > 0.01).count();
    let inked = (0..H).flat_map(|y| (0..W).map(move |x| (x, y))).filter(|&(x, y)| px.at(x, y)[3] > 0).count();
    eprintln!("stroke-curve: {off} of {inked} inked pixels differ from the exact stroke");
    assert!(worst <= 0.5 + 0.5 / 255.0 + 1e-3, "{worst}");
    assert!(off * 10 < inked, "{off} of {inked}");
}


/// Text below SDFT sizes as BitmapTextRenderStep draws it: each glyph's A8 mask at its floored
/// device position (+ ½), sampled 1:1, the paint times the coverage, no MSAA. The expected
/// picture is the atlas's own masks composited on the CPU.
#[cfg(target_vendor = "apple")]
#[test]
fn text_is_graphites_direct_masks() {
    let Some(gpu) = gpu() else { return };
    static OUTFIT: &[u8] = include_bytes!("../../../gpu/fonts/outfit.ttf");
    let font = Font::new(OUTFIT, 16.0).unwrap();
    for (name, m) in [("text", Matrix::scale(2.0, 2.0)), ("text-sub", Matrix::scale(2.0, 2.0).then(Matrix::translate(0.37, 0.71))), ("text-rot", Matrix::rotate(0.2).then(Matrix::scale(2.0, 2.0)).then(Matrix::translate(6.0, 0.0)))] {
        let mut c = Canvas::default();
        c.begin(1.0);
        c.concat(m);
        c.draw_text("Ag%", 3.3, 22.6, &font, &white());
        assert!(!c.msaa, "{name}: text needs no MSAA");
        assert!(matches!(c.ops[..], [Op::Glyphs { .. }]), "{name}: one glyph draw, {:?}", c.ops);
        let px = render(&gpu, &c);
        px.save(&format!("parity-{name}"));
        // The quads' corners and texels, back to coverage per pixel.
        let mut want = vec![0.0f32; (W * H) as usize];
        crate::glyphs::Atlas::with(|atlas| {
            for q in c.indices.chunks(6) {
                let v0 = c.vertices[q[0] as usize];
                let v2 = c.vertices[q[2] as usize];
                let (u0, t0) = (v0.color & 0xffff, v0.color >> 16);
                for y in v0.pos[1] as i32..v2.pos[1] as i32 {
                    for x in v0.pos[0] as i32..v2.pos[0] as i32 {
                        if (0..W as i32).contains(&x) && (0..H as i32).contains(&y) {
                            let tu = u0 + (x - v0.pos[0] as i32) as u32;
                            let tv = t0 + (y - v0.pos[1] as i32) as u32;
                            let a = atlas.pixels[(tv * crate::glyphs::ATLAS_W + tu) as usize] as f32 / 255.0;
                            let w = &mut want[(y as u32 * W + x as u32) as usize];
                            *w = a + *w * (1.0 - a);
                        }
                    }
                }
            }
        });
        let worst = compare(&px, |x, y| want[(y * W + x) as usize], name);
        assert!(worst <= 0.5 / 255.0 + 1e-4, "{name}: {worst}");
        assert!(px.count(|p| p[3] > 200) > 30, "{name}: ink");
    }
}

/// Arcs, SVG arcs and circles inside a bigger path are Skia's conics, tessellated as Graphite
/// tessellates conics (Wang's conic formula): 4× MSAA of that subdivision sample for sample, and
/// its points on the true circle within f32 rounding (where a cubic stand-in is 2.7e-4 r off).
#[test]
fn arcs_and_circles_in_paths_are_conics() {
    let Some(gpu) = gpu() else { return };
    let mut b = Path::builder();
    // addArc: 200° of an oval, closed by a line back.
    add_arc(&mut b, 8.3, 6.1, 50.2, 44.7, -30.0, 200.0);
    // A circle and a rect in the same path (not a lone oval: no analytic draw).
    add_circle(&mut b, 70.4, 52.3, 17.9);
    add_rect(&mut b, 60.0, 8.0, 25.0, 12.0);
    // An SVG arc on a contour.
    b.begin(point(12.0, 70.0));
    add_svg_arc(&mut b, point(12.0, 70.0), point(44.0, 66.0), 19.0, 12.0, 25.0, true, false);
    b.line_to(point(30.0, 78.0));
    b.end(true);
    let path = b.build();
    let mut verbs = Vec::new();
    push_verbs(path.iter(), &mut verbs);
    let conics = verbs.iter().filter(|v| matches!(v, graphite::Verb::Conic(..))).count();
    assert!(verbs.iter().all(|v| !matches!(v, graphite::Verb::Cubic(..))), "{verbs:?}");
    // 200°: two quadrants and 20°; the circle's four; the SVG arc's segments.
    assert!(conics >= 3 + 4 + 1, "{conics}");
    let m = Matrix::rotate(0.07).then(Matrix::translate(1.3, -0.6));
    let mut c = Canvas::default();
    c.begin(1.0);
    c.concat(m);
    c.draw_path(&path, &white());
    assert!(c.msaa && c.rrects.is_empty());
    let px = render(&gpu, &c);
    px.save("parity-conics");
    let mut polys: Vec<Vec<Point>> = Vec::new();
    let mut scratch = Vec::new();
    graphite::flatten(&verbs, &m, |_, pts| polys.push(pts.iter().map(|p| point((p.x * 256.0).round() / 256.0, (p.y * 256.0).round() / 256.0)).collect()), &mut scratch);
    const SAMPLES: [(f32, f32); 4] = [(0.375, 0.125), (0.875, 0.375), (0.125, 0.625), (0.625, 0.875)];
    let want = |x: u32, y: u32| SAMPLES.iter().filter(|(sx, sy)| winding(&polys, point(x as f32 + sx, y as f32 + sy)) != 0).count() as f32 / 4.0;
    let worst = compare(&px, want, "conics");
    assert!(worst <= 0.5 / 255.0 + 1e-4, "{worst}");

    // The circle's tessellation against the circle, in device pixels: conics vs the cubics
    // they stand in for.
    let mut cb = Path::builder();
    add_circle(&mut cb, 0.0, 0.0, 40.0);
    let circle = cb.build();
    let off = |verbs: &[graphite::Verb]| {
        let mut worst = 0.0f64;
        graphite::flatten(verbs, &Matrix::IDENTITY, |_, pts| {
            for p in pts {
                worst = worst.max((((p.x as f64).powi(2) + (p.y as f64).powi(2)).sqrt() - 40.0).abs());
            }
        }, &mut Vec::new());
        worst
    };
    let mut as_conics = Vec::new();
    push_verbs(circle.iter(), &mut as_conics);
    let as_cubics: Vec<graphite::Verb> = {
        let mut v = Vec::new();
        for e in circle.iter() {
            match e {
                PathEvent::Begin { at } => v.push(graphite::Verb::Move(at)),
                PathEvent::Cubic { ctrl1, ctrl2, to, .. } => v.push(graphite::Verb::Cubic(ctrl1, ctrl2, to)),
                PathEvent::End { close: true, .. } => v.push(graphite::Verb::Close),
                _ => {}
            }
        }
        v
    };
    let (e_conic, e_cubic) = (off(&as_conics), off(&as_cubics));
    eprintln!("circle r = 40 px: tessellated points off the circle by {e_conic:.2e} px as conics, {e_cubic:.2e} px as cubics");
    assert!(e_conic < 2e-5, "{e_conic}");
    assert!(e_cubic > 5e-3, "{e_cubic}");
}

/// Our drawing of RN `<Text>` runs against UIKit's, as exact/parity-tools/text-probe dumps it:
/// `TEXT_PROBE=<dump> cargo test -p skia text_probe -- --ignored --nocapture`. Each case is
/// drawn in a box of the probe's size at its origin, white, and compared pixel for pixel
/// (also at the best whole-pixel shift).
#[test]
#[ignore = "needs a text-probe dump"]
fn text_probe() {
    let Some(gpu) = gpu() else { return };
    let Ok(path) = std::env::var("TEXT_PROBE") else { return eprintln!("TEXT_PROBE unset") };
    let dump = std::fs::read_to_string(path).unwrap();
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../");
    let mut lines = dump.lines().peekable();
    let mut case = String::new();
    let mut glyphs = String::new();
    while let Some(l) = lines.next() {
        if let Some(c) = l.strip_prefix("case ") {
            case = c.to_string();
        }
        if l.starts_with("glyphs") {
            glyphs = l.to_string();
        }
        let Some(dims) = l.strip_prefix("pixels ") else { continue };
        let d: Vec<u32> = dims.split(' ').map(|v| v.parse().unwrap()).collect();
        let (w, h) = (d[0], d[1]);
        let hex = lines.next().unwrap();
        let want: Vec<u8> = (0..(w * h) as usize).map(|i| u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap()).collect();
        let f: Vec<&str> = case.split('|').collect();
        let size: f32 = f[1].parse().unwrap();
        let mut text = String::new();
        let mut chars = f[2].chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '\\' && chars.peek() == Some(&'u') {
                chars.next();
                let code: String = (0..4).filter_map(|_| chars.next()).collect();
                text.push(char::from_u32(u32::from_str_radix(&code, 16).unwrap()).unwrap());
            } else {
                text.push(ch);
            }
        }
        let font = if let Some(wt) = f[0].strip_prefix("system-") {
            let weight = match wt {
                "0.4" => 700.0,
                "0.3" => 600.0,
                "0.23" => 500.0,
                _ => 400.0,
            };
            if std::env::var("TEXT_PROBE_SKIA").is_ok() { match_system_font(size, weight).unwrap() } else { match_ui_font(size, weight).unwrap() }
        } else if std::env::var("TEXT_PROBE_SKIA").is_ok() {
            let p = ["gpu/fonts/", "assets/fonts/"].iter().map(|d| format!("{root}{d}{}", f[0])).find(|p| std::path::Path::new(p).exists()).unwrap();
            Font::new(Box::leak(std::fs::read(p).unwrap().into_boxed_slice()), size).unwrap()
        } else {
            let p = ["gpu/fonts/", "assets/fonts/"].iter().map(|d| format!("{root}{d}{}", f[0])).find(|p| std::path::Path::new(p).exists()).unwrap();
            Font::new(Box::leak(std::fs::read(p).unwrap().into_boxed_slice()), size).unwrap().with_ui_layout()
        };
        let mut c = Canvas::default();
        c.begin(3.0);
        let colored = f.len() > 6;
        let fg = if colored { Color::hex(u32::from_str_radix(f[5], 16).unwrap()) } else { Color::WHITE };
        if colored {
            c.draw_rect(-10.0, -10.0, 1000.0, 1000.0, &Paint::fill(Color::hex(u32::from_str_radix(f[6], 16).unwrap())));
        }
        c.draw_text(&text, 0.0, -font.metrics().ascent, &font, &Paint::fill(fg));
        let format = wgpu::TextureFormat::Rgba8Unorm;
        let tex = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = tex.create_view(&Default::default());
        let mut r = Renderer::default();
        let mut enc = gpu.device.create_command_encoder(&Default::default());
        r.draw(&gpu.device, &gpu.queue, &mut enc, &c, &view, format, w, h, wgpu::Color::TRANSPARENT);
        gpu.queue.submit([enc.finish()]);
        let px = fixture::read(&gpu, &tex).unwrap();
        if colored {
            // Written for the screenshot comparison (tools: the probe's composite).
            let name = format!("probe-{}-{}", f[0].replace('.', "_"), f[4].replace('.', "_"));
            if let Ok(dir) = std::env::var("TEXT_PROBE_OUT") {
                std::fs::write(format!("{dir}/{name}.ppm"), px.ppm()).unwrap();
            }
            continue;
        }
        let diff = |dx: i32, dy: i32| {
            let (mut max, mut sum) = (0u32, 0u64);
            for y in 0..h as i32 {
                for x in 0..w as i32 {
                    let (sx, sy) = (x - dx, y - dy);
                    let ours = if sx >= 0 && sy >= 0 && sx < w as i32 && sy < h as i32 { px.at(sx as u32, sy as u32)[3] } else { 0 };
                    let d = (ours as i32 - want[(y as u32 * w + x as u32) as usize] as i32).unsigned_abs();
                    max = max.max(d);
                    sum += d as u64;
                }
            }
            (max, sum as f64 / (w * h) as f64)
        };
        let (m0, a0) = diff(0, 0);
        let best = (-2..=2).flat_map(|dy| (-2..=2).map(move |dx| (dx, dy))).map(|(dx, dy)| (diff(dx, dy), dx, dy)).min_by(|a, b| a.0 .0.cmp(&b.0 .0)).unwrap();
        eprintln!("{case}: max {m0} mean {a0:.3}; best shift ({}, {}) max {} mean {:.3}", best.1, best.2, best.0 .0, best.0 .1);
        let mut run = Vec::new();
        font.glyph_run(&text, &mut run);
        eprintln!("  ours   {}", run.iter().map(|(g, p)| format!("{g}:{p:.6}")).collect::<Vec<_>>().join(" "));
        eprintln!("  uikit  {}", glyphs.trim_start_matches("glyphs "));
    }
}

/// An RN `<Text>` font (`with_ui_layout`) is drawn as UIKit draws it: against
/// tools/uikit_text_reference.c (CoreGraphics with UIKit's backing-store settings, whose output
/// the iOS Simulator matches byte for byte), at sizes across CoreGraphics' 4, 2 and 1 subpixel
/// levels and box origins on each third of a point; and TextKit's measured metrics.
#[cfg(target_os = "macos")]
#[test]
fn uikit_text_is_coregraphics() {
    let Some(gpu) = gpu() else { return };
    let root = env!("CARGO_MANIFEST_DIR");
    let dir = std::env::temp_dir().join(format!("skia-uikit-ref-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let tool = dir.join("ref");
    let built = std::process::Command::new("cc")
        .args(["-O1", "-w", &format!("{root}/tools/uikit_text_reference.c"), "-framework", "CoreText", "-framework", "CoreGraphics", "-framework", "CoreFoundation", "-o"])
        .arg(&tool)
        .status();
    if !built.is_ok_and(|s| s.success()) {
        return eprintln!("no cc; skipped");
    }
    static OUTFIT: &[u8] = include_bytes!("../../../gpu/fonts/outfit.ttf");
    static ANTDESIGN: &[u8] = include_bytes!("../../../gpu/fonts/antdesign-arrow-right-subset.ttf");
    static SFC: &[u8] = include_bytes!("../../../assets/fonts/SF-Compact-Rounded-Medium.otf");
    // TextKit's numbers for AntDesign 20 (the probe's UIFont and NSLayoutManager): hhea, not the
    // USE_TYPO_METRICS typo ascender; the line without the gap.
    let ad = Font::new(ANTDESIGN, 20.0).unwrap().with_ui_layout();
    assert_eq!(-ad.metrics().ascent, 17.773438);
    assert_eq!(ad.ui_line_height(), 20.9375);
    let mut worst = 0u8;
    for (file, data, size, text) in [
        ("../../gpu/fonts/outfit.ttf", OUTFIT, 11.0f32, "Sacrifice it all"),
        ("../../gpu/fonts/outfit.ttf", OUTFIT, 4.0, "tiny text"),
        ("../../assets/fonts/SF-Compact-Rounded-Medium.otf", SFC, 17.0, "Standard Pro"),
        ("../../gpu/fonts/antdesign-arrow-right-subset.ttf", ANTDESIGN, 20.0, "\u{F117}"),
    ] {
        let font = Font::new(data, size).unwrap().with_ui_layout();
        for (ox, oy) in [(2.0f32, 3.0f32), (2.0 + 1.0 / 3.0, 3.0 + 1.0 / 3.0), (2.0 + 2.0 / 3.0, 3.0 + 2.0 / 3.0)] {
            let (w, h) = (W, H);
            let baseline = oy - font.metrics().ascent;
            let mut c = Canvas::default();
            c.begin(3.0);
            c.draw_text(text, ox, baseline, &font, &white());
            assert!(!c.msaa);
            let px = render(&gpu, &c);
            let mut run = Vec::new();
            font.glyph_run(text, &mut run);
            let mut cmd = std::process::Command::new(&tool);
            cmd.arg(format!("{root}/{file}")).arg(size.to_string()).arg(w.to_string()).arg(h.to_string()).arg("3").arg("PQA");
            for (g, pen) in &run {
                cmd.arg(format!("{g}:{:.9},{:.9}", ox + pen, baseline));
            }
            let out = String::from_utf8(cmd.output().unwrap().stdout).unwrap();
            let want: Vec<u8> = (0..(w * h) as usize).map(|i| u8::from_str_radix(&out[2 * i..2 * i + 2], 16).unwrap()).collect();
            assert!(want.iter().any(|&v| v > 0), "{text}: ink");
            let mut case = 0u8;
            for y in 0..h {
                for x in 0..w {
                    case = case.max(px.at(x, y)[3].abs_diff(want[(y * w + x) as usize]));
                }
            }
            eprintln!("{text} {size} at ({ox:.3}, {oy:.3}): {case}");
            worst = worst.max(case);
        }
    }
    eprintln!("uikit text: max error {worst} / 255");
    assert!(worst <= 1, "{worst}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// A continuous circle (r past half the side: the corners overlap along every side) fills as
/// Core Animation does with no crack: 89 × 89 at r 100, white on black at 3×, every pixel more
/// than one in from the edge fully covered along the middle row and column. Its rows match
/// CA's nonzero fill (path_tests::continuous_corners_fill_as_core_animation).
#[test]
fn a_continuous_circle_has_no_msaa_crack() {
    let Some(gpu) = gpu() else { return };
    let path = continuous_rrect_path(10.0, 10.0, 89.0, 89.0, 100.0);
    let (w, h) = (330u32, 330u32);
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let tex = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    let mut c = Canvas::default();
    c.begin(3.0);
    c.draw_path(&path, &white());
    let mut r = Renderer::default();
    let mut enc = gpu.device.create_command_encoder(&Default::default());
    r.draw(&gpu.device, &gpu.queue, &mut enc, &c, &view, format, w, h, wgpu::Color::BLACK);
    gpu.queue.submit([enc.finish()]);
    let px = fixture::read(&gpu, &tex).unwrap();
    px.save("parity-continuous-circle");
    // The middle (y 54.5 pt = 163 px) row from the left edge (30 px), the middle column from the
    // bottom (297 px), and the top row and right column.
    let mid = 163;
    let row: Vec<u8> = (28..40).map(|x| px.at(x, mid)[0]).collect();
    let col: Vec<u8> = (288..300).rev().map(|y| px.at(mid, y)[0]).collect();
    eprintln!("left edge, middle row: {row:?}\nbottom edge, middle column: {col:?}");
    for x in 31..296 {
        assert_eq!(px.at(x, mid)[0], 255, "row {mid}, x {x}: {row:?}");
        assert_eq!(px.at(mid, x)[0], 255, "column {mid}, y {x}: {col:?}");
    }
}
