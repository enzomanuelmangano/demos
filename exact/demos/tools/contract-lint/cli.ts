// The command line: `bun tools/lint-contract.ts [paths] [options]`.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { applyBaseline, loadBaseline, makeBaseline, writeBaseline } from './baseline.ts';
import { configs } from './config.ts';
import { applyFixes, lintFile, settingOf } from './engine.ts';
import { format, type Format } from './format.ts';
import { parseContract } from './parser.ts';
import { rules } from './rules/index.ts';
import type { Finding, LintConfig, Project, RcFile, RuleSetting } from './types.ts';

const HELP = `contract-lint: quality rules for Exact Contract files.

usage: bun tools/lint-contract.ts [paths...] [options]
  paths                 files or folders (default: the config's include list)
  --fix                 apply the autofixes (corner-shape, hairline, box-sizing, hit-slop)
  --rule <id[,id]>      run only these rules (repeatable)
  --format <f>          stylish (default) | compact | json | github
  --baseline <file>     accepted findings: only findings not in it are reported or fail
  --update-baseline     write the current findings to the --baseline file
  --max-warnings <n>    fail when more than n NEW warnings (default: no limit)
  --show-debt           list the baselined findings too
  --config <file>       rc file (default: .contractlintrc.json in the project root)
  --root <dir>          the Contract project's root (default: the folder above tools/)
  --list-rules          the rules, with severity in the chosen config
exit code: 1 on a new error (or too many new warnings), 2 on a usage error, else 0.`;

interface Args {
  paths: string[];
  fix: boolean;
  only: string[];
  format: Format;
  baseline?: string;
  updateBaseline: boolean;
  maxWarnings?: number;
  showDebt: boolean;
  config?: string;
  root?: string;
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { paths: [], fix: false, only: [], format: 'stylish', updateBaseline: false, showDebt: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${x} needs a value`);
      return v;
    };
    if (x === '--fix') a.fix = true;
    else if (x === '--rule') a.only.push(...val().split(','));
    else if (x === '--format') a.format = val() as Format;
    else if (x === '--baseline') a.baseline = val();
    else if (x === '--update-baseline') a.updateBaseline = true;
    else if (x === '--max-warnings') a.maxWarnings = Number(val());
    else if (x === '--show-debt') a.showDebt = true;
    else if (x === '--config') a.config = val();
    else if (x === '--root') a.root = val();
    else if (x === '--list-rules') a.list = true;
    else if (x === '-h' || x === '--help') {
      console.log(HELP);
      process.exit(0);
    } else if (x.startsWith('-')) throw new Error(`unknown option ${x}`);
    else a.paths.push(x);
  }
  return a;
}

function globToRe(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const matches = (globs: string[], rel: string) => globs.some(g => globToRe(g).test(rel));

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'target') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.contract')) out.push(p);
  }
}

export function main(argv: string[], defaultRoot: string): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(String((e as Error).message));
    console.error(HELP);
    return 2;
  }
  const root = resolve(args.root ?? defaultRoot);
  const rcPath = resolve(root, args.config ?? '.contractlintrc.json');
  const rc: RcFile = existsSync(rcPath) ? JSON.parse(readFileSync(rcPath, 'utf8')) : { extends: 'recommended' };
  const base: LintConfig = configs[rc.extends ?? 'recommended'];
  const settings: Record<string, RuleSetting> = { ...base.rules, ...(rc.rules ?? {}) };
  const settingsFor = (rel: string) => {
    let s = settings;
    for (const o of rc.overrides ?? []) if (matches(o.files, rel)) s = { ...s, ...o.rules };
    return (id: string) => s[id];
  };

  if (args.list) {
    for (const r of rules) {
      const { severity } = settingOf(settings[r.meta.id]);
      console.log(`${severity.padEnd(5)} ${r.meta.id.padEnd(26)} ${r.meta.fixable ? 'fix ' : '    '} ${r.meta.description}`);
    }
    return 0;
  }

  const project: Project = {
    root,
    read: rel => {
      const p = resolve(root, rel);
      return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
    },
    cache: new Map(),
  };

  // The files to lint.
  const include = rc.include ?? ['app.contract', 'demos/**/*.contract', 'home/**/*.contract'];
  const exclude = rc.exclude ?? ['**/*.test.contract'];
  const files: string[] = [];
  if (args.paths.length) {
    for (const p of args.paths) {
      const abs = resolve(process.cwd(), p);
      if (!existsSync(abs)) {
        console.error(`no such path: ${p}`);
        return 2;
      }
      if (statSync(abs).isDirectory()) walk(abs, files);
      else files.push(abs);
    }
  } else {
    const all: string[] = [];
    walk(root, all);
    for (const abs of all) if (matches(include, relative(root, abs))) files.push(abs);
  }
  const rels = [...new Set(files.map(f => relative(root, f)))].sort().filter(r => !matches(exclude, r));

  const findings: Finding[] = [];
  let skippedGenerated = 0;
  const sources = new Map<string, string>();
  for (const rel of rels) {
    const source = readFileSync(resolve(root, rel), 'utf8');
    if (/^\s*\/\/\s*GENERATED\b/.test(source) || /^\/\/[^\n]*Written by tools\/gen-/.test(source)) {
      skippedGenerated++;
      continue;
    }
    sources.set(rel, source);
    const parsed = parseContract(rel, source);
    findings.push(...lintFile(parsed, { config: { rules: settings }, rules, project, only: args.only.length ? args.only : undefined }, settingsFor(rel)));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);

  if (args.fix) {
    let total = 0;
    for (const [rel, source] of sources) {
      const mine = findings.filter(f => f.file === rel && f.fix);
      if (!mine.length) continue;
      const { text, applied } = applyFixes(source, mine);
      if (applied) {
        writeFileSync(resolve(root, rel), text);
        total += applied;
      }
    }
    console.log(`fixed ${total} finding(s); run again to see what is left (fixes that overlap wait for the next run)`);
    return 0;
  }

  const baselinePath = args.baseline ? resolve(process.cwd(), args.baseline) : undefined;
  if (args.updateBaseline) {
    if (!baselinePath) {
      console.error('--update-baseline needs --baseline <file>');
      return 2;
    }
    writeBaseline(baselinePath, makeBaseline(findings));
    console.log(`baseline written: ${findings.length} finding(s) in ${baselinePath}`);
    return 0;
  }
  const { fresh, debt, stale } = applyBaseline(findings, baselinePath ? loadBaseline(baselinePath) : undefined);

  const errors = fresh.filter(f => f.severity === 'error').length;
  const warnings = fresh.length - errors;
  console.log(format(args.format, { fresh, debt: args.showDebt ? debt : [], debtCount: debt.length, stale, files: sources.size, skippedGenerated, baselined: !!baselinePath }));
  if (errors > 0) return 1;
  if (args.maxWarnings !== undefined && warnings > args.maxWarnings) return 1;
  return 0;
}
