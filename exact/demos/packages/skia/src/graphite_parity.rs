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

