import type { Rule } from '../types.ts';
import { commentsNear } from './util.ts';

export interface Preset {
  name: string;
  k: number;
  c: number;
  m: number;
}

// Built-in copy of demos/motion.contract, used when that file is absent (a package lifted out).
const BUILTIN: Preset[] = [
  { name: 'springSlow', k: 400, c: 80, m: 4 },
  { name: 'springGentle', k: 900, c: 120, m: 4 },
  { name: 'springFirm', k: 1600, c: 160, m: 4 },
  { name: 'springSnappy', k: 2500, c: 200, m: 4 },
  { name: 'springQuick', k: 4356, c: 264, m: 4 },
  { name: 'springBouncy', k: 250, c: 30, m: 1 },
];

/** A spring's shape: natural frequency (rad/s) and damping ratio. Mass only scales k and c. */
export function shape(k: number, c: number, m: number) {
  return { omega: Math.sqrt(k / m), zeta: c / (2 * Math.sqrt(k * m)) };
}

function presets(read: (rel: string) => string | undefined, cache: Map<string, unknown>, file: string): Preset[] {
  const hit = cache.get('spring-presets') as Preset[] | undefined;
  if (hit) return hit;
  const text = read(file);
  let list = BUILTIN;
  if (text) {
    const found: Preset[] = [];
    for (const m of text.matchAll(/^fn (spring\w+)\(\): string = "-exact-spring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)"/gm)) {
      found.push({ name: m[1], k: Number(m[2]), c: Number(m[3]), m: Number(m[4]) });
    }
    if (found.length) list = found;
  }
  cache.set('spring-presets', list);
  return list;
}

const DOCUMENTS_ORIGIN = /\b(mass|damping|stiffness|withSpring|springify|dampingRatio|Reanimated|RN's|RN constant)\b/i;

const rule: Rule = {
  meta: {
    id: 'spring-consistency',
    description: 'A `-exact-spring(k, c, m)` is one of the named presets (demos/motion.contract) within tolerance, or names its RN constants in a comment.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'refined',
    defaults: { presetsFile: 'demos/motion.contract', omegaTolerance: 0.12, zetaTolerance: 0.04 },
  },
  check({ file, options, project, report }) {
    const list = presets(project.read, project.cache, String(options.presetsFile));
    const wo = Number(options.omegaTolerance);
    const wz = Number(options.zetaTolerance);
    const re = /-exact-spring\(\s*([^)]*?)\s*\)/g;
    // The motion file itself defines the presets.
    if (file.file.endsWith('motion.contract')) return;
    for (const m of file.masked.matchAll(re)) {
      const args = m[1].split(',').map(s => Number(s.trim()));
      if (args.length !== 3 || args.some(n => !Number.isFinite(n) || n <= 0)) continue; // computed: not checkable
      const [k, c, mass] = args;
      const here = shape(k, c, mass);
      const near = list
        .map(p => ({ p, s: shape(p.k, p.c, p.m) }))
        .sort((a, b) => Math.abs(Math.log(a.s.omega / here.omega)) - Math.abs(Math.log(b.s.omega / here.omega)) + 4 * (Math.abs(a.s.zeta - here.zeta) - Math.abs(b.s.zeta - here.zeta)));
      const best = near[0];
      if (best && Math.abs(best.s.omega / here.omega - 1) <= wo && Math.abs(best.s.zeta - here.zeta) <= wz) continue;
      const at = m.index!;
      const pos = file.position(at);
      const comment = commentsNear(file, pos.line);
      if (DOCUMENTS_ORIGIN.test(comment)) continue; // a port: the comment names the source's constants
      report({
        at,
        key: `spring(${k}, ${c}, ${mass})`,
        message: `ad-hoc spring (${k}, ${c}, ${mass}) = ${here.omega.toFixed(1)} rad/s, damping ratio ${here.zeta.toFixed(2)}: use ${best ? `${best.p.name}() (${best.p.k}, ${best.p.c}, ${best.p.m})` : 'a preset'} from motion.contract, or comment the RN constants (mass, damping, stiffness) it copies`,
      });
    }
  },
};
export default rule;
