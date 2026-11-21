// The baseline: findings accepted as debt. A finding matches an entry by file + rule + hash (the
// hash is of the offending node's normalised text, so moving it down the file does not break it).
// An entry has a count: two identical nodes in one file are two entries' worth.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Finding } from './types.ts';

export interface BaselineEntry {
  file: string;
  rule: string;
  hash: string;
  count: number;
  /** For humans reading the file: where it was and what it said. */
  line?: number;
  message?: string;
}
export interface Baseline {
  version: 1;
  generated: string;
  entries: BaselineEntry[];
}

const keyOf = (file: string, rule: string, hash: string) => `${file}\0${rule}\0${hash}`;

export function loadBaseline(path: string): Baseline | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline;
}

export function makeBaseline(findings: Finding[]): Baseline {
  const map = new Map<string, BaselineEntry>();
  for (const f of findings) {
    const k = keyOf(f.file, f.ruleId, f.hash);
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { file: f.file, rule: f.ruleId, hash: f.hash, count: 1, line: f.line, message: f.message });
  }
  const entries = [...map.values()].sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || (a.line ?? 0) - (b.line ?? 0));
  return { version: 1, generated: new Date().toISOString().slice(0, 10), entries };
}

export function writeBaseline(path: string, b: Baseline) {
  writeFileSync(path, JSON.stringify(b, null, 1).replace(/\n {2}/g, '\n  ') + '\n');
}

/** Splits findings into new ones and debt (matched by the baseline), and lists unused entries. */
export function applyBaseline(findings: Finding[], baseline: Baseline | undefined) {
  if (!baseline) return { fresh: findings, debt: [] as Finding[], stale: 0 };
  const left = new Map<string, number>();
  for (const e of baseline.entries) left.set(keyOf(e.file, e.rule, e.hash), e.count);
  const fresh: Finding[] = [];
  const debt: Finding[] = [];
  for (const f of findings) {
    const k = keyOf(f.file, f.ruleId, f.hash);
    const n = left.get(k) ?? 0;
    if (n > 0) {
      left.set(k, n - 1);
      debt.push(f);
    } else fresh.push(f);
  }
  let stale = 0;
  for (const n of left.values()) stale += n;
  return { fresh, debt, stale };
}
