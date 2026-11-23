#!/usr/bin/env bun
// A pre-commit-style secret check (docs/local-env.md). Never prints a value: a finding names the file, the line and
// the rule (or the env key whose value matched).
//
//   bun tools/check-secrets.ts                 the staged diff (git diff --cached), the default
//   bun tools/check-secrets.ts --tracked       every tracked file under .site/
//   bun tools/check-secrets.ts --dir <path>…   files under a build output (dist, .vercel/output): no SERVER value may be
//                                              there (public client keys may: the reference ships them too)
//
// Rules: (1) generic patterns (private keys, JWTs, provider token prefixes, a reference env name assigned a non-empty
// literal); (2) when the owner's env file exists (tools/local-env/env-file.ts), any of its values longer than 7
// characters, the public client keys excepted for --dir, the public ones included for the staged diff and --tracked
// (no value belongs in git).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PUBLIC_KEYS, REFERENCE_KEYS, readEnvFile } from './local-env/env-file.ts';

const SITE = resolve(import.meta.dir, '..');
const REPO = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: SITE, encoding: 'utf8' }).stdout.trim();
const env = readEnvFile();
// Build-system bookkeeping (commit SHAs, branch names) and the media CDN's URL (public, written in the content since
// phase 1, docs/stubs.md): not secrets.
const IGNORED_KEYS = /^(VERCEL|TURBO|NX)_|^VERCEL$|^EXPO_PUBLIC_MEDIA_CDN_URL$/;
const isPublicUrl = (v: string) => /^https?:\/\/(localhost|127\.0\.0\.1|reactiive\.io|www\.reactiive\.io)(:\d+)?\/?$/.test(v);

const PATTERNS: [string, RegExp][] = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['secret key prefix', /\b(sk_(live|test)_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/],
  ['postgres URL with a password', /postgres(ql)?:\/\/[^\s:'"]+:[^\s@'"]{6,}@/],
  ['Telegram bot token', /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/],
  ['env name assigned a value', new RegExp(`\\b(${REFERENCE_KEYS.filter((k) => !k.startsWith('EXPO_PUBLIC_') && k !== 'LOG_LEVEL').join('|')})\\s*[=:]\\s*["']?[A-Za-z0-9_\\-/+.]{8,}`)],
];

type Finding = { where: string; rule: string };
function scanText(where: string, text: string, values: [string, string][]): Finding[] {
  const out: Finding[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [rule, re] of PATTERNS) if (re.test(line)) out.push({ where: `${where}:${i + 1}`, rule });
    for (const [k, v] of values) if (line.includes(v)) out.push({ where: `${where}:${i + 1}`, rule: `the value of ${k}` });
  });
  return out;
}
const envValues = (allowPublic: boolean): [string, string][] => {
  if (!env) return [];
  return [...env.entries()].filter(([k, v]) => v.length > 7 && !IGNORED_KEYS.test(k) && !isPublicUrl(v) && !(allowPublic && (PUBLIC_KEYS as readonly string[]).includes(k)));
};

const findings: Finding[] = [];
let scanned = 0;
const dirAt = process.argv.indexOf('--dir');
if (dirAt >= 0) {
  const values = envValues(true);
  for (const d of process.argv.slice(dirAt + 1)) {
    const root = resolve(d);
    const walk = (p: string) => {
      for (const n of readdirSync(p)) {
        const f = join(p, n);
        const st = statSync(f);
        if (st.isDirectory()) walk(f);
        else if (st.size < 32 * 1024 * 1024 && /\.(html|js|mjs|json|css|txt|xml|plan|map|webmanifest)$/.test(n)) { scanned++; findings.push(...scanText(relative(SITE, f), readFileSync(f, 'utf8'), values)); }
      }
    };
    if (existsSync(root)) walk(root);
  }
} else if (process.argv.includes('--tracked')) {
  const values = envValues(false);
  const files = spawnSync('git', ['ls-files', '-z', '--', '.site'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  for (const f of files) {
    const p = join(REPO, f);
    if (!existsSync(p) || statSync(p).size > 8 * 1024 * 1024) continue;
    const buf = readFileSync(p);
    if (buf.subarray(0, 8000).some((b) => b === 0)) continue; // binary
    scanned++;
    findings.push(...scanText(f, buf.toString('utf8'), values));
  }
} else {
  const values = envValues(false);
  const diff = spawnSync('git', ['diff', '--cached', '--no-color', '-U0'], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout;
  let file = '';
  let line = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+')) { scanned++; findings.push(...scanText(`${file}:${line}`, l.slice(1), values).map((f) => ({ ...f, where: `${file}:${line}` }))); line++; }
  }
  // A staged env file is a finding by itself.
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n');
  for (const f of staged) if (/(^|\/)\.env(\.|$)(?!example)/.test(f) || /\.secrets\//.test(f)) findings.push({ where: f, rule: 'an env file is staged' });
}

const unit = dirAt >= 0 ? 'files' : process.argv.includes('--tracked') ? 'files' : 'added lines';
for (const f of findings) console.log(`check-secrets: ${f.where}: ${f.rule}`);
console.log(`check-secrets: ${scanned} ${unit} scanned${env ? ' (env file values included)' : ' (no env file: patterns only)'}, ${findings.length} finding(s)`);
process.exit(findings.length ? 1 : 0);
