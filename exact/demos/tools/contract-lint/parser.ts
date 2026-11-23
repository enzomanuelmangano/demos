// A small tokenizer and parser for Contract's indentation-based syntax. It is not the compiler: it
// sees the structure a lint rule needs (nodes, their attributes, their children, the component they
// sit in) and nothing else. Offsets are into the original source, so a fix is a text edit.
//
//   1. Comments (`//` outside a string) are blanked in a `masked` copy, same length, same offsets.
//   2. Physical lines are joined into logical lines: a line that leaves a ( [ { open continues on
//      the next; a line that starts with `name=` and is indented deeper than the line before it
//      continues that line's attributes.
//   3. Logical lines become a tree by indentation. Each line's words (split on spaces outside
//      strings, template strings and brackets) give its head, its attributes `a=b`, its positional
//      words, and the arguments of a component use `Name(a=b, c=d)`.
import type { Attr, CommentInfo, Node, NodeKind, ParsedFile, Word } from './types.ts';

const ATTR_RE = /^(-?[A-Za-z_][\w:-]*)=/;
const TOP_KEYWORDS: Record<string, NodeKind> = {
  use: 'use',
  fn: 'fn',
  shape: 'shape',
  font: 'font',
  keyframes: 'keyframes',
  style: 'style',
  component: 'component',
};
const COMPONENT_KEYWORDS: Record<string, NodeKind> = {
  props: 'props',
  state: 'state',
  derive: 'derive',
  action: 'action',
  inject: 'inject',
  provide: 'provide',
  task: 'task',
  view: 'view',
};

/** Blanks `//` comments (outside strings and templates) and collects them. */
function mask(source: string): { masked: string; comments: { start: number; end: number; trailing: boolean }[] } {
  const out = source.split('');
  const comments: { start: number; end: number; trailing: boolean }[] = [];
  let i = 0;
  let lineHasCode = false;
  // Stack of open template strings' brace depths: a `${` inside a template re-enters code.
  const templates: number[] = [];
  let braceDepth = 0;
  let str: '"' | "'" | null = null;
  let inTemplate = false;
  while (i < source.length) {
    const c = source[i];
    if (c === '\n') {
      lineHasCode = false;
      str = null; // strings never span lines
      i++;
      continue;
    }
    if (str) {
      if (c === '\\') i += 2;
      else {
        if (c === str) str = null;
        i++;
      }
      continue;
    }
    if (inTemplate) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        inTemplate = false;
        i++;
        continue;
      }
      if (c === '$' && source[i + 1] === '{') {
        templates.push(braceDepth);
        braceDepth++;
        inTemplate = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      comments.push({ start, end: i, trailing: lineHasCode });
      continue;
    }
    if (c === '"') {
      str = '"';
      lineHasCode = true;
    } else if (c === '`') {
      inTemplate = true;
      lineHasCode = true;
    } else if (c === '{') {
      braceDepth++;
      lineHasCode = true;
    } else if (c === '}') {
      braceDepth--;
      if (templates.length && templates[templates.length - 1] === braceDepth) {
        templates.pop();
        inTemplate = true;
      }
      lineHasCode = true;
    } else if (c !== ' ' && c !== '\t') {
      lineHasCode = true;
    }
    i++;
  }
  return { masked: out.join(''), comments };
}

/** Splits text on whitespace outside strings, templates and brackets. Offsets are `base`-relative. */
export function splitWords(text: string, base: number): Word[] {
  const words: Word[] = [];
  let i = 0;
  let wordStart = -1;
  let depth = 0;
  let str: '"' | null = null;
  const tmpl: number[] = []; // brace depth at each open `${`
  let inTemplate = false;
  const push = (end: number) => {
    if (wordStart >= 0) {
      words.push({ text: text.slice(wordStart, end), start: base + wordStart, end: base + end });
      wordStart = -1;
    }
  };
  while (i < text.length) {
    const c = text[i];
    if (str) {
      if (c === '\\') i++;
      else if (c === '"') str = null;
      i++;
      continue;
    }
    if (inTemplate) {
      if (c === '\\') i++;
      else if (c === '`') inTemplate = false;
      else if (c === '$' && text[i + 1] === '{') {
        tmpl.push(depth);
        depth++;
        inTemplate = false;
        i++;
      }
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      if (depth === 0) push(i);
      i++;
      continue;
    }
    if (wordStart < 0) wordStart = i;
    if (c === '"') str = '"';
    else if (c === '`') inTemplate = true;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (c === '}' && tmpl.length && tmpl[tmpl.length - 1] === depth) {
        tmpl.pop();
        inTemplate = true;
      }
    }
    i++;
  }
  push(text.length);
  return words;
}

