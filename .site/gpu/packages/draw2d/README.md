# draw2d

A small 2D drawing layer on lyon and wgpu, for GPU surfaces: antialiased paths, shapes, gradients,
images, shadows, blurs and text. A frame is recorded into a `Canvas` (paths, circles, rects and
rounded rects with a `Paint`, under transforms, opacity and clips) and `Renderer::draw` puts it
into a wgpu target. lyon tessellates on the CPU, so nothing needs compute or indirect dispatch.

## What it is not

It is not a reimplementation of Skia or react-native-skia and contains none of their code. Its
antialiasing, gradients and text masks follow Skia Graphite's approach and constants so the
Demos app keeps its pixels. It is a helper that simplifies migrating the demos, not a general
graphics library. Short term, a solid existing alternative is preferable where one exists.

## Install

A path dependency inside the Demos repo for now; not published. Long term the crate should be
independent of any machine and publishable.

## Example

```rust,ignore
use draw2d::{Canvas, Color, Paint, Renderer};

let mut renderer = Renderer::default();
let mut canvas = Canvas::default();
canvas.begin(3.0); // device pixels per point
canvas.draw_rrect(10.0, 10.0, 120.0, 80.0, 16.0, &Paint::fill(Color::hex(0x0c86f7)));
// `device`, `queue`, `encoder`, `target` and `format` come from the host's wgpu surface.
renderer.draw(&device, &queue, &mut encoder, &canvas, &target, format, width, height, wgpu::Color::WHITE);
```

## Modules

- `graphite`: the renderer's plan: shapes, paths, strokes and clips.
- `render`: the wgpu passes that draw a canvas.
- `text`: fonts and glyph masks (CoreText on Apple targets, outlines elsewhere).
- `image`: decoded images, mipmapped texture arrays, atlases.
- `svg`: SVG path strings.
- `blur` and `backdrop`: Gaussian and backdrop blur passes.
- `matrix4`: perspective transforms.
- `color` and `continuous_sdf`: colours and continuous rounded corners as a shader.

## Credits

Antialiasing constants, gradient interpolation and glyph-mask handling follow Skia.

## Notice

Skia is Copyright (c) Google Inc., released under the BSD 3-Clause licence;
react-native-skia (Copyright (c) William Candillon and Shopify) is MIT. This crate follows
their approach and API shapes; it contains none of their source. It bundles a
small symbol font, `src/spider_symbol.ttf`, which it draws once to probe how CoreGraphics smooths
fonts.

## Licence

MIT, see [LICENSE](LICENSE).
