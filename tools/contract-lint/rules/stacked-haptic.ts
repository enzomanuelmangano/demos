import type { Node, Rule } from '../types.ts';
import { actionsOf, calledAction, get, PRESSTO_RE, subtreeText } from './util.ts';

const rule: Rule = {
  meta: {
    id: 'stacked-haptic',
    description: 'A pressto press already plays the selection haptic (`pressablesOnPress()`): its action must not add another `haptic(...)`.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const comp of file.components) {
      const actions = actionsOf(comp);
      for (const node of file.nodes) {
        if (node.component !== comp || node.kind !== 'call' || !PRESSTO_RE.test(node.head)) continue;
        const press = node.args.find(a => a.name === 'press') ?? get(node, 'press');
        if (!press) continue;
        const name = calledAction(press.value);
        const action: Node | undefined = name ? actions.get(name) : undefined;
        if (!action) continue;
        const m = /\bhaptic\(\s*([^)]*)\)/.exec(subtreeText(file, action));
        if (!m) continue;
        report({ at: press, key: `${node.head} press=${press.value} haptic(${m[1]})`, message: `${name} plays haptic(${m[1].trim()}) and is a ${node.head} press: pressto's global haptic already plays on that press, so the two stack (toast, clerk-toast, floating-modal fixed exactly this)` });
      }
    }
  },
};
export default rule;
