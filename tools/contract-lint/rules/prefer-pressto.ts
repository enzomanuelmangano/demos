import type { Rule } from '../types.ts';
import { get } from './util.ts';

const rule: Rule = {
  meta: {
    id: 'prefer-pressto',
    description: 'Press feedback is pressto\'s (`PressableScale`, `PressableScaleLayout`, ...), not a hand-written `:active` style or `-exact-press-*` attribute.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'refined',
  },
  check({ file, report }) {
    // `style` blocks with an `:active` state, by name.
    const pressed = new Set<string>();
    for (const n of file.root.children) {
      if (n.kind === 'style' && n.children.some(c => c.head.startsWith(':active'))) pressed.add(n.words[1]?.text ?? '');
    }
    for (const node of file.nodes) {
      if (!node.inView || node.kind !== 'element') continue;
      for (const a of node.attrs) {
        if (a.name.startsWith('-exact-press-')) {
          report({ at: a, message: `${a.name} is hand-written press feedback: wrap the node in pressto's PressableScale (it brings the scale, the timing and the host's selection haptic)` });
        }
      }
      const cls = get(node, 'class');
      if (cls) {
        for (const name of cls.value.replace(/^"|"$/g, '').split(/\s+/)) {
          if (pressed.has(name)) {
            report({ at: cls, message: `class ${name} reacts to :active by hand: use pressto's PressableScale for press feedback (a bare button has none of its haptic or timing)` });
          }
        }
      }
    }
  },
};
export default rule;
