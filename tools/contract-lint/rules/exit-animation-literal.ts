import type { Rule } from '../types.ts';

const rule: Rule = {
  meta: {
    id: 'exit-animation-literal',
    description: '`-exact-exit-animation` must be one literal declaration (no `${}`, no expression) or the web target refuses it.',
    defaultSeverity: 'error',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      for (const a of node.attrs) {
        if (a.name !== '-exact-exit-animation') continue;
        if (!/^"[^"$`]*"$/.test(a.value)) {
          report({ at: a, message: '-exact-exit-animation must be a plain string literal: write the curve out (a `${...}` or a computed value makes the web target refuse the build)' });
        }
      }
    }
  },
};
export default rule;
