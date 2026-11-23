// The rule engine: runs the enabled rules over parsed files, applies inline suppressions, and
// turns reports into findings with stable hashes (for the baseline).
import { createHash } from 'node:crypto';
import type { Attr, Edit, Finding, LintConfig, Node, ParsedFile, Project, Rule, RuleSetting, Severity } from './types.ts';
import { nodeSnippet, parseContract } from './parser.ts';

export function settingOf(s: RuleSetting | undefined): { severity: Severity; options: Record<string, unknown> } {
  if (s === undefined) return { severity: 'off', options: {} };
  if (Array.isArray(s)) return { severity: s[0], options: s[1] ?? {} };
  return { severity: s, options: {} };
}

/** Suppressions from comments:
 *    // contract-lint-disable-next-line rule-a, rule-b -- why
 *    // contract-lint-disable-line rule-a            (trailing, or on its own line for that line)
 *    // contract-lint-disable-file rule-a            (anywhere in the file)
 *  `*` stands for every rule. */
function suppressions(file: ParsedFile) {
  const lineRules = new Map<number, Set<string>>();
  const fileRules = new Set<string>();
  const add = (line: number, ids: string[]) => {
    const s = lineRules.get(line) ?? new Set();
    ids.forEach(i => s.add(i));
    lineRules.set(line, s);
  };
  for (const c of file.comments) {
    const m = /contract-lint-disable(-next-line|-line|-file)?\b([^\n]*)/.exec(c.text);
    if (!m) continue;
    const ids = m[2].split('--')[0].split(/[\s,]+/).filter(Boolean);
    if (!ids.length) ids.push('*');
    if (m[1] === '-file') ids.forEach(i => fileRules.add(i));
    else if (m[1] === '-next-line') add(c.line + 1, ids);
    else add(c.line, ids);
  }
  return {
    has(ruleId: string, line: number, endLine: number) {
      if (fileRules.has('*') || fileRules.has(ruleId)) return true;
      for (let l = line; l <= endLine; l++) {
        const s = lineRules.get(l);
        if (s && (s.has('*') || s.has(ruleId))) return true;
      }
      return false;
    },
  };
}

export function hashOf(ruleId: string, key: string): string {
  return createHash('sha1').update(ruleId + '\0' + key).digest('hex').slice(0, 10);
}

export interface LintOptions {
  config: LintConfig;
  rules: Rule[];
  project: Project;
  /** Run only these rule ids (CLI `--rule`). */
  only?: string[];
}

export function lintFile(file: ParsedFile, opts: LintOptions, rulesFor: (ruleId: string) => RuleSetting | undefined): Finding[] {
  const findings: Finding[] = [];
  const sup = suppressions(file);
  for (const rule of opts.rules) {
    if (opts.only && !opts.only.includes(rule.meta.id)) continue;
    const { severity, options } = settingOf(rulesFor(rule.meta.id));
    if (severity === 'off') continue;
    const merged = { ...(rule.meta.defaults ?? {}), ...options };
    rule.check({
      file,
      options: merged,
      project: opts.project,
      report(input) {
        const at = input.at;
        let line: number;
        let col: number;
        let endLine: number;
        let node: Node | undefined;
        if (typeof at === 'number') {
          const p = file.position(at);
          line = p.line;
          col = p.col;
          endLine = line;
        } else if ('value' in at && 'valueStart' in at) {
          const a = at as Attr;
          line = a.line;
          col = a.col;
          endLine = file.position(a.end).line;
          node = a.node;
        } else {
          const n = at as Node;
          line = n.line;
          col = n.col;
          endLine = n.endLine;
          node = n;
        }
        if (sup.has(rule.meta.id, line, endLine)) return;
        // A finding on an attribute is suppressed by a comment above its node, too.
        if (node && sup.has(rule.meta.id, node.line, node.line)) return;
        const snippet = input.key ?? (node ? nodeSnippet(file, node) : (file.lines[line - 1] ?? '').trim());
        findings.push({
          ruleId: rule.meta.id,
          severity: severity as 'error' | 'warn',
          message: input.message,
          file: file.file,
          line,
          col,
          hash: hashOf(rule.meta.id, snippet),
          fix: input.fix,
        });
      },
    });
  }
  return findings;
}

export function applyFixes(source: string, findings: Finding[]): { text: string; applied: number } {
  const edits: Edit[] = [];
  for (const f of findings) if (f.fix) edits.push(...f.fix);
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let pos = 0;
  let applied = 0;
  for (const e of edits) {
    if (e.start < pos) continue; // overlaps an earlier edit: next run
    out += source.slice(pos, e.start) + e.text;
    pos = e.end;
    applied++;
  }
  out += source.slice(pos);
  return { text: out, applied };
}

export { parseContract };
