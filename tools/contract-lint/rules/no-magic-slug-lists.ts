import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Rule } from '../types.ts';

function slugs(root: string, cache: Map<string, unknown>): Set<string> {
  let s = cache.get('slugs') as Set<string> | undefined;
  if (!s) {
    s = new Set();
    try {
      for (const e of readdirSync(join(root, 'demos'), { withFileTypes: true })) if (e.isDirectory()) s.add(e.name);
    } catch {
      /* no demos folder: the rule has nothing to compare with */
    }
    cache.set('slugs', s);
  }
  return s;
}

const rule: Rule = {
  meta: {
    id: 'no-magic-slug-lists',
    description: 'A hand-written list of demo slugs drifts as demos come and go; read `allDemos()` (demos.contract) or a generated file.',
    defaultSeverity: 'warn',
    fixable: false,
    origin: 'project',
    defaults: { min: 3 },
  },
  check({ file, options, project, report }) {
    const known = slugs(project.root, project.cache);
    if (!known.size) return;
    const min = Number(options.min);
    for (const m of file.masked.matchAll(/\[\s*"[a-z0-9-]+"(?:\s*,\s*"[a-z0-9-]+")*\s*,?\s*\]/g)) {
      const items = [...m[0].matchAll(/"([a-z0-9-]+)"/g)].map(x => x[1]);
      const hits = items.filter(i => known.has(i));
      if (hits.length >= min) {
        report({ at: m.index!, key: hits.slice(0, 3).join(','), message: `a list of ${hits.length} demo slugs (${hits.slice(0, 3).join(', ')}, ...): derive it from allDemos() or generate it, so adding a demo cannot leave it stale` });
      }
    }
  },
};
export default rule;