/** Splits `a=1, b=f(x, y)` on top-level commas. */
function splitArgs(text: string, base: number): Word[] {
  const parts: Word[] = [];
  let depth = 0;
  let str = false;
  let tmpl = false;
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (i === text.length || (c === ',' && depth === 0 && !str && !tmpl)) {
      const raw = text.slice(from, i);
      const lead = raw.length - raw.trimStart().length;
      const t = raw.trim();
      if (t) parts.push({ text: t, start: base + from + lead, end: base + from + lead + t.length });
      from = i + 1;
      continue;
    }
    if (str) {
      if (c === '\\') i++;
      else if (c === '"') str = false;
    } else if (tmpl) {
      if (c === '\\') i++;
      else if (c === '`') tmpl = false;
    } else if (c === '"') str = true;
    else if (c === '`') tmpl = true;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
  }
  return parts;
}

interface Logical {
  start: number;
  end: number;
  indent: number;
  line: number;
  endLine: number;
}

export function parseContract(file: string, source: string): ParsedFile {
  const { masked, comments: rawComments } = mask(source);
  const lines = source.split('\n');
  const lineStarts: number[] = [];
  {
    let off = 0;
    for (const l of lines) {
      lineStarts.push(off);
      off += l.length + 1;
    }
  }
  const position = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - lineStarts[lo] + 1 };
  };
  const comments: CommentInfo[] = rawComments.map(c => {
    const p = position(c.start);
    return { line: p.line, col: p.col, text: source.slice(c.start, c.end), trailing: c.trailing };
  });

  const mlines = masked.split('\n');
  // 2a. Logical lines by bracket balance.
  const logicals: Logical[] = [];
  for (let i = 0; i < mlines.length; i++) {
    const text = mlines[i];
    if (!text.trim()) continue;
    const indent = text.length - text.trimStart().length;
    let depth = 0;
    let end = i;
    const scan = (t: string) => {
      let str = false;
      let tm = false;
      const tdepth: number[] = [];
      for (let k = 0; k < t.length; k++) {
        const c = t[k];
        if (str) {
          if (c === '\\') k++;
          else if (c === '"') str = false;
        } else if (tm) {
          if (c === '\\') k++;
          else if (c === '`') tm = false;
          else if (c === '$' && t[k + 1] === '{') {
            tdepth.push(depth);
            depth++;
            tm = false;
            k++;
          }
        } else if (c === '"') str = true;
        else if (c === '`') tm = true;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
          depth--;
          if (c === '}' && tdepth.length && tdepth[tdepth.length - 1] === depth) {
            tdepth.pop();
            tm = true;
          }
        }
      }
    };
    scan(text);
    while (depth > 0 && end + 1 < mlines.length) {
      end++;
      scan(mlines[end]);
    }
    const start = lineStarts[i] + indent;
    const last = lineStarts[end] + mlines[end].length;
    logicals.push({ start, end: last, indent, line: i + 1, endLine: end + 1 });
    i = end;
  }
  // 2b. Attribute continuation lines join the line before them.
  const merged: Logical[] = [];
  for (const l of logicals) {
    const prev = merged[merged.length - 1];
    const firstWord = masked.slice(l.start, l.end).split(/\s/, 1)[0];
    if (prev && l.indent > prev.indent && ATTR_RE.test(firstWord)) {
      prev.end = l.end;
      prev.endLine = l.endLine;
    } else merged.push({ ...l });
  }

  // 3. The tree.
  const root: Node = blank('root', 'root', -1, 0, 0, 1, source.length);
  root.start = 0;
  root.end = source.length;
  const nodes: Node[] = [];
  const components: Node[] = [];
  const stack: Node[] = [root];
  for (const l of merged) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= l.indent) stack.pop();
    const parent = stack[stack.length - 1];
    const node = parseLine(masked, l, parent, position);
    node.parent = parent;
    parent.children.push(node);
    stack.push(node);
    nodes.push(node);
    if (node.kind === 'component') components.push(node);
  }
  const attr = (node: Node, name: string) => node.attrs.find(a => a.name === name);
  return { file, source, masked, lines, comments, root, nodes, components, lineStarts, position, attr };
}

function blank(kind: NodeKind, head: string, indent: number, start: number, col: number, line: number, end: number): Node {
  return {
    kind,
    head,
    words: [],
    attrs: [],
    positional: [],
    args: [],
    children: [],
    parent: null,
    indent,
    start,
    end,
    line,
    col,
    endLine: line,
    component: null,
    inView: false,
    parentElement: null,
  };
}

