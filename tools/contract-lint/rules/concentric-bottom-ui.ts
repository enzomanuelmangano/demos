import type { Rule } from '../types.ts';
import { get, len } from './util.ts';

// Display corner radius of the iPhones this app targets (demos/env.contract displayCorner()).
const DISPLAY = 62;
const HELPERS = /\b(concentricInset|floatingInset|concentricRadius|displayCorner|floatingWidth)\b/;

const rule: Rule = {
  meta: {
    id: 'concentric-bottom-ui',
    description: 'A floating bottom box is concentric with the display\'s corner: inset + radius = 62, or a capsule inset 62 - height/2. Use floatingInset / concentricRadius.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
    defaults: { display: DISPLAY, tolerance: 1.5 },
  },
  check({ file, options, report }) {
    const R = Number(options.display);
    const tol = Number(options.tolerance);
    for (const node of file.nodes) {
      if (!node.inView || node.kind !== 'element') continue;
      const pos = get(node, 'position');
      const bottom = get(node, 'bottom');
      const radius = get(node, 'border-radius');
      if (!pos || !/absolute/.test(pos.value) || !bottom || !radius) continue;
      // Computed with the helpers: concentric by construction.
      if (HELPERS.test(bottom.value) || HELPERS.test(radius.value)) continue;
      const i = len(node, 'bottom');
      const r = len(node, 'border-radius');
      // Only literal numbers can be checked, and only boxes near the corner can be concentric.
      if (i === undefined || r === undefined || r === 0 || i < 0 || i >= R) continue;
      const h = len(node, 'height');
      const tall = Math.abs(i + r - R) <= tol;
      const capsule = h !== undefined && Math.abs(r - h / 2) <= 0.6 && Math.abs(i - (R - h / 2)) <= tol;
      if (tall || capsule) continue;
      const hint = h !== undefined ? `floatingInset(${i}, ${h}) and concentricRadius(inset, ${h})` : 'floatingInset(want, height) and concentricRadius(inset, height)';
      report({
        at: bottom,
        message: `bottom=${i} with border-radius=${r}: ${i} + ${r} is ${i + r}, not the display corner ${R}; use ${hint} from env.contract`,
      });
    }
  },
};
export default rule;
