import type { Rule } from '../types.ts';

const rule: Rule = {
  meta: {
    id: 'keyframes-stop-cap',
    description: 'A `keyframes` block with more stops than the host plays (about 33) is cut: sample the curve more coarsely or draw the motion in Rust.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
    defaults: { max: 33 },
  },
  check({ file, options, report }) {
    const max = Number(options.max);
    for (const n of file.nodes) {
      if (n.kind !== 'keyframes') continue;
      if (n.children.length > max) report({ at: n, message: `keyframes ${n.words[1]?.text ?? ''} has ${n.children.length} stops; the host caps a keyframes animation at about ${max}` });
    }
  },
};
export default rule;
