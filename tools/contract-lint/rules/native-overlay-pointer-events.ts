import type { Rule } from '../types.ts';
import { get } from './util.ts';

const rule: Rule = {
  meta: {
    id: 'native-overlay-pointer-events',
    description: 'Native glass and blur panes (`glass-pane`, `variable-blur`) never take touches: `pointer-events="none"`, or they swallow the taps of what they cover.',
    defaultSeverity: 'warn',
    fixable: true,
    origin: 'project',
    defaults: { tags: ['glass-pane', 'variable-blur'] },
  },
  check({ file, options, report }) {
    const tags = options.tags as string[];
    for (const node of file.nodes) {
      if (node.kind !== 'element' || !tags.includes(node.head)) continue;
      const pe = get(node, 'pointer-events');
      if (pe && /^"none"$/.test(pe.value)) continue;
      // `interactive="true"` is the glass pane that is meant to take touches.
      const inter = get(node, 'interactive');
      if (inter && /true/.test(inter.value)) continue;
      const last = node.words[node.words.length - 1];
      report({
        at: node,
        message: `${node.head} without pointer-events="none": the native view takes the touches that belong to the boxes under it (liquid-glass-playground, variable-blur)`,
        fix: [{ start: last.end, end: last.end, text: ' pointer-events="none"' }],
      });
    }
  },
};
export default rule;
