# unused-state

A `state` or `derive` that nothing reads

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

A state nobody reads is still written, still invalidates the plan and still recomputes: dead weight in every commit. A `derive` nobody reads is computed for nothing. The rule counts reads, not writes (`x = 1` is not a read, `x = x + 1` is), in the whole component.

## Bad

```
state noSubpage = false   // never read
```

## Good

```
delete it
```

## Options

none

## Prevents

Leftovers after a port is rewritten (`app.contract` noSubpage).

## When to disable

Disable on the declaration when a later change will read it. Inline: `// contract-lint-disable-next-line unused-state -- reason`, or `// contract-lint-disable-file unused-state`.
