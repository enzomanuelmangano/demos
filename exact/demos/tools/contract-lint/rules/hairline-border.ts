import type { Rule } from '../types.ts';
import { numberOf, numberValue } from '../parser.ts';
import { isBox } from './util.ts';

const WIDTHS = ['border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-inline-width', 'border-block-width'];
const SHORTHANDS = ['border', 'border-top', 'border-right', 'border-bottom', 'border-left'];

const rule: Rule = {
  meta: {
    id: 'hairline-border',
    description: 'A border thinner than the threshold is `-exact-hairline`, one device pixel, not a hand-picked fraction.',
    defaultSeverity: 'warn',
    fixable: true,
    origin: 'refined',
    // refined's default is 0.3 (React Native's hairlineWidth is 1/3 pt on a 3x screen). Here a
    // sub-point width of 0.5 or less is a hairline: the repo's ports write 0.5 for it.
    defaults: { threshold: 0.5 },
  },
  check({ file, options, report }) {
    const threshold = Number(options.threshold);
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      for (const a of node.attrs) {
        if (WIDTHS.includes(a.name)) {
          const v = numberValue(a);
          if (v !== undefined && v > 0 && v <= threshold) {
            report({
              at: a,
              message: `${a.name}=${a.value} is a hand-picked hairline: use "-exact-hairline" (one device pixel on every screen)`,
              fix: [{ start: a.valueStart, end: a.end, text: '"-exact-hairline"' }],
            });
          }
        } else if (SHORTHANDS.includes(a.name)) {
          const m = /^"\s*(-?[\d.]+)(px)?(\s+.*)"$/.exec(a.value);
          if (!m) continue;
          const v = numberOf(m[1]);
          if (v !== undefined && v > 0 && v <= threshold) {
            const at = a.valueStart + 1 + (a.value.slice(1).length - a.value.slice(1).trimStart().length);
            report({
              at: a,
              message: `${a.name} starts with ${m[1]}${m[2] ?? ''}, a hand-picked hairline: use -exact-hairline`,
              fix: [{ start: at, end: at + m[1].length + (m[2]?.length ?? 0), text: '-exact-hairline' }],
            });
          }
        }
      }
    }
  },
};
export default rule;
