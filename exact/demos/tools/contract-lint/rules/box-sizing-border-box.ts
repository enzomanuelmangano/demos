import type { Attr, Node, Rule } from '../types.ts';
import { numberValue } from '../parser.ts';
import { get, isBox, isZeroWord, sides } from './util.ts';

// Does the node add `padding` / border to its own size on this axis? 'x' | 'y'.
function adds(node: Node, axis: 'x' | 'y'): Attr | undefined {
  const idx = axis === 'x' ? [1, 3] : [0, 2];
  const longhand = axis === 'x' ? ['padding-left', 'padding-right', 'padding-inline', 'padding-inline-start', 'padding-inline-end', 'border-left-width', 'border-right-width']
    : ['padding-top', 'padding-bottom', 'padding-block', 'padding-block-start', 'padding-block-end', 'border-top-width', 'border-bottom-width'];
  for (const a of node.attrs) {
    if (a.name === 'padding') {
      const s = sides(a.value);
      if (s ? idx.some(i => !isZeroWord(s[i])) : numberValue(a) !== 0) return a;
    } else if (a.name === 'border-width') {
      const s = sides(a.value);
      const n = numberValue(a);
      if (s ? idx.some(i => !isZeroWord(s[i])) : n !== 0) return a;
    } else if (longhand.includes(a.name)) {
      if (numberValue(a) !== 0) return a;
    } else if (/^border(-top|-right|-bottom|-left)?$/.test(a.name)) {
      const side = a.name.slice(7);
      const hits = side === '' || (axis === 'x' ? side === 'left' || side === 'right' : side === 'top' || side === 'bottom');
      if (!hits) continue;
      const m = /^"\s*(-?[\d.]+)(px)?\s/.exec(a.value);
      if (m && Number(m[1]) !== 0) return a;
      if (/^"\s*-exact-hairline/.test(a.value)) return a;
    }
  }
  return undefined;
}

const rule: Rule = {
  meta: {
    id: 'box-sizing-border-box',
    description: 'A node with a fixed `width`/`height` and `padding` or a border on that axis needs `box-sizing="border-box"`.',
    defaultSeverity: 'error',
    fixable: true,
    origin: 'project',
  },
  check({ file, report }) {
    for (const node of file.nodes) {
      if (!isBox(node) || node.kind !== 'element') continue;
      const box = get(node, 'box-sizing');
      if (box && /border-box/.test(box.value)) continue;
      // The attribute is dynamic (a ternary): the author decided, leave it.
      if (box) continue;
      for (const axis of ['x', 'y'] as const) {
        const size = get(node, axis === 'x' ? 'width' : 'height');
        if (!size) continue;
        const v = size.value.trim();
        // A fixed size: a number or an expression; not a percentage, `auto`, `fit-content`, ...
        if (/^"/.test(v) || v === 'auto') continue;
        const extra = adds(node, axis);
        if (!extra) continue;
        report({
          at: size,
          message: `${size.name}=${v} plus ${extra.name} grows the box past ${v}: content-box sizing adds them (the sudoku card was 422 pt on a 402 pt screen): add box-sizing="border-box"`,
          fix: [{ start: size.end, end: size.end, text: ' box-sizing="border-box"' }],
        });
        break;
      }
    }
  },
};
export default rule;
