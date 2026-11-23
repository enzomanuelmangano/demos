// Helpers the rules share.
import type { Attr, Node, ParsedFile } from '../types.ts';
import { numberValue, stringValue } from '../parser.ts';

/** Pressto's pressables: `PressableScale`, `PressableScaleLayout`, `PressableOpacity`, ... */
export const PRESSTO_RE = /^(Pressable\w*|AnimatedPressable\w*)$/;

export function get(node: Node, name: string): Attr | undefined {
  return node.attrs.find(a => a.name === name);
}

export function has(node: Node, ...names: string[]): boolean {
  return node.attrs.some(a => names.includes(a.name));
}

/** The elements directly below a node, looking through `if` / `else` / `for` wrappers. */
export function childElements(node: Node): Node[] {
  const out: Node[] = [];
  for (const c of node.children) {
    if (c.kind === 'element' || c.kind === 'call') out.push(c);
    else if (c.kind === 'if' || c.kind === 'else' || c.kind === 'for' || c.kind === 'match' || c.kind === 'case') out.push(...childElements(c));
  }
  return out;
}

/** A node and its ancestors, nearest first, elements and calls only. */
export function ancestors(node: Node): Node[] {
  const out: Node[] = [];
  for (let p = node.parent; p; p = p.parent) if (p.kind === 'element' || p.kind === 'call') out.push(p);
  return out;
}

/** An element or a call in a view. */
export function isBox(node: Node): boolean {
  return node.inView && (node.kind === 'element' || node.kind === 'call');
}

export function isInsideCanvas(node: Node): boolean {
  return ancestors(node).some(a => a.head === 'canvas');
}

/** The numeric value of a length attribute: `12`, `12px`, `(2 * 6)`; undefined when dynamic. */
export function len(node: Node, name: string): number | undefined {
  return numberValue(get(node, name));
}

/** A box-model shorthand value (`padding`, `margin`) split in its top/right/bottom/left words. */
export function sides(value: string): string[] | undefined {
  const v = value.trim();
  const inner = /^"(.*)"$/.exec(v);
  if (!inner) return undefined;
  const t = inner[1].trim().split(/\s+/);
  if (t.length === 1) return [t[0], t[0], t[0], t[0]];
  if (t.length === 2) return [t[0], t[1], t[0], t[1]];
  if (t.length === 3) return [t[0], t[1], t[2], t[1]];
  if (t.length === 4) return t;
  return undefined;
}

export function isZeroWord(w: string): boolean {
  return /^-?0+(\.0+)?(px)?$/.test(w);
}

/** The text of a string literal attribute, or the literal text pieces of a template. */
export function textOf(a: Attr | undefined): string | undefined {
  if (!a) return undefined;
  const s = stringValue(a);
  if (s !== undefined) return s;
  if (a.value.startsWith('`')) return a.value;
  return undefined;
}

/** Comment lines directly above a line (a contiguous block), plus a trailing comment on it. */
export function commentsNear(file: ParsedFile, line: number, endLine = line): string {
  const out: string[] = [];
  for (const c of file.comments) if (c.trailing && c.line >= line && c.line <= endLine) out.push(c.text);
  let l = line - 1;
  const byLine = new Map<number, string>();
  for (const c of file.comments) if (!c.trailing) byLine.set(c.line, c.text);
  while (byLine.has(l)) {
    out.push(byLine.get(l)!);
    l--;
  }
  return out.join('\n');
}

/** Does the node's own `-exact-hit-slop*` exist? */
export function hasHitSlop(node: Node): boolean {
  return node.attrs.some(a => a.name.startsWith('-exact-hit-slop'));
}

/** Offset just after the node's last word (before any trailing comment). */
export function lastWordEnd(node: Node): number {
  return node.words[node.words.length - 1].end;
}

/** An action's name: `action toggle(i: number)` -> toggle. */
export function actionName(node: Node): string {
  return (node.words[1]?.text ?? '').replace(/\(.*$/s, '');
}

/** The text of a node's subtree (its line and everything below), comments masked. */
export function subtreeEnd(node: Node): number {
  let end = node.end;
  const walk = (n: Node) => {
    end = Math.max(end, n.end);
    n.children.forEach(walk);
  };
  walk(node);
  return end;
}

export function subtreeText(file: ParsedFile, node: Node): string {
  return file.masked.slice(node.start, subtreeEnd(node));
}

/** The component's actions by name. */
export function actionsOf(component: Node): Map<string, Node> {
  const m = new Map<string, Node>();
  for (const c of component.children) if (c.kind === 'action') m.set(actionName(c), c);
  return m;
}

/** The called action in `press=toggle(i)` / `press=toggle`. */
export function calledAction(value: string): string | undefined {
  return /^\(?([A-Za-z_]\w*)/.exec(value.trim())?.[1];
}

/** Names assigned in an action body: `x = 1` lines. With `unconditional`, only those that run on
 *  every call (not under an `if` / `else`). */
export function assignedNames(file: ParsedFile, action: Node, unconditional = false): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    for (const c of n.children) {
      const text = file.masked.slice(c.start, c.end);
      const m = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(text);
      if (m) out.push(m[1]);
      if (unconditional && /^(if|else|for|match)\b/.test(text)) continue;
      walk(c);
    }
  };
  walk(action);
  return out;
}
