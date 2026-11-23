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

Motion (`tools/parity/motion.ts`): every entrance's keyframes, duration, delay, iterations and five sampled frames,
and every link's and button's cursor, transition and hover look, live against local. Header stillness across in-app
navigations (`tools/parity/nav.ts`, screencast). Interaction states (`tools/parity/states.ts`: the mobile menu,
the scrolled bar, /demos's frame). Performance: `tools/parity/perf.ts`, docs/perf.md.

| page | 1440 px | 390 px | texts placed | motion (1440 / 390) | open |
|---|---|---|---|---|---|
| `/` | 0.05 % | 0.29 % | 22/23, 20/23 | 0 / 0 differences; project-row hover 0 px against live; header still across `/` ↔ `/demos` (0 px, both widths) | JSON-LD (phase 6); 3 wrapped paragraphs' glyph boxes 4 px narrower (same lines, same wraps) |
| 404 | 0.05 % | 0.28 % | 12/12 | shell as `/` | `twitter:card` is `summary_large_image` (the reference's 404 says `summary`): postbuild, phase 6 |
| `/demos` | hero: every text box at the live place to 0.1 px (title, subtitle, pill); the spiral is random per visit, as live | same | 4/4, 4/4 | hero entrances as live (title-in, blur-in 450/550 ms); the grid's card-ins are gone with the grid (D10) | the app below is `/demos/app/` in a frame (D10) |
| `/demos/app/` | the Demos app: 0 px against its own build (decisions.md D3) | 0 px | | |
| all other pages | not built yet | | | |

## Open differences (the owner's bar is identity in pixels and in motion: each is to be fixed, none is accepted)

- **Icons are images.** The logo and the menu icon are `<img>` of SVG files (the reference inlines `<svg>`), so the
  image count differs (3 vs 0) and their edges antialias slightly differently.
- Fixed since (D11, `web/head.css`): the entrance blur, the footer links' underline offset, the nav underline's
  hover growth, the button and link transitions, focus rings, Exact's default link wash/dim/press fade (the reference
  has none), the project rows' hover colour.
- The project rows' tag: the reference's class says `font-mono`, but its `Text` component's font wins: live computes
  Inter (`inter, "inter Fallback", …`), so the rebuild draws Inter too.
