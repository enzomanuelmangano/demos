# rotate-axis-origin

An x/y rotation needs a non-centre `transform-origin`

- Severity in `recommended`: **error**
- Autofix: no
- Origin: project

## Why

exact2 lowers every box `rotate` to Core Animation's `transform.rotation.z` whatever the axis, so a flip about x or y turns flat in the screen's plane while it animates. A non-centre `transform-origin` (`left center` for x, `center top` for y) keeps it sampled as a 3D rotation, and a pure rotation is unchanged by moving the origin along its axis. The web is unaffected, so only the phone shows it.

## Bad

```
view rotate=(open ? "x 0deg" : "x -90deg")
```

## Good

```
view rotate=(open ? "x 0deg" : "x -90deg") transform-origin="left center"
```

## Options

none

## Prevents

`fix(exact): verification-code digits flip about x on iOS`, `everybody-can-cook letters flip in 3D on iOS`.

## When to disable

None. Inline: `// contract-lint-disable-next-line rotate-axis-origin -- reason`, or `// contract-lint-disable-file rotate-axis-origin`.
