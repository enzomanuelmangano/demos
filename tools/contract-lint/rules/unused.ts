import type { Node, ParsedFile, Rule } from '../types.ts';
import { subtreeText } from './util.ts';

// Reads of `name` in `text`: not an attribute label (`name=`), not an assignment target
// (`name = `), not part of a longer word, a path (`a.name`) or a kebab name.
function reads(text: string, name: string): number {
  const re = new RegExp(`(?<![\\w.\\-"$])${name}(?![\\w\\-])(?!\\s*=(?!=))`, 'g');
  return [...text.matchAll(re)].length;
}

function declared(file: ParsedFile, c: Node, kind: 'state' | 'derive'): { name: string; node: Node }[] {
  const out: { name: string; node: Node }[] = [];
  for (const n of c.children) if (n.kind === kind) out.push({ name: (n.words[1]?.text ?? '').replace(/:$/, ''), node: n });
  return out;
}

/** The component's text with one declaration line cut out. */
function without(file: ParsedFile, c: Node, cut: Node): string {
  const t = subtreeText(file, c);
  const a = cut.start - c.start;
  const b = Math.min(t.length, cut.end - c.start);
  return t.slice(0, a) + ' '.repeat(b - a) + t.slice(b);
}

export const unusedState: Rule = {
  meta: {
    id: 'unused-state',
    description: 'A `state` or `derive` that nothing reads: dead weight in every commit.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
  },
  check({ file, report }) {
    for (const c of file.components) {
      for (const kind of ['state', 'derive'] as const) {
        for (const { name, node } of declared(file, c, kind)) {
          if (!name || reads(without(file, c, node), name) > 0) continue;
          report({ at: node, message: `${kind} ${name} is never read in ${c.words[1]?.text ?? 'the component'}: remove it (it is still written and recomputed on every commit)` });
        }
      }
    }
  },
};

export const unusedProp: Rule = {
  meta: {
    id: 'unused-prop',
    description: 'A prop the component never reads.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
    // Every demo takes `env` so the root can hand it down; a demo that needs no screen size ignores it.
    defaults: { ignore: ['env'] },
  },
  check({ file, options, report }) {
    const ignore = (options.ignore as string[]) ?? [];
    for (const c of file.components) {
      const props = c.children.find(n => n.kind === 'props');
      if (!props) continue;
      for (const p of props.children) {
        const name = (p.words[0]?.text ?? '').replace(/:$/, '');
        if (!/^[A-Za-z_]\w*$/.test(name) || ignore.includes(name)) continue;
        if (reads(without(file, c, p), name) > 0) continue;
        report({ at: p, message: `prop ${name} is never read in ${c.words[1]?.text ?? 'the component'}: drop it from the props and from the callers` });
      }
    }
  },
};
