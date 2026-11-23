import type { Rule } from '../types.ts';

// Times outside linear() / cubic-bezier() / ${...}.
function timesOf(entry: string): number {
  const flat = entry.replace(/\$\{[^}]*\}/g, ' ').replace(/(linear|cubic-bezier|steps)\([^)]*\)/g, ' ');
  return [...flat.matchAll(/(?<![\w.%-])\d*\.?\d+m?s\b/g)].length;
}

const rule: Rule = {
  meta: {
    id: 'transition-delay',
    description: 'The iOS host ignores a `transition`\'s delay (measured): use an `animation` with a delay, or the timer surface.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      for (const a of node.attrs) {
        if (a.name === 'transition-delay') {
          report({ at: a, message: 'transition-delay is ignored on iOS: use `animation` keyframes with a delay, or the `timer` surface' });
        } else if (a.name === 'transition' && /^["`]/.test(a.value)) {
          const entries = a.value.slice(1, -1).split(/,(?![^(]*\))/);
          if (entries.some(e => timesOf(e) >= 2)) {
            report({ at: a, message: 'this transition has a delay (a second time): the iOS host ignores transition delays; use `animation` keyframes with a delay, or the `timer` surface' });
          }
        }
      }
    }
  },
};
export default rule;
