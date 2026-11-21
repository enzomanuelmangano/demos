# spring-consistency

A spring is a named preset, or names the RN constants it copies

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: adapted from refined `spring-config-consistency`

## Why

refined asks that a `withSpring` config has all of mass, damping and stiffness or none, so the physics never half-defaults. Contract's `-exact-spring(stiffness, damping, mass)` always has all three; the equivalent problem here is a one-off triple that nobody can compare with the others. The demos' 40 springs fall on a handful of shapes. A spring is judged by its natural frequency `w = sqrt(k / m)` and damping ratio `z = c / (2 sqrt(k m))` (mass only scales the other two: `(100, 12, 0.4)` is `(250, 30, 1)`), and must be within 12 % of `w` and 0.04 of `z` of a preset in `demos/motion.contract` (`springSlow`, `springGentle`, `springBouncy`, `springFirm`, `springSnappy`, `springQuick`; read from that file, the rule has a built-in copy when it is missing). A spring copied from RN names its constants in the comment above or beside it (`mass`, `damping`, `stiffness`, `withSpring`, `dampingRatio`, `Reanimated`): that passes, because the port rule is RN's exact numbers.

## Bad

```
transition=`translate -exact-spring(342, 30.3, 1)`
```

## Good

```
transition=`translate ${springGentle()}`
```

## Options

`presetsFile` (default `demos/motion.contract`), `omegaTolerance` (0.12), `zetaTolerance` (0.04).

## Prevents

Eleven slightly different "gentle" springs across the app, each a motion nobody chose.

## When to disable

Put the RN constants in a comment ("mass 1, damping 30.3, stiffness 342") or `contract-lint-disable-next-line spring-consistency`. Inline: `// contract-lint-disable-next-line spring-consistency -- reason`, or `// contract-lint-disable-file spring-consistency`.
