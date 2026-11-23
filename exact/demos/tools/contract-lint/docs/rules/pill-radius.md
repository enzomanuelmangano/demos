# pill-radius

A resizing pill authors its radius as height / 2

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

While a `-exact-layout-transition` (or a width/height transition) resizes a box, the iOS host paints it on a layer that takes Core Animation's corner only when the authored radius is at most half the box. `border-radius=999` on a 50 pt pill redraws on the CPU with a different curve every frame. The rule reports a node with such a transition and a literal radius that is over half its known box, or 500 or more.

## Bad

```
view height=50 border-radius=999 -exact-layout-transition=springBouncy()
```

## Good

```
view height=50 border-radius=25 -exact-layout-transition=springBouncy()
```

## Options

`huge` (default `500`).

## Prevents

`fix(exact): pills keep their corner while a layout transition resizes them` (online-offline, composable-text, alert-drawer, steps).

## When to disable

None for a transition node. Inline: `// contract-lint-disable-next-line pill-radius -- reason`, or `// contract-lint-disable-file pill-radius`.
