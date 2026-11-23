import type { Rule } from '../types.ts';
import { isBox } from './util.ts';

// React Native's split shadow props, in the kebab and the camel spelling a port might carry over.
const SPLIT = /^(shadow-?(color|offset|offset-?x|offset-?y|opacity|radius|blur|spread)|elevation)$/i;

const rule: Rule = {
  meta: {
    id: 'shadow-single-property',
    description: 'One `box-shadow` per node; no split shadow attributes, no `drop-shadow()` filter on a box.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'refined',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      for (const a of node.attrs) {
        if (SPLIT.test(a.name)) {
          report({ at: a, message: `${a.name} is React Native's split shadow: write one box-shadow="<x> <y> <blur> [spread] <color>"` });
        } else if (a.name === 'filter' && /drop-shadow\(/.test(a.value)) {
          report({
            at: a,
            message: 'filter: drop-shadow() renders the node into an offscreen pass every frame; box-shadow follows the box and its radius without one',
          });
        }
      }
    }
  },
};
export default rule;
