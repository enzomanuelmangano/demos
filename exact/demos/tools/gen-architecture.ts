// Generates modules/apple/Architecture.generated.swift: for each demo, the facts the shake sheet's
// "How it's built" card shows (Contract lines and counts, the Rust surface files and shaders it
// draws with, the native Swift views and system APIs it uses), so the sheet only does a lookup.
//
//   bun tools/gen-architecture.ts
//
// Sources: demos.contract (the slug list), demos/<slug>/<slug>.contract plus the shared contracts
// it imports, gpu/src (a surface `name()` is gpu/src/name.rs or gpu/src/name/), gpu/shaders,
// modules/apple/Demos.swift (the native view tags) and app.contract (sensor inputs).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const APP = resolve(import.meta.dir, '..');
const read = (p: string) => readFileSync(resolve(APP, p), 'utf8');

const slugs = [...read('demos.contract').matchAll(/Demo\(slug="([a-z0-9-]+)"/g)].map(m => m[1]);

// The native views Demos.swift registers, by tag, with the name the card shows.
const nativeNames: Record<string, string> = {
  'glass-button': 'Glass button',
  'glass-pane': 'Glass pane',
  'variable-blur': 'Variable blur',
  'system-alert': 'System alert',
  'toggle-sheet': 'Toggle sheet',
  'swift-slider': 'Swift slider',
  'painting-menu': 'Painting menu',
  'audio-track': 'Audio track',
  'music-tabbar': 'Music tab bar',
  'native-tabbar': 'Native tab bar',
  'rolling-count': 'Rolling count',
  'mate-haptic': 'Mate haptic',
};
const registered = new Set([...read('modules/apple/Demos.swift').matchAll(/^\s*(?:return \[)?"([a-z-]+)": ExactNativeFactory/gm)].map(m => m[1]));
const tags = Object.keys(nativeNames).filter(t => registered.has(t));

// Contract text without comment lines.
const code = (text: string) => text.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

// A contract and the shared contracts it imports (not packages like pressto), each once.
const withImports = (file: string, seen = new Set<string>()): string[] => {
  if (seen.has(file) || !existsSync(file)) return [];
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^use .* from "(\.[^"]+\.contract)"/gm)) withImports(resolve(dirname(file), m[1]), seen);
  return [...seen];
};

const sensorSurfaces = new Set([...read('app.contract').matchAll(/startSensorInput\(surface="([a-z0-9_]+)"/g)].map(m => m[1]));

// Rust lines of a surface's source, without its trailing test module.
const rustLines = (file: string) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const tests = lines.findIndex(l => /^#\[cfg\(test\)\]/.test(l));
  return tests < 0 ? lines.length : tests;
};
const rustSources = (surface: string): string[] => {
  const file = resolve(APP, `gpu/src/${surface}.rs`);
  if (existsSync(file)) return [file];
  const dir = resolve(APP, `gpu/src/${surface}`);
  return existsSync(dir) && statSync(dir).isDirectory()
    ? readdirSync(dir).filter(f => f.endsWith('.rs')).sort().map(f => resolve(dir, f))
    : [];
};

const q = (s: string) => JSON.stringify(s);
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ',');
const list = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

type Arch = {
  contractLines: number; components: number; actions: number; derives: number;
  rustFiles: { name: string; lines: number }[]; shaders: string[]; hostHaptics: boolean;
  nativeViews: string[]; systemAPIs: string[];
};

