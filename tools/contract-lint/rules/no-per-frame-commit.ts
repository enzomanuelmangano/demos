import type { Node, ParsedFile, Rule } from '../types.ts';
import { actionsOf, assignedNames, calledAction, subtreeEnd } from './util.ts';

// Handlers that fire many times a second.
const HOT = ['pointermove', 'mousemove', 'touchmove', 'scroll', 'wheel', 'drag', 'dragover'];
// What the host animates without a commit: a state read only by these is cheap to write.
const COMPOSITOR = ['translate', 'scale', 'opacity', 'rotate', 'transform'];

const rule: Rule = {
  meta: {
    id: 'no-per-frame-commit',
    description: 'A `pointermove` / `scroll` handler that writes state commits the whole app every event; drive motion with timelines, or write one state read only by translate/scale/opacity.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const comp of file.components) {
      const actions = actionsOf(comp);
      const states = new Set(comp.children.filter(c => c.kind === 'state').map(c => (c.words[1]?.text ?? '').replace(/:$/, '')));
      const view = comp.children.find(c => c.kind === 'view');
      if (!view) continue;
      const visit = (n: Node) => {
        for (const a of n.attrs) {
          if (!HOT.includes(a.name)) continue;
          const name = calledAction(a.value);
          const action = name ? actions.get(name) : undefined;
          if (!action) continue;
          const written = [...new Set(assignedNames(file, action, true).filter(w => states.has(w)))];
          if (!written.length) continue;
          if (written.length === 1 && onlyComposited(file, comp, view, written[0])) continue;
          report({
            at: a,
            message: `${a.name}=${a.value} writes ${written.join(', ')}: a commit per event (a frame while the finger moves). Use a scroll/drag timeline, or write one state read only by ${COMPOSITOR.slice(0, 3).join('/')}`,
          });
        }
        n.children.forEach(visit);
      };
      visit(view);
    }
  },
};

// Is every read of `name` in the component the value of a compositor-driven attribute?
function onlyComposited(file: ParsedFile, comp: Node, view: Node, name: string): boolean {
  const re = new RegExp(`(?<![\\w.\\-"$])${name}(?![\\w\\-])(?!\\s*=(?!=))`, 'g');
  const ranges: { start: number; end: number; ok: boolean }[] = [];
  const heads = new Set<number>();
  const collect = (n: Node) => {
    if (n.words[0]) heads.add(n.words[0].start);
    for (const a of [...n.attrs, ...n.args]) ranges.push({ start: a.valueStart, end: a.end, ok: COMPOSITOR.includes(a.name) });
    n.children.forEach(collect);
  };
  collect(view);
  let any = false;
  for (const m of file.masked.slice(comp.start, subtreeEnd(comp)).matchAll(re)) {
    const at = comp.start + m.index!;
    if (heads.has(at)) continue; // a tag that happens to share the state's name
    const hit = ranges.find(r => at >= r.start && at < r.end);
    // Any read outside a compositor attribute (a derive, a condition, a text, an action) is a
    // value the commit has to compute.
    if (!hit || !hit.ok) return false;
    any = true;
  }
  return any;
}
export default rule;
