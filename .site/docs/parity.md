# Parity with the live reactiive.io

Method (architecture.md §12): `tools/parity/shoot.ts` captures a page the live sweep's way (1440x900 desktop,
390x844 touch, 3.5 s settle, one scroll-through, full page JPEG q70) plus every visible box with its text, glyph
rect and computed styles; `tools/parity/compare.ts` diffs a local capture against the live one: head fields, element
counts, headings, page height (±1 %), each live text found at the same place (±2 px) with the same size and weight,
and the share of differing pixels (threshold 32/255). Bar: ≤ 0.5 % differing pixels, every text placed.

```sh
bun tools/parity/shoot.ts https://reactiive.io /tmp/live / /inspirations        # the reference
bun exact.mjs web-build --out dist && bun tools/compose.ts && bun tools/serve.ts --port 4310 &
bun tools/parity/shoot.ts http://127.0.0.1:4310 /tmp/local / /inspirations
bun tools/parity/compare.ts /tmp/live /tmp/local
```

## Status

| page | 1440 px | 390 px | texts placed | open |
|---|---|---|---|---|
| `/` | 0.05 % | 0.29 % | 22/23, 20/23 | JSON-LD (phase 6); 3 wrapped paragraphs' glyph boxes 4 px narrower (same lines, same wraps) |
| 404 | 0.05 % | 0.28 % | 12/12 | `twitter:card` is `summary_large_image` (the reference's 404 says `summary`): postbuild, phase 6 |
| `/demos` | hero: every text box at the live place to 0.1 px (title, subtitle, pill); the spiral is random per visit, as live | same | 4/4, 4/4 | the app below is `/demos/app/` in a frame (D10) |
| `/demos/app/` | the Demos app: 0 px against its own build (decisions.md D3) | 0 px | | |
| all other pages | not built yet | | | |

## Open differences (the owner's bar is identity in pixels and in motion: each is to be fixed, none is accepted)

- **Underline offset.** `text-underline-offset` is not a Contract property: the footer links' underlines sit at the
  font's default offset, 2 px higher than the reference's.
- **Icons are images.** The logo and the menu icon are `<img>` of SVG files (the reference inlines `<svg>`), so the
  image count differs (3 vs 0) and their edges antialias slightly differently.
- **The nav underline's hover.** The reference grows a link's underline on hover (`group-hover`); a Contract
  `:hover` look styles the node it is on, not a child, so only the current page's underline shows.
