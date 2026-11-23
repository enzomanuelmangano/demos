// Output formats. `stylish` is ESLint's (grouped by file, `line:col  severity  message  rule`);
// `compact` is one line per finding (`file:line:col: severity rule-id message`); `github` writes
// workflow annotations; `json` everything.
import type { Finding } from './types.ts';

export type Format = 'stylish' | 'compact' | 'json' | 'github';

export interface Report {
  fresh: Finding[];
  debt: Finding[];
  debtCount: number;
  stale: number;
  files: number;
  skippedGenerated: number;
  baselined: boolean;
}

function counts(findings: Finding[]) {
  const by = new Map<string, number>();
  for (const f of findings) by.set(f.ruleId, (by.get(f.ruleId) ?? 0) + 1);
  return [...by].sort((a, b) => b[1] - a[1]);
}

export function format(kind: Format, r: Report): string {
  if (kind === 'json') {
    return JSON.stringify({ findings: r.fresh, debt: r.debt, summary: { files: r.files, new: r.fresh.length, debt: r.debtCount, perRule: Object.fromEntries(counts(r.fresh)) } }, null, 2);
  }
  const lines: string[] = [];
  const all = [...r.fresh.map(f => [f, false] as const), ...r.debt.map(f => [f, true] as const)];
  if (kind === 'github') {
    for (const [f, isDebt] of all) {
      const level = isDebt ? 'notice' : f.severity === 'error' ? 'error' : 'warning';
      lines.push(`::${level} file=${f.file},line=${f.line},col=${f.col},title=${f.ruleId}::${f.message.replace(/\n/g, ' ')}`);
    }
  } else if (kind === 'compact') {
    for (const [f, isDebt] of all) lines.push(`${f.file}:${f.line}:${f.col}: ${isDebt ? 'debt ' : f.severity} ${f.ruleId} ${f.message}`);
  } else {
    let last = '';
    const w = Math.max(0, ...all.map(([f]) => `${f.line}:${f.col}`.length));
    for (const [f, isDebt] of all) {
      if (f.file !== last) {
        if (last) lines.push('');
        lines.push(f.file);
        last = f.file;
      }
      lines.push(`  ${`${f.line}:${f.col}`.padEnd(w)}  ${(isDebt ? 'debt' : f.severity).padEnd(5)} ${f.message}  ${f.ruleId}`);
    }
    if (lines.length) lines.push('');
  }
  const errors = r.fresh.filter(f => f.severity === 'error').length;
  const warnings = r.fresh.length - errors;
  const tail = [`${r.fresh.length} new problem${r.fresh.length === 1 ? '' : 's'} (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}) in ${r.files} files`];
  if (r.baselined) tail.push(`${r.debtCount} accepted in the baseline (debt)${r.stale ? `, ${r.stale} baseline entr${r.stale === 1 ? 'y is' : 'ies are'} fixed: run --update-baseline to drop them` : ''}`);
  if (r.skippedGenerated) tail.push(`${r.skippedGenerated} generated file${r.skippedGenerated === 1 ? '' : 's'} skipped`);
  const per = counts(r.fresh);
  if (per.length && kind === 'stylish') tail.push(per.map(([id, n]) => `${id}: ${n}`).join(', '));
  if (kind === 'github') return [...lines, ...tail.map(t => `contract-lint: ${t}`)].join('\n');
  return [...lines, ...tail].join('\n');
}
