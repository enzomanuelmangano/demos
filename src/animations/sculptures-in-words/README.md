# Sculptures in Words

Three articles, three statues: the Venus de Milo, the Victory of Samothrace and
Rodin's Thinker. Each article is about as long as its statue has points:
every letter becomes one point on the figure.

## What it does

- **Scroll** to read. The column is the platform's own `ScrollView`, so the
  momentum, the bounce and the indicator are real.
- **Tap the button** and every letter on screen lifts off the page and lands on
  the statue, which then turns slowly on a turntable. Tap again and the letters
  go back to their places in the text.
- **Swipe sideways** while a statue is showing to move to the next one. The
  letters move from one figure to the other, and the column underneath changes
  to that statue's article.

## How it works

Skia and WebGPU draw every frame on **one Dawn device**. With Skia on Graphite,
`importDevice(Skia.getNativeDevice())` gives react-native-webgpu the same device
Skia renders with, so textures cross between them with no copy.

- **Skia** draws the column at rest: a `Paragraph` set in Newsreader, with
  vector glyph outlines.
- **WebGPU** draws the figure: one instanced quad per letter, with a depth
  buffer so the near side of the statue hides the far side. It renders into a
  texture that Skia composites as an `Image` in the same frame.

The handoff between them is invisible. A glyph atlas is drawn with the
paragraph's own font through the screen's pixel ratio, with four sub-pixel
phases per glyph. The shader reproduces Skia's glyph-origin rounding, so the
WebGPU letters cover exactly the same pixels as Skia's at the first frame of
the morph. Skia's column is hidden with an empty clip rather than opacity,
because a `Group`'s opacity does not reach a `Paragraph`.

The point clouds in `assets/*.bin` are float32 records of
`x, y, z, nx, ny, nz, ao`, one per letter. They are fetched as raw bytes, and
Metro serves `.bin` verbatim.