function parseLine(masked: string, l: Logical, parent: Node, position: (o: number) => { line: number; col: number }): Node {
  const text = masked.slice(l.start, l.end);
  const words = splitWords(text, l.start);
  const headWord = words[0]?.text ?? '';
  const head = headWord.replace(/[(].*$/s, '');
  const pos = position(l.start);
  const node = blank('other', head, l.indent, l.start, pos.col, pos.line, l.end);
  node.endLine = l.endLine;
  node.words = words;

  // Context: the component and whether we are in its view.
  node.component = parent.kind === 'component' ? parent : parent.component;
  const parentInView = parent.kind === 'view' || parent.inView;
  const ownKind = kindOf(head, headWord, parent, parentInView);
  node.kind = ownKind;
  node.inView = ownKind === 'view' ? false : parentInView && ['element', 'call', 'if', 'else', 'for', 'match', 'case', 'other'].includes(ownKind);
  node.parentElement = parent.kind === 'element' || parent.kind === 'call' ? parent : parent.parentElement;

  if (ownKind === 'element' || ownKind === 'for' || ownKind === 'call') {
    let rest = words.slice(1);
    if (ownKind === 'call') {
      // `Name(args)`, possibly followed by attributes.
      const open = headWord.indexOf('(');
      const close = headWord.lastIndexOf(')');
      if (open >= 0 && close > open) {
        for (const a of splitArgs(headWord.slice(open + 1, close), words[0].start + open + 1)) pushAttr(node.args, a, node, position);
      }
    }
    for (const w of rest) {
      if (ATTR_RE.test(w.text)) pushAttr(node.attrs, w, node, position);
      else node.positional.push(w);
    }
  }
  return node;
}

function pushAttr(into: Attr[], w: Word, node: Node, position: (o: number) => { line: number; col: number }) {
  const m = ATTR_RE.exec(w.text);
  if (!m) return;
  const p = position(w.start);
  into.push({
    name: m[1],
    value: w.text.slice(m[0].length),
    start: w.start,
    end: w.end,
    valueStart: w.start + m[0].length,
    line: p.line,
    col: p.col,
    node,
  });
}

function kindOf(head: string, headWord: string, parent: Node, inView: boolean): NodeKind {
  if (parent.kind === 'root') return TOP_KEYWORDS[head] ?? 'other';
  if (parent.kind === 'component') return COMPONENT_KEYWORDS[head] ?? 'other';
  if (parent.kind === 'view' || inView) {
    if (head === 'if') return 'if';
    if (head === 'else') return 'else';
    if (head === 'for') return 'for';
    if (head === 'match') return 'match';
    if (head === 'case') return 'case';
    if (/^[A-Z]/.test(head) && headWord.includes('(')) return 'call';
    if (/^[A-Za-z][\w-]*$/.test(head)) return 'element';
    return 'other';
  }
  if (parent.kind === 'action' || parent.kind === 'task') return 'other';
  return 'other';
}

// ---------------------------------------------------------------------------------------------
// Helpers for rules.

/** The value of `attr` when it is a plain string literal, else undefined. */
export function stringValue(a: Attr | undefined): string | undefined {
  if (!a) return undefined;
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(a.value);
  return m ? m[1] : undefined;
}

/** The value of `attr` when it is a number, or an expression of numbers only, else undefined. */
export function numberValue(a: Attr | undefined): number | undefined {
  if (!a) return undefined;
  return numberOf(a.value);
}

export function numberOf(raw: string): number | undefined {
  let v = raw.trim();
  const px = /^(-?[\d.]+)px$/.exec(v);
  if (px) v = px[1];
  if (!/^[\d.+\-*/() \t]+$/.test(v) || !/\d/.test(v)) return undefined;
  try {
    const r = Function(`"use strict"; return (${v});`)() as number;
    return typeof r === 'number' && Number.isFinite(r) ? r : undefined;
  } catch {
    return undefined;
  }
}

/** Does the attribute value mention any of the identifiers (a dynamic expression)? */
export function isDynamic(a: Attr | undefined): boolean {
  if (!a) return false;
  return !/^("([^"\\]|\\.)*"|-?[\d.]+(px)?)$/.test(a.value.trim());
}

/** Normalised text of a node's logical line (for baseline hashes). */
export function nodeSnippet(file: ParsedFile, node: Node): string {
  return file.masked.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
}

/** All attributes of a node and its attribute-free `-exact-*` ones, by name. */
export function attrMap(node: Node): Map<string, Attr> {
  const m = new Map<string, Attr>();
  for (const a of node.attrs) m.set(a.name, a);
  return m;
}

/** Every descendant of a node, depth first. */
export function descendants(node: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}
