// The shipped configs, as eslint-plugin-refined has them:
//   base         the core style rules (corner shape, hairlines, shadows, touch targets)
//   recommended  every rule at its own severity: style and polish warn, the rules that catch a
//                bug (box-sizing, ...) are errors
//   strict       every rule an error
import { rules } from './rules/index.ts';
import type { LintConfig, RuleSetting } from './types.ts';

const BASE = ['corner-shape-continuous', 'hairline-border', 'shadow-single-property', 'min-touch-target'];

function build(pick: (id: string, severity: 'error' | 'warn') => RuleSetting | undefined): LintConfig {
  const out: Record<string, RuleSetting> = {};
  for (const r of rules) {
    const s = pick(r.meta.id, r.meta.defaultSeverity);
    if (s) out[r.meta.id] = s;
  }
  return { rules: out };
}

export const configs: Record<'base' | 'recommended' | 'strict', LintConfig> = {
  base: build((id, sev) => (BASE.includes(id) ? sev : undefined)),
  recommended: build((_, sev) => sev),
  strict: build(() => 'error'),
};
