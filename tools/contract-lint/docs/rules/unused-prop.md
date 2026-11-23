# unused-prop

A prop the component never reads

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

A prop that is declared and handed down but never read keeps every caller wired to something that does nothing. `env` is ignored by default: every demo takes `env` so the root can hand it down, and a demo that needs no screen size does not read it.

## Bad

```
props
  title: string   // never read
```

## Good

```
delete it and the callers' argument
```

## Options

`ignore` (default `["env"]`): prop names to leave alone.

## Prevents

Callers passing arguments that no longer do anything.

## When to disable

Disable on the prop line. Inline: `// contract-lint-disable-next-line unused-prop -- reason`, or `// contract-lint-disable-file unused-prop`.
