import type { Node, Rule } from '../types.ts';
import { get, hasHitSlop, childElements, isBox, isZeroWord, len, lastWordEnd, PRESSTO_RE, sides } from './util.ts';

// What the node grows by on an axis from its own padding, when it is content-sized.
function padding(node: Node, axis: 'x' | 'y'): number {
  const border = get(node, 'box-sizing');
  if (border && /border-box/.test(border.value)) return 0;
  const p = get(node, 'padding');
  const s = p ? sides(p.value) : undefined;
  const idx = axis === 'x' ? [1, 3] : [0, 2];
  let sum = 0;
  if (s) for (const i of idx) sum += isZeroWord(s[i]) ? 0 : Number(s[i].replace('px', '')) || 0;
  else if (p) sum += (len(node, 'padding') ?? 0) * 2;
  const names = axis === 'x' ? ['padding-left', 'padding-right'] : ['padding-top', 'padding-bottom'];
  for (const n of names) sum += len(node, n) ?? 0;
  return sum;
}

/** The element whose size a pressable has: the node itself, or a pressto call's one child. */
function visual(node: Node): Node {
  if (node.kind !== 'call') return node;
  const kids = childElements(node);
  return kids.length === 1 ? kids[0] : node;
}

const rule: Rule = {
  meta: {
    id: 'min-touch-target',
    description: 'A pressable smaller than 44 pt needs padding, a bigger box or `-exact-hit-slop`.',
    defaultSeverity: 'warn',
    fixable: true,
    origin: 'refined',
    // refined asks 40 pt; Apple's Human Interface Guidelines say 44 pt.
    defaults: { minSize: 44 },
  },
  check({ file, options, report }) {
    const min = Number(options.minSize);
    for (const node of file.nodes) {
      if (!isBox(node)) continue;
      const pressable = node.head === 'button' || (node.kind === 'call' && PRESSTO_RE.test(node.head)) || (node.kind === 'element' && get(node, 'press'));
      if (!pressable) continue;
      const v = visual(node);
      const quiet = (n: Node) => {
        const pe = get(n, 'pointer-events');
        return (pe && /none/.test(pe.value)) || get(n, 'aria-hidden');
      };
      if (quiet(node) || quiet(v) || hasHitSlop(node) || hasHitSlop(v)) continue;
      const w = len(v, 'width');
      const h = len(v, 'height');
      const ew = w === undefined ? undefined : w + padding(v, 'x');
      const eh = h === undefined ? undefined : h + padding(v, 'y');
      const smallW = ew !== undefined && ew < min;
      const smallH = eh !== undefined && eh < min;
      if (!smallW && !smallH) continue;
      const sx = smallW ? Math.ceil((min - ew!) / 2) : 0;
      const sy = smallH ? Math.ceil((min - eh!) / 2) : 0;
      const slop = sx === sy ? `${sx}px` : `${sy}px ${sx}px`;
      report({
        at: node,
        message: `${node.head} is ${ew ?? '?'} x ${eh ?? '?'} pt, under ${min} pt: add padding, or -exact-hit-slop="${slop}" (grows the hit area, paints nothing)`,
        fix: node.head === 'button' && node.kind === 'element' ? [{ start: lastWordEnd(node), end: lastWordEnd(node), text: ` -exact-hit-slop="${slop}"` }] : undefined,
      });
    }
  },
};
export default rule;
