// Shared types of the Contract linter. No dependency outside Bun / Node's standard library, so the
// folder can be lifted into a package as it is.

export type Severity = 'error' | 'warn' | 'off';

/** A rule's setting in a config: a severity, or [severity, options]. */
export type RuleSetting = Severity | [Severity, Record<string, unknown>];

/** One text edit, in offsets of the original source. */
export interface Edit {
  start: number;
  end: number;
  text: string;
}

export interface Word {
  text: string;
  /** Offsets in the source (end exclusive). */
  start: number;
  end: number;
}

export interface Attr {
  name: string;
  /** The raw text after `=`, for example `"absolute"`, `(w * 2)`, `` `a${b}` ``, `12`. */
  value: string;
  /** Offsets of the whole `name=value` word. */
  start: number;
  end: number;
  valueStart: number;
  line: number;
  col: number;
  /** The node the attribute belongs to (set by the parser). */
  node: Node;
}

export type NodeKind =
  | 'root'
  | 'use'
  | 'fn'
  | 'shape'
  | 'font'
  | 'keyframes'
  | 'style'
  | 'component'
  | 'props'
  | 'state'
  | 'derive'
  | 'action'
  | 'inject'
  | 'provide'
  | 'task'
  | 'view' // the `view` section of a component
  | 'element' // a tag in a view: view, column, row, text, image, button, svg, path, canvas ...
  | 'call' // a component use: Name(arg=…)
  | 'if'
  | 'else'
  | 'for'
  | 'match'
  | 'case'
  | 'other';

export interface Node {
  kind: NodeKind;
  /** First word: a tag, a component name, or a keyword. */
  head: string;
  words: Word[];
  /** `name=value` words (tag attributes, and the `key=` of a `for`). */
  attrs: Attr[];
  /** Words that are not attributes after the head: `text "hi"`, `image "x.png"`, `for i in xs`. */
  positional: Word[];
  /** The arguments of a component use: `Name(a=1, b=x)`. */
  args: Attr[];
  children: Node[];
  parent: Node | null;
  indent: number;
  /** Offsets of the whole logical line (continuation lines included). */
  start: number;
  end: number;
  line: number;
  col: number;
  endLine: number;
  /** The component this node sits in, when it does. */
  component: Node | null;
  /** True for nodes in a component's `view` (elements, calls, if/for). */
  inView: boolean;
  /** The nearest enclosing element/call, ignoring if/for wrappers. */
  parentElement: Node | null;
}

export interface CommentInfo {
  line: number;
  col: number;
  text: string;
  /** True when code precedes the comment on its line. */
  trailing: boolean;
}

export interface ParsedFile {
  /** Path as given (relative to the project root). */
  file: string;
  source: string;
  /** The source with comments blanked to spaces (same length, same offsets). */
  masked: string;
  lines: string[];
  comments: CommentInfo[];
  root: Node;
  /** Every node, in source order. */
  nodes: Node[];
  components: Node[];
  /** Offset of the start of each physical line. */
  lineStarts: number[];
  position(offset: number): { line: number; col: number };
  attr(node: Node, name: string): Attr | undefined;
}

export interface ReportInput {
  message: string;
  /** Where to point: an attribute, a node, or an offset. */
  at: Attr | Node | number;
  /** Text that identifies the finding for the baseline (default: the node's normalised line). */
  key?: string;
  fix?: Edit[];
}

export interface RuleContext {
  file: ParsedFile;
  options: Record<string, unknown>;
  project: Project;
  report(input: ReportInput): void;
}

export interface Project {
  /** Absolute path of exact/demos (the Contract project's root). */
  root: string;
  /** Reads a project file; undefined when it is absent. */
  read(rel: string): string | undefined;
  /** Memoised per-project cache for rules. */
  cache: Map<string, unknown>;
}

export interface RuleMeta {
  id: string;
  /** One line, shown in listings. */
  description: string;
  /** What the rule's severity is in `recommended`. */
  defaultSeverity: Exclude<Severity, 'off'>;
  fixable: boolean;
  /** Where it comes from: 'refined' (a port of an eslint-plugin-refined rule) or 'project'. */
  origin: 'refined' | 'project';
  /** Default options. */
  defaults?: Record<string, unknown>;
}

export interface Rule {
  meta: RuleMeta;
  check(ctx: RuleContext): void;
}

export interface Finding {
  ruleId: string;
  severity: Exclude<Severity, 'off'>;
  message: string;
  file: string;
  line: number;
  col: number;
  /** Stable id of the finding for the baseline: hash(rule + file-independent snippet). */
  hash: string;
  fix?: Edit[];
}

export interface LintConfig {
  rules: Record<string, RuleSetting>;
}

export interface RcFile {
  extends?: 'base' | 'recommended' | 'strict';
  rules?: Record<string, RuleSetting>;
  include?: string[];
  exclude?: string[];
  /** Per-glob rule overrides. */
  overrides?: { files: string[]; rules: Record<string, RuleSetting> }[];
}
