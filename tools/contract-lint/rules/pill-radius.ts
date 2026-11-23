import type { Rule } from '../types.ts';
import { numberValue } from '../parser.ts';
import { get, isBox, len } from './util.ts';

const rule: Rule = {
  meta: {
    id: 'pill-radius',
    description: 'A pill that a layout transition resizes has its radius authored as height/2, not 999: the host keeps the corner only when the authored radius is at most half the box.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
    defaults: { huge: 500 },
  },
  check({ file, options, report }) {
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      const a = get(node, 'border-radius');
      if (!a) continue;
      // Only a box that is resized (layout transition, or width/height in a transition) redraws.
      const tr = get(node, 'transition');
      if (!get(node, '-exact-layout-transition') && !(tr && /\b(width|height|all)\b/.test(tr.value))) continue;
      const r = numberValue(a);
      const pct = /^"(\d+)(px)?"$/.exec(a.value);
      const rv = r ?? (pct && pct[2] ? Number(pct[1]) : undefined);
      if (rv === undefined) continue;
      const w = len(node, 'width');
      const h = len(node, 'height');
      const half = w !== undefined && h !== undefined ? Math.min(w, h) / 2 : undefined;
      const huge = rv >= Number(options.huge);
      if ((half !== undefined && rv > half + 0.01) || huge) {
        report({
          at: a,
          message: `border-radius=${rv}${half !== undefined ? ` on a ${w} x ${h} box` : ''} is more than half the box: author ${half !== undefined ? half : 'height / 2'} (a resizing pill redraws on the CPU with the wrong curve, jank included)`,
        });
      }
    }
  },
};
export default rule;
