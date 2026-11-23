# corner-shape-continuous

A rounded node takes `corner-shape="-exact-continuous"`

- Severity in `recommended`: **warn**
- Autofix: yes: appends the attribute
- Origin: port of refined `border-radius-with-curve`

## Why

iOS rounds every system shape with a continuous (squircle) curve, not a circular arc. A plain `border-radius` draws a circular arc that reads as a different, slightly harsher shape next to a system control. `corner-shape="-exact-continuous"` is React Native's `borderCurve: 'continuous'` (the layer's `cornerCurve = .continuous`). `corner-shape="squircle"` is the CSS superellipse, another curve, and is reported too. A circle or a pill whose radius is at least half of both known sides is left alone (refined makes the same exception): Core Animation draws a continuous pill unclamped, flatter than a semicircle, so a plain circle must stay plain unless RN set the curve. Nodes inside a `canvas` are not boxes. Every radius `0` is not rounded.

## Bad

```
view width=80 height=40 border-radius=12
```

## Good

```
view width=80 height=40 border-radius=12 corner-shape="-exact-continuous"
```

## Options

`ignoreCircles` (default `true`): leave circles and pills alone.

## Prevents

Ports that kept RN's `borderCurve` off by accident; the "Corners" trap in `port-demo` (squircle is a different shape: never use it).

## When to disable

A port of an RN view that has no `borderCurve` keeps a plain `border-radius` (the port rule is the RN numbers): `// contract-lint-disable-next-line corner-shape-continuous -- RN has no borderCurve`. Inline: `// contract-lint-disable-next-line corner-shape-continuous -- reason`, or `// contract-lint-disable-file corner-shape-continuous`.