const facts = (slug: string): Arch | null => {
  const file = resolve(APP, `demos/${slug}/${slug}.contract`);
  if (!existsSync(file)) return null;
  const own = readFileSync(file, 'utf8');
  const scanned = withImports(file).map(f => code(readFileSync(f, 'utf8'))).join('\n');
  const ownCode = code(own);

  const surfaces = [...new Set([...ownCode.matchAll(/surface=([a-z0-9_]+)\(/g)].map(m => m[1]))];
  const rustFiles: Arch['rustFiles'] = [];
  const shaders: string[] = [];
  let hostHaptics = false;
  for (const surface of surfaces) {
    for (const src of rustSources(surface)) {
      const text = readFileSync(src, 'utf8');
      rustFiles.push({ name: src.slice(resolve(APP, 'gpu/src').length + 1), lines: rustLines(src) });
      hostHaptics ||= /haptic::host/.test(text);
      for (const m of text.matchAll(/shaders::([a-z0-9_]+)|([a-z0-9_]+)\.wgsl/g)) {
        const name = m[1] ?? m[2];
        if (existsSync(resolve(APP, `gpu/shaders/${name}.wgsl`)) && !shaders.includes(name)) shaders.push(name);
      }
    }
  }

  const nativeViews = tags.filter(t => new RegExp(`^\\s*${t}\\b`, 'm').test(scanned)).map(t => nativeNames[t]);
  const systemAPIs: string[] = [];
  if (/\bhaptic\(/.test(scanned)) systemAPIs.push('Haptics');
  if (surfaces.some(s => sensorSurfaces.has(s))) systemAPIs.push('Motion sensors');

  return {
    contractLines: own.split('\n').length - (own.endsWith('\n') ? 1 : 0),
    components: (own.match(/^component\s/gm) ?? []).length,
    actions: (own.match(/^\s*action\s/gm) ?? []).length,
    derives: (own.match(/^\s*derive\s/gm) ?? []).length,
    rustFiles, shaders, hostHaptics, nativeViews, systemAPIs,
  };
};

// One plain sentence from the facts.
const summary = (a: Arch): string => {
  const rust = a.rustFiles.reduce((n, f) => n + f.lines, 0);
  const parts: string[] = [];
  if (rust > 0) {
    const gpu = a.shaders.length > 0 ? `, ${a.shaders.length === 1 ? 'one shader' : `${a.shaders.length} shaders`}` : '';
    parts.push(`Drawn and animated in Rust (${grouped(rust)} lines${gpu})`);
    parts.push(`Contract (${grouped(a.contractLines)} lines) lays out the screen and routes the touches`);
  } else {
    parts.push(`Built entirely in Contract (${grouped(a.contractLines)} lines): layout, state and animation, no Rust`);
  }
  if (a.hostHaptics) parts.push('Rust plays the haptics');
  else if (a.systemAPIs.includes('Haptics')) parts.push('Contract fires the haptics');
  if (a.systemAPIs.includes('Motion sensors')) parts.push('the motion sensors steer it');
  parts.push(a.nativeViews.length > 0 ? `native Swift supplies the ${list(a.nativeViews.map(n => n.toLowerCase()))}` : 'no native views');
  return `${parts.join('; ')}.`;
};

const swift = (slug: string, a: Arch) => {
  const files = a.rustFiles.map(f => `(${q(f.name)}, ${f.lines})`).join(', ');
  const strings = (xs: string[]) => `[${xs.map(q).join(', ')}]`;
  return `        ${q(slug)}: DemoArchitecture(contractLines: ${a.contractLines}, contractComponents: ${a.components}, contractActions: ${a.actions}, contractDerives: ${a.derives}, rustFiles: [${files}], shaders: ${strings(a.shaders)}, hostHaptics: ${a.hostHaptics}, nativeViews: ${strings(a.nativeViews)}, systemAPIs: ${strings(a.systemAPIs)}, summary: ${q(summary(a))})`;
};

const rows = slugs.flatMap(slug => {
  const a = facts(slug);
  return a ? [{ slug, a }] : [];
});

writeFileSync(resolve(APP, 'modules/apple/Architecture.generated.swift'), `// GENERATED by tools/gen-architecture.ts: do not edit by hand.
// How each demo is built, for the shake sheet's "How it's built" card: a lookup, nothing computed.
import Foundation

struct DemoArchitecture {
    let contractLines: Int
    let contractComponents: Int
    let contractActions: Int
    let contractDerives: Int
    /// The Rust surface sources, relative to gpu/src, with their line counts (tests excluded).
    let rustFiles: [(name: String, lines: Int)]
    /// The WGSL shaders those sources load, by file name in gpu/shaders.
    let shaders: [String]
    /// The surface hands its haptics to the host (crate::haptic::host).
    let hostHaptics: Bool
    let nativeViews: [String]
    let systemAPIs: [String]
    let summary: String

    var rustLines: Int { rustFiles.reduce(0) { $0 + $1.lines } }

    static let bySlug: [String: DemoArchitecture] = [
${rows.map(r => swift(r.slug, r.a)).join(',\n')}
    ]
}
`);

const missing = slugs.length - rows.length;
console.log(`${rows.length} demos${missing ? `, ${missing} without a contract` : ''}, ${rows.filter(r => r.a.rustFiles.length).length} with Rust`);
