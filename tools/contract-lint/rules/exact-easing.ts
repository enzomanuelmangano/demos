import type { Rule } from '../types.ts';

const rule: Rule = {
  meta: {
    id: 'exact-easing',
    description: '`cubic-bezier(0.455, 0.03, 0.515, 0.955)` is only close to Reanimated\'s inOut(quad) (1.9 % off): paste `bun tools/easing.ts inOutQuad`.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const m of file.masked.matchAll(/cubic-bezier\(\s*0\.455\s*,\s*0\.03\s*,\s*0\.515\s*,\s*0\.955\s*\)/g)) {
      report({ at: m.index!, message: 'cubic-bezier(0.455, 0.03, 0.515, 0.955) is 1.9 % off Reanimated\'s inOut(quad): use the linear() that `bun tools/easing.ts inOutQuad` prints' });
    }
  },
};
export default rule;
