import type { Node, Rule } from '../types.ts';
import { descendants } from '../parser.ts';
import { get, isBox, PRESSTO_RE } from './util.ts';

const LABELLED = ['testId', 'aria-label'];

const rule: Rule = {
  meta: {
    id: 'testid-on-interactive',
    description: 'An interactive node has a `testId` or an `aria-label`: the e2e driver and VoiceOver both find controls by them.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      const pressto = node.kind === 'call' && PRESSTO_RE.test(node.head);
      const interactive = pressto || node.head === 'button' || node.head === 'input' || (node.kind === 'element' && get(node, 'press'));
      if (!interactive) continue;
      const pe = get(node, 'pointer-events');
      if ((pe && /none/.test(pe.value)) || get(node, 'aria-hidden')) continue;
      const labelled = (n: Node) => n.attrs.some(a => LABELLED.includes(a.name)) || n.args.some(a => LABELLED.includes(a.name));
      if (labelled(node)) continue;
      // A pressto wrapper carries its label on the box it wraps.
      if (pressto && descendants(node).some(d => (d.kind === 'element' || d.kind === 'call') && labelled(d))) continue;
      // A button whose text is its label is found by that text; the rule wants the id anyway.
      report({ at: node, message: `${node.head} is interactive and has no testId or aria-label` });
    }
  },
};
export default rule;
