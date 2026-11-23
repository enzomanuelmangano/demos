# exit-animation-literal

`-exact-exit-animation` is one literal declaration

- Severity in `recommended`: **error**
- Autofix: no
- Origin: project

## Why

The exit animation is read when the node is built: the web target refuses anything but a plain string, so a `${...}` or an expression breaks the web build (the iOS host may accept it, which hides it). Write the curve out.

## Bad

```
view -exact-exit-animation=`fade ${ms}ms`
```

## Good

```
view -exact-exit-animation="fade 150ms linear both"
```

## Options

none

## Prevents

The `port-demo` trap: "-exact-exit-animation must be one literal declaration".

## When to disable

None. Inline: `// contract-lint-disable-next-line exit-animation-literal -- reason`, or `// contract-lint-disable-file exit-animation-literal`.
