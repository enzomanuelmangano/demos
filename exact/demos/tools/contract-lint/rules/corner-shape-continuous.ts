import type { Rule } from '../types.ts';
import { numberValue } from '../parser.ts';
import { get, isBox, isInsideCanvas, len } from './util.ts';

const RADIUS = [
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
];

const rule: Rule = {
  meta: {
    id: 'corner-shape-continuous',
    description: 'A rounded node takes `corner-shape="-exact-continuous"` (iOS squircle corners).',
    defaultSeverity: 'warn',
    fixable: true,
    origin: 'refined',
    defaults: { ignoreCircles: true },
  },
  check({ file, options, report }) {
    for (const node of file.nodes) {
      if (!isBox(node) || isInsideCanvas(node)) continue;
      const radii = node.attrs.filter(a => RADIUS.includes(a.name));
      if (!radii.length) continue;
      const corner = get(node, 'corner-shape');
      if (corner) {
        // `squircle` is the CSS superellipse: a different curve from iOS's continuous corner.
        const v = corner.value.replace(/^"|"$/g, '');
        if (/^"/.test(corner.value) && v !== '-exact-continuous' && v !== 'round' && v !== 'initial') {
          report({ at: corner, message: `corner-shape="${v}" is not iOS's continuous corner: use "-exact-continuous" (squircle is the CSS superellipse, a different curve)` });
        }
        continue;
      }
      // Every radius zero: nothing is rounded.
      if (radii.every(a => numberValue(a) === 0)) continue;
      // A circle or a pill (radius at least half of both known sides): Core Animation draws the
      // continuous curve unclamped there, and the owner's port rule keeps plain circles round.
      if (options.ignoreCircles) {
        const r = numberValue(radii[0]);
        const w = len(node, 'width');
        const h = len(node, 'height');
        if (r !== undefined && ((w !== undefined && h !== undefined && r >= Math.min(w, h) / 2) || r >= 999)) continue;
        if (/^"50%"$/.test(radii[0].value)) continue;
      }
      const last = radii[radii.length - 1];
      report({
        at: radii[0],
        message: `${radii[0].name} without corner-shape="-exact-continuous": iOS rounds with squircles, a plain radius reads as a different shape`,
        fix: [{ start: last.end, end: last.end, text: ' corner-shape="-exact-continuous"' }],
      });
    }
  },
};
export default rule;
