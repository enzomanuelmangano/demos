import type { Rule } from '../types.ts';
import { get, isBox } from './util.ts';

const rule: Rule = {
  meta: {
    id: 'rotate-axis-origin',
    description: 'A node that rotates about x or y needs a non-centre `transform-origin`, or the iOS host turns it about Z while it animates.',
    defaultSeverity: 'error',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      const r = get(node, 'rotate');
      if (!r || !/["`(?:]\s*[xy]\s/.test(r.value)) continue;
      const origin = get(node, 'transform-origin');
      if (origin && !/^"(center|50%)( (center|50%))?"$/.test(origin.value)) continue;
      report({
        at: r,
        message: 'rotate about x/y without a non-centre transform-origin: iOS lowers every box rotate to Core Animation\'s rotation.z, so it turns flat in the screen plane (add transform-origin="left center" for x, "center top" for y)',
      });
    }
  },
};
export default rule;
