#!/usr/bin/env bun
// The content pipeline (docs/architecture.md §5, Exact's docs site's own method: docs/site/tools/gen.ts): the
// reference's MDX (.content/, imported once) becomes typed block modules at build, read by the page components in
// Contract. Nothing of MDX or React runs in the browser: the parse, the syntax highlighting (the reference's own
// prism-react-renderer palenight theme and overrides, src/components/mdx/code-highlight.tsx), the maths (MathJax to
// SVG), the GitHub cards (a snapshot) and the image sizes are all decided here.
//
//   bun tools/gen-content.ts [--refresh-repos]
//
// Writes content-gen/ (captured by Exact, gitignored): articles/<slug>.ts, docs/<slug>.ts, index.ts (a loader per
// page, the slug lists and the article cards); and assets/content/<kind>/<slug>/… (the images, WebP where smaller,
// gitignored). An MDX construct the converter does not know fails the build, naming the file and line.
// Demo-tied content is out of scope (owner, docs/progress-content.md): SKIPPED below.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import { Prism, normalizeTokens, themes } from 'prism-react-renderer';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { createRequire } from 'node:module';

const SITE = join(import.meta.dir, '..');
const SRC = join(SITE, '.content');
// The pages are written to a dot directory beside content-gen/ (dot directories are never captured by Exact) and
// renamed into place only once every page converted: a failed run (a bad edit under `--watch`) leaves the previous
// pages as they were.
const FINAL = join(SITE, 'content-gen');
const OUT = join(SITE, '.content-gen.next');
const ASSETS = join(SITE, 'assets/content');
const ASSET_URL = '/assets/content';

// The owner's scope cut (docs/progress-content.md): articles that present Demos are not ported. One list, shared
// with the SEO files (tools/seo: head, JSON-LD, sitemap and RSS read the same .content/ index.json files).
import { NOT_PORTED as SKIPPED } from './seo/site.ts';

// ---------------------------------------------------------------------------------------------------------------
// Syntax highlighting: prism-react-renderer's Prism with the languages the reference loads (code-highlight.tsx
// imports prism-shell-session, -json, -json5 and css-extras into the same Prism), its remaps, and themePlus.
const require = createRequire(import.meta.url);
(globalThis as any).Prism = Prism;
for (const c of ['prism-shell-session', 'prism-json', 'prism-json5', 'prism-css-extras']) require(`prismjs/components/${c}`);

const palenight = themes.palenight;
const themePlus = {
  plain: { ...palenight.plain, backgroundColor: 'var(--color-surface-code)' },
  styles: [
    { types: palenight.styles[0].types, style: { ...palenight.styles[0].style, color: '#f2f5f7' } },
    { types: ['keyword', 'variable'], style: { color: '#c678dd' } },
    { types: ['string', 'char'], style: { color: '#e06c75' } },
    { types: ['number'], style: { color: '#d19a66' } },
    { types: ['comment'], style: { color: '#8b919d' } },
    { types: ['function', 'class-name'], style: { color: '#4b9fe4' } },
    { types: ['attr-name'], style: { color: '#e5c07b' } },
    { types: ['regex', 'important'], style: { color: '#56b6c2' } },
    { types: ['punctuation', 'operator'], style: { color: '#abb2bf' } },
  ],
};
const terminalTheme = { plain: { color: '#F8F8F2', backgroundColor: '#000000' }, styles: [{ types: ['comment', 'command'], style: { color: 'rgb(98, 114, 164)' } }] };
const REMAP: Record<string, string> = { 'objective-c': 'objc', sh: 'bash', shell: 'shell-session', rb: 'ruby', json: 'json5', javascript: 'js', typescript: 'ts' };

type Style = { color?: string; fontStyle?: string };
// prism-react-renderer's themeToDict and getStyleForToken, so a token's colour is the reference's to the letter.
function dict(theme: { plain: any; styles: { types: string[]; style: Style }[] }) {
  const d: Record<string, Style> = {};
  for (const e of theme.styles) for (const t of e.types) d[t] = { ...d[t], ...e.style };
  d.plain = { ...theme.plain, backgroundColor: undefined };
  return d;
}
const PLUS = dict(themePlus), TERM = dict(terminalTheme);

// A code line, compact (it is in the page's checkpoint as well as its HTML: docs/perf.md): one string, its diff mark
// (" " none, "+" added, "-" removed, "=" the pad of an unmarked line in a diff block) then its tokens, each a
// palette letter and its text, joined by U+E000. Empty tokens are dropped; the others stay one span each, as live
// (prism-react-renderer: a span per token, so every token box is at live's place). The palette is the theme's colours,
// the letters drawn by components/markdown.contract `Tok`.
const SEP = '\uE000';
const PALETTE: Record<string, string> = { '': '_', '#abb2bf': 'a', '#4b9fe4': 'f', '#c678dd': 'k', '#d19a66': 'n', '#e5c07b': 'y', '#e06c75': 's', '#8b919d/i': 'c', '#f2f5f7': 'w', 'rgb(98, 114, 164)': 't' };
type Line = string;

function highlight(raw: string, langIn: string, meta: string): { lang: string; terminal: boolean; diff: boolean; lines: Line[] } {
  let lang = (langIn || 'txt').toLowerCase();
  const terminal = ['terminal', 'term'].includes(lang);
  const isDiff = meta.includes('diff') || lang === 'diff';
  if (terminal) lang = 'shell-session';
  if (lang in REMAP) lang = REMAP[lang];
  let actual = lang;
  const m = meta.match(/^(\w+)\s+diff/);
  if (isDiff && m) actual = REMAP[m[1]] ?? m[1];
  const rawCode = raw.trim();
  const src = rawCode.split('\n');
  const marks = isDiff ? src.map((l) => (l.startsWith('+ ') || l === '+' ? '+' : l.startsWith('- ') || l === '-' ? '-' : '')) : [];
  const hasDiff = marks.some(Boolean);
  const code = isDiff && hasDiff ? src.map((l) => (l.startsWith('+ ') || l.startsWith('- ') ? l.slice(2) : l === '+' || l === '-' ? '' : l)).join('\n') : rawCode;
  const language = (isDiff && hasDiff ? actual : lang).toLowerCase();
  const grammar = (Prism.languages as any)[language];
  const tokens = grammar ? normalizeTokens(Prism.tokenize(code, grammar) as any) : normalizeTokens([code]);
  const d = terminal ? TERM : PLUS;
  const lines = tokens.map((line, i) => {
    const runs: [string, string][] = [];
    for (const t of line) {
      const text = t.empty ? '' : t.content;
      if (!text) continue;
      const style: Style = t.types.length === 1 && t.types[0] === 'plain' ? {} : t.types.length === 1 && t.empty != null ? d[t.types[0]] ?? {} : Object.assign({}, ...t.types.map((x) => d[x]));
      const key = (style?.color ?? '') + (style?.fontStyle === 'italic' ? '/i' : '');
      const letter = PALETTE[key];
      if (!letter) throw new Error(`code: the colour ${key} is not in the palette (tools/gen-content.ts PALETTE, components/markdown.contract Tok)`);
      runs.push([letter, text]);
    }
    return (hasDiff ? marks[i] || '=' : ' ') + runs.map(([l, t]) => l + t).join(SEP);
  });
  return { lang, terminal, diff: hasDiff, lines };
}

// ---------------------------------------------------------------------------------------------------------------
// Images: the size from the file's header (so every image has its box before it loads), copied next to the build;
// a PNG becomes a WebP when that is smaller (ImageMagick, quality 82), never wider than 1440 px (720 px at 2x, the
// article column).
function imageSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9; ) {
      const marker = b[i + 1], length = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + length;
    }
  }
  throw new Error(`${relative(SITE, file)}: not a PNG, GIF, JPEG or WebP`);
}

const MAX_WIDTH = 1440;
// `original`: the file is also kept under its own name (an article's featured image: its live URL,
// /content-assets/…, is routed to assets/content/… by tools/compose.ts and named by og:image and JSON-LD).
function asset(kind: string, slug: string, rel: string, original = false): { url: string; width: number; height: number } {
  const file = join(SRC, kind, slug, rel);
  if (!existsSync(file)) throw new Error(`${kind}/${slug}: image ${rel} does not exist`);
  const { width, height } = imageSize(file);
  const outDir = join(ASSETS, kind, slug, dirname(rel));
  mkdirSync(outDir, { recursive: true });
  const ext = extname(rel).toLowerCase();
  let name = basename(rel);
  const target = () => join(outDir, name);
  if ((ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') && (width > MAX_WIDTH || ext === '.png')) {
    // A resized WebP gets its own name, so the original keeps its file (a featured image's is og:image's).
    const webp = basename(rel, extname(rel)) + (ext === '.webp' ? `-${MAX_WIDTH}w.webp` : `${ext.replace('.', '-')}.webp`);
    const out = join(outDir, webp);
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(file).mtimeMs) {
      const r = spawnSync('magick', [file, '-resize', `${MAX_WIDTH}x>`, '-quality', '82', '-define', 'webp:method=6', out]);
      if (r.status !== 0) throw new Error(`magick failed on ${file}: ${r.stderr}`);
    }
    if (statSync(out).size < statSync(file).size) name = webp;
    else rmSync(out);
  }
  const own = join(outDir, basename(rel));
  if (original && name !== basename(rel) && (!existsSync(own) || statSync(own).size !== statSync(file).size)) copyFileSync(file, own);
  if (name === basename(rel) && (!existsSync(target()) || statSync(target()).size !== statSync(file).size)) copyFileSync(file, target());
  return { url: `${ASSET_URL}/${kind}/${slug}/${join(dirname(rel), name).replace(/^\.\//, '')}`, width, height };
}

// ---------------------------------------------------------------------------------------------------------------
// MathJax to SVG at build (the reference loads tex-svg from jsDelivr at run time). The SVG keeps `currentColor`.
let mathjax: { tex2svg: (tex: string, display: boolean) => { svg: string; width: number; height: number; valign: number } } | null = null;
async function math() {
  if (mathjax) return mathjax;
  const { mathjax: mj } = await import('mathjax-full/js/mathjax.js');
  const { TeX } = await import('mathjax-full/js/input/tex.js');
  const { SVG } = await import('mathjax-full/js/output/svg.js');
  const { liteAdaptor } = await import('mathjax-full/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler } = await import('mathjax-full/js/handlers/html.js');
  const { AllPackages } = await import('mathjax-full/js/input/tex/AllPackages.js');
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mj.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) });
  const EX = 8.5; // px per ex of Inter at 16 px (MathJax measures the surrounding font; 0.53 em)
  mathjax = {
    tex2svg(tex, display) {
      const node = doc.convert(tex, { display });
      const svg = adaptor.innerHTML(node).replace(/currentColor/g, '#c9cacf');
      const w = Number(svg.match(/width="([\d.]+)ex"/)?.[1] ?? 0), h = Number(svg.match(/height="([\d.]+)ex"/)?.[1] ?? 0);
      const v = Number(svg.match(/vertical-align: (-?[\d.]+)ex/)?.[1] ?? 0);
      return { svg: svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"'), width: Math.round(w * EX * 100) / 100, height: Math.round(h * EX * 100) / 100, valign: Math.round(v * EX * 100) / 100 };
    },
  };
  return mathjax;
}

// ---------------------------------------------------------------------------------------------------------------
// The blocks. One flat shape for every kind (Contract has no unions), as the docs site's Block: a kind and the
// fields it reads, the rest empty. Margins are resolved here (`mt`, `mb`, px), so the page's column needs no
// margin collapsing: the reference's .mdx-content is a flex column (no collapsing between its children), and the
// collapsing inside list items is decided below.
type Run = { text: string; code: boolean; strong: boolean; em: boolean; href: string; brand: boolean; math: string; width: number; height: number; valign: number };
type Repo = { name: string; owner: string; path: string; description: string; language: string; stars: string; forks: string; avatar: string; url: string };
type Block = { id: string; kind: string; depth: number; text: string; href: string; src: string; title: string; lang: string; width: number; height: number; mt: number; mb: number; loose: boolean; runs: Run[]; lines: Line[]; repo: Repo[] };
const NO_REPO: Repo = { name: '', owner: '', path: '', description: '', language: '', stars: '', forks: '', avatar: '', url: '' };

const repos: Record<string, any> = JSON.parse(readFileSync(join(SRC, 'github-repos.json'), 'utf8'));
const fmtCount = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

const INTERACTIVE_ARTICLES = new Set<string>();

// The ported interactive demos (components/interactive/<article>/index.contract, drawn by ArticleDemo in
// components/interactive/demo.contract; the mapping: docs/progress-comp-gesture.md). Per article, each MDX export
// and its props: a bool (`x`, `x={true}`, `x={false}`) or one of a string's values, with the reference's default
// (Contract props have none, so every prop is passed); none when the reference has no default (the MDX must pass
// it). BOXED: the articles whose every demo the MDX wraps in `<InteractiveBox>` (ArticleDemo draws the box). A tag, prop or value not listed here fails the build. An article not
// listed keeps the reference's empty 16:9 frame (the canvas demos, not ported yet).
type DemoProp = { values: (boolean | string)[]; default?: boolean | string };
const BOOL = (d: boolean): DemoProp => ({ values: [true, false], default: d });
const DEMOS: Record<string, Record<string, Record<string, DemoProp>>> = {
  'bottom-sheet-animation': { InitialSetup: {}, BasicComponent: {}, PanGesture: {}, BorderRadius: {}, FinalDemo: { hasBackdrop: BOOL(true) } },
  'checkbox-interactions': { Demo: {}, StaticDemo: {} },
  'css-animations-react-native': { AnimatedSquare: { withoutRepeat: BOOL(false), withoutPause: BOOL(false) } },
  'introduction-to-gestures': { IntroToGesturesDemo: {} },
  'introduction-to-reanimated': {
    FinalAnimatedSquareDemo: {},
    AnimatedSquareOpacityDemo: {},
    AnimatedSquareOpacityAndScaleDemo: { scaleAnimationType: { values: ['timing', 'spring'] }, showBorderRadiusAnimation: BOOL(false) },
  },
  'pan-gesture-handler': { InteractivePanGesture: {} },
  'skeleton-loader': { InteractiveSkeletonDemo: {}, InteractiveContactItem: {}, InteractiveJustSkeleton: {} },
};
const BOXED = new Set(['bottom-sheet-animation', 'css-animations-react-native']);

// The X posts' frame heights on live (iframe rect, tools/parity/shoot.ts), [550 px column, 342 px column].
const TWEETS: Record<string, [number, number]> = { '1954286123406262280': [817, 625] };

function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

// The reference's brand anchors (components/mdx Anchor): a link wrapping an element whose text names a brand
// keeps the element's look, without the link colour and underline.
const BRAND = [/^expo[-\s]?router$/i, /^sirius[-\s]?xm$/i, /^lego$/i, /^(react-navigation|react navigation)$/i, /^(expo|expo sdk)$/i];

const plain = (n: any): string => (n.value !== undefined && n.type !== 'mdxJsxAttribute' ? String(n.value) : (n.children ?? []).map(plain).join(''));
const attr = (n: any, name: string): string => {
  const a = (n.attributes ?? []).find((x: any) => x.name === name);
  if (!a) return '';
  if (typeof a.value === 'string') return a.value;
  const v = String(a.value?.value ?? '').trim();
  return v.replace(/^['"`](.*)['"`]$/s, '$1');
};

type Page = { kind: 'articles' | 'docs'; slug: string; file: string };

async function convert(page: Page, meta: any) {
  const text = readFileSync(page.file, 'utf8');
  const tree: any = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).parse(text);
  const where = (n: any) => `${relative(SITE, page.file)}:${n.position?.start?.line ?? '?'}`;
  let counter = 0;
  const next = () => (counter++).toString(36);
  const slug = slugger();
  const blocks: Block[] = [];
  const imported = new Set<string>();
  const block = (b: Partial<Block> & { kind: string }): Block => {
    const full: Block = { id: next(), depth: 0, text: '', href: '', src: '', title: '', lang: '', width: 0, height: 0, mt: 0, mb: 0, loose: false, runs: [], lines: [], repo: [], ...b };
    blocks.push(full);
    return full;
  };

  const mj = /InlineMath|BlockMath/.test(text) ? await math() : null;
  const mathFile = (tex: string, display: boolean) => {
    const r = mj!.tex2svg(tex, display);
    const dir = join(ASSETS, page.kind, page.slug);
    mkdirSync(dir, { recursive: true });
    const name = `math-${Bun.hash(`${display}:${tex}`).toString(36)}.svg`;
    writeFileSync(join(dir, name), r.svg);
    return { src: `${ASSET_URL}/${page.kind}/${page.slug}/${name}`, ...r };
  };

  const runs = (nodes: any[], style = { strong: false, em: false, href: '', brand: false }): Run[] => {
    const out: Run[] = [];
    const push = (text: string, extra: Partial<Run> = {}) => {
      if (text || extra.math) out.push({ text, code: false, strong: style.strong, em: style.em, href: style.href, brand: style.brand, math: '', width: 0, height: 0, valign: 0, ...extra });
    };
    for (const n of nodes) {
      switch (n.type) {
        case 'text': push(n.value); break;
        case 'strong': out.push(...runs(n.children, { ...style, strong: true })); break;
        case 'emphasis': out.push(...runs(n.children, { ...style, em: true })); break;
        case 'delete': out.push(...runs(n.children, style)); break;
        case 'inlineCode': push(n.value, { code: true }); break;
        case 'break': push('\n'); break;
        case 'link': {
          const element = n.children.length === 1 && n.children[0].type !== 'text';
          const brand = element && BRAND.some((r) => r.test(plain(n.children[0]).trim()));
          out.push(...runs(n.children, { ...style, href: n.url, brand }));
          break;
        }
        case 'mdxJsxTextElement':
          if (n.name === 'InlineMath') { const m = mathFile(plain(n), false); push('', { math: m.src, width: m.width, height: m.height, valign: m.valign }); break; }
          if (n.name === 'br') { push('\n'); break; }
          if (n.name === 'em' || n.name === 'i') { out.push(...runs(n.children, { ...style, em: true })); break; }
          if (n.name === 'strong' || n.name === 'b') { out.push(...runs(n.children, { ...style, strong: true })); break; }
          if (n.name === 'code') { push(plain(n), { code: true }); break; }
          if (n.name === 'a') { out.push(...runs(n.children, { ...style, href: attr(n, 'href') })); break; }
          throw new Error(`${where(n)}: inline <${n.name}> is not known to the converter`);
        case 'image': throw new Error(`${where(n)}: an image inside a line of text is not supported`);
        default: throw new Error(`${where(n)}: inline ${n.type} is not known to the converter`);
      }
    }
    return out;
  };

  const image = (n: any, depth: number) => {
    const url: string = n.url;
    if (/\.mp4$/i.test(url)) { block({ kind: 'video', depth, src: url, mb: 20 }); return; }
    if (/^[a-z]+:/i.test(url)) { block({ kind: 'image', depth, src: url, text: n.alt ?? '', mb: 20 }); return; }
    const a = asset(page.kind, page.slug, url.replace(/^\.\//, ''));
    block({ kind: 'image', depth, src: a.url, width: a.width, height: a.height, text: n.alt ?? '', mb: 20 });
  };

  // A list: its items flattened into `item` blocks (depth = nesting), an item's further children indented under it.
  // Spacing as the reference's CSS gives it: an `ul` has margin-bottom 1.25em; a loose item (`li:has(> p)`) is a
  // flow root holding its paragraphs' margins, so its list's margin adds to them; a tight item lets a nested list's
  // or a code block's margin collapse with its list's.
  const list = (n: any, depth: number) => {
    const loose = !!(n.spread || n.children.some((c: any) => c.spread));
    for (const item of n.children) {
      const [first, ...rest] = item.children;
      const head = first?.type === 'paragraph' ? first : null;
      block({ kind: 'item', depth, loose, runs: head ? runs(head.children) : [], mb: loose ? 20 : 0 });
      walk(head ? rest : item.children, depth + 1, loose);
    }
    const last = blocks[blocks.length - 1];
    // A top-level list is a flex item of the prose column, so it holds its last item's margins and adds its own; a
    // nested one's margin collapses with its item's.
    last.mb = depth === 0 ? last.mb + 20 : Math.max(last.mb, 20);
  };

  // A ported demo: `kind: 'demo'`, `lang` its article, `title` its export, `text` its props as Contract arguments
  // (`hasBackdrop=true`, every prop, in the table's order).
  const demo = (n: any, depth: number, boxed: boolean) => {
    const name = n.name as string, table = DEMOS[page.slug];
    if (name === 'InteractiveBox') {
      if (boxed || !BOXED.has(page.slug)) throw new Error(`${where(n)}: <InteractiveBox> is not known to the converter here`);
      if ((n.attributes ?? []).length) throw new Error(`${where(n)}: <InteractiveBox> takes no props`);
      const kids = (n.children ?? []).flatMap((c: any) => (c.type === 'paragraph' ? c.children : [c])).filter((c: any) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length !== 1 || !/^mdxJsx/.test(kids[0].type)) throw new Error(`${where(n)}: <InteractiveBox> holds one demo`);
      demo(kids[0], depth, true);
      return;
    }
    const spec = table[name];
    if (!spec) throw new Error(`${where(n)}: <${name}> is not a ported demo of ${page.slug} (DEMOS in tools/gen-content.ts)`);
    if (boxed !== BOXED.has(page.slug)) throw new Error(`${where(n)}: <${name}> is ${boxed ? '' : 'not '}inside <InteractiveBox>, unlike the reference`);
    const given: Record<string, boolean | string> = {};
    for (const a of n.attributes ?? []) {
      if (a.type !== 'mdxJsxAttribute' || !spec[a.name]) throw new Error(`${where(n)}: <${name}> has no prop ${a.name ?? '{...spread}'}`);
      const raw = a.value;
      const v = raw === null || raw === undefined ? true : typeof raw === 'string' ? raw : (() => {
        const e = String(raw.value ?? '').trim();
        if (e === 'true' || e === 'false') return e === 'true';
        const m = e.match(/^(['"`])(.*)\1$/s);
        if (m) return m[2];
        throw new Error(`${where(n)}: <${name} ${a.name}={${e}}>: only a literal is known to the converter`);
      })();
      if (!spec[a.name].values.includes(v)) throw new Error(`${where(n)}: <${name} ${a.name}> is ${JSON.stringify(v)}; known: ${spec[a.name].values.map((x) => JSON.stringify(x)).join(', ')}`);
      given[a.name] = v;
    }
    const args = Object.entries(spec).map(([k, p]) => {
      const v = k in given ? given[k] : p.default;
      if (v === undefined) throw new Error(`${where(n)}: <${name}> needs ${k} (the reference has no default)`);
      return `${k}=${typeof v === 'string' ? JSON.stringify(v) : v}`;
    });
    INTERACTIVE_ARTICLES.add(page.slug);
    block({ kind: 'demo', depth, title: name, lang: page.slug, text: args.join(', ') });
  };

  const walk = (nodes: any[], depth: number, inLoose = true) => {
    for (const n of nodes) {
      switch (n.type) {
        case 'mdxjsEsm': for (const m of String(n.value).matchAll(/import\s*\{([^}]*)\}/g)) for (const x of m[1].split(',')) imported.add(x.trim()); break;
        case 'mdxFlowExpression': if (!/^\s*\/\*[\s\S]*\*\/\s*$/.test(n.value)) throw new Error(`${where(n)}: an expression {${n.value}} is not known to the converter`); break;
        case 'heading': {
          const id = slug(plain(n));
          const mt = [0, 0, 40, 29.75, 0][n.depth] ?? 0, mb = [0, 0, 10, 8.5, 8][n.depth] ?? 8;
          block({ kind: 'heading', depth: n.depth, href: id, runs: runs(n.children), mt, mb, lang: String(depth) });
          break;
        }
        case 'paragraph': {
          const parts = n.children.filter((c: any) => !(c.type === 'text' && !c.value.trim()));
          if (parts.length && parts.every((c: any) => c.type === 'image')) { parts.forEach((c: any) => image(c, depth)); break; }
          // A component alone on its line is a paragraph's only child in MDX (<p><BlockMath/></p>): drawn as a block
          // inside the paragraph, whose bottom margin it keeps.
          if (parts.length && parts.every((c: any) => c.type === 'mdxJsxTextElement' && c.name !== 'InlineMath' && c.name !== 'br')) {
            walk(parts.map((c: any) => ({ ...c, type: 'mdxJsxFlowElement' })), depth, inLoose);
            blocks[blocks.length - 1].mb += inLoose || depth === 0 ? 20 : 0;
            break;
          }
          block({ kind: 'paragraph', depth, runs: runs(n.children), mb: inLoose || depth === 0 ? 20 : 0 });
          break;
        }
        case 'list': list(n, depth); break;
        case 'code': {
          const h = highlight(n.value, n.lang ?? '', n.meta ?? '');
          block({ kind: 'code', depth, lang: h.lang, title: h.terminal ? 'terminal' : h.diff ? 'diff' : '', lines: h.lines, mb: 20 });
          break;
        }
        case 'thematicBreak': block({ kind: 'rule', depth, mt: 32, mb: 14 }); break;
        case 'blockquote': block({ kind: 'quote', depth, runs: runs(n.children.flatMap((p: any) => p.children ?? [])), mb: 20 }); break;
        case 'html': if (/^<br\s*\/?>$/.test(n.value.trim())) break; throw new Error(`${where(n)}: raw HTML is not known to the converter`);
        case 'mdxJsxFlowElement': {
          const name = n.name as string;
          if (name === 'br') break;
          if (name === 'Title') { block({ kind: 'title', text: plain(n).trim().replace(/\s+/g, ' '), title: longDate(attr(n, 'date')) }); break; }
          if (name === 'GithubCard') {
            const repo = attr(n, 'repo'), path = attr(n, 'path'), r = repos[repo];
            const url = r ? (path ? `${r.html_url}/tree/main/${path}` : r.html_url) : path ? `https://github.com/${repo}/tree/main/${path}` : `https://github.com/${repo}`;
            block({ kind: 'github', depth, href: url, mb: 24, repo: [r ? { name: r.name, owner: r.owner.login, path: path ? path.split('/').pop()! : '', description: r.description ?? '', language: r.language ?? '', stars: fmtCount(r.stargazers_count), forks: fmtCount(r.forks_count), avatar: `${r.owner.avatar_url}&s=80`, url } : { ...NO_REPO, name: repo, url }] });
            break;
          }
          if (name === 'YouTubeEmbed') { block({ kind: 'youtube', depth, text: attr(n, 'videoId'), height: 400 }); break; }
          if (name === 'Embed') {
            const url = attr(n, 'url'), id = url.match(/\/status\/(\d+)/)?.[1];
            if (!/^https:\/\/(twitter\.com|x\.com)\/(.*)\/status\//.test(url) || !id) break; // the reference renders nothing
            // Live, X's widgets.js sizes the frame to the post (and gives it 10 px above and below); a frame of
            // Tweet.html cannot tell its height across origins, so it is the live one, measured per post (TWEETS):
            // `height` in a 550 px column (from a 598 px window), `width` at 342 px (a 390 px phone).
            const size = TWEETS[id];
            if (!size) throw new Error(`${where(n)}: the post ${id} has no measured height (TWEETS in tools/gen-content.ts)`);
            block({ kind: 'tweet', depth, href: url, text: id, height: size[0], width: size[1], mt: 10, mb: 90 });
            break;
          }
          if (name === 'BlockMath') { const m = mathFile(plain(n), true); block({ kind: 'math', depth, src: m.src, width: m.width, height: m.height }); break; }
          if (name === 'InlineMath') { const m = mathFile(plain(n), false); block({ kind: 'paragraph', depth, runs: [{ text: '', code: false, strong: false, em: false, href: '', brand: false, math: m.src, width: m.width, height: m.height, valign: m.valign }], mb: 20 }); break; }
          if (imported.has(name) && DEMOS[page.slug]) { demo(n, depth, false); break; }
          if (imported.has(name)) { INTERACTIVE_ARTICLES.add(page.slug); block({ kind: 'interactive', depth, title: name, lang: page.slug }); break; }
          throw new Error(`${where(n)}: <${name}> is not known to the converter`);
        }
        default: throw new Error(`${where(n)}: ${n.type} is not known to the converter`);
      }
    }
  };
  walk(tree.children, 0);
  return blocks;
}

const longDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const titleCase = (s: string) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// ---------------------------------------------------------------------------------------------------------------
if (process.argv.includes('--refresh-repos')) {
  // The live site reads stars and forks from GitHub with a token (env-dependent, docs/stubs.md); the public API
  // answers the same without one (60 requests an hour), so the snapshot is refreshed on demand, never per build.
  for (const name of Object.keys(repos)) {
    const r = await fetch(`https://api.github.com/repos/${name}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) { console.warn(`repos: ${name} answered ${r.status}, kept`); continue; }
    const j: any = await r.json();
    repos[name] = { name: j.name, description: j.description ?? '', stargazers_count: j.stargazers_count, forks_count: j.forks_count, language: j.language, html_url: j.html_url, owner: { avatar_url: j.owner.avatar_url, login: j.owner.login } };
  }
  writeFileSync(join(SRC, 'github-repos.json'), JSON.stringify(repos, null, 2) + '\n');
}

if (process.argv.includes('--watch')) {
  // The authoring loop (docs/content.md): every edit under .content/ runs the conversion again, so `serve` (which
  // rebuilds when a captured file changes) shows it. An error is printed and the last good output kept.
  const { watch } = await import('node:fs');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    const r = spawnSync('bun', [import.meta.path], { stdio: 'inherit' });
    if (r.status !== 0) console.error('content: not converted (the error is above); the previous pages stay');
  };
  run();
  watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  console.log('content: watching .content/');
  await new Promise(() => {});
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'articles'), { recursive: true });
mkdirSync(join(OUT, 'docs'), { recursive: true });

// index.json, the article's frontmatter, as the reference writes it: these fields, no others.
const FIELDS: Record<string, (v: unknown) => boolean> = {
  title: (v) => typeof v === 'string' && v.length > 0,
  shortTitle: (v) => typeof v === 'string' && v.length > 0,
  subtitle: (v) => typeof v === 'string' && v.length > 0,
  author: (v) => typeof v === 'string',
  date: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
  slug: (v) => typeof v === 'string',
  tags: (v) => Array.isArray(v) && v.every((t) => typeof t === 'string'),
  featuredImage: (v) => typeof v === 'string' && v.startsWith('./'),
  series: (v) => typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v),
  // Kept from the reference's metadata, not shown on the page: { url, directory }.
  repository: (v) => typeof v === 'object' && v !== null && typeof (v as any).url === 'string' && Object.keys(v).every((k) => k === 'url' || k === 'directory'),
};
const REQUIRED = ['title', 'subtitle', 'author', 'date', 'slug', 'tags', 'featuredImage'];
function checkMeta(slug: string, meta: any) {
  const where = `.content/articles/${slug}/index.json`;
  for (const k of Object.keys(meta)) if (!FIELDS[k]) throw new Error(`${where}: unknown field "${k}" (known: ${Object.keys(FIELDS).join(', ')})`);
  for (const k of REQUIRED) if (!(k in meta)) throw new Error(`${where}: "${k}" is required`);
  for (const [k, ok] of Object.entries(FIELDS)) if (k in meta && !ok(meta[k])) throw new Error(`${where}: "${k}" is not valid: ${JSON.stringify(meta[k])}`);
  if (meta.slug !== slug) throw new Error(`${where}: slug "${meta.slug}" differs from its folder "${slug}"`);
}

const DOC_TITLES: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', license: 'License' };
const articles: any[] = [];
for (const slug of readdirSync(join(SRC, 'articles')).sort()) {
  if (SKIPPED.has(slug)) continue;
  if (!existsSync(join(SRC, 'articles', slug, 'index.mdx'))) throw new Error(`.content/articles/${slug}: no index.mdx`);
  const meta = JSON.parse(readFileSync(join(SRC, 'articles', slug, 'index.json'), 'utf8'));
  checkMeta(slug, meta);
  const blocks = await convert({ kind: 'articles', slug, file: join(SRC, 'articles', slug, 'index.mdx') }, meta);
  const cover = asset('articles', slug, String(meta.featuredImage).replace(/^\.\//, ''), true);
  const page = { slug, title: meta.title, description: meta.subtitle, image: cover.url, date: meta.date, tags: meta.tags ?? [], blocks };
  writeFileSync(join(OUT, 'articles', `${slug}.ts`), `export default ${JSON.stringify(page)};\n`);
  articles.push({ slug, title: meta.shortTitle ?? meta.title, description: meta.subtitle, value: shortDate(meta.date), date: meta.date, href: `/articles/${slug}`, series: meta.series ?? '', cover: cover.url, coverWidth: cover.width, coverHeight: cover.height });
}
articles.sort((a, b) => b.date.localeCompare(a.date));
const docs: string[] = [];
for (const slug of readdirSync(join(SRC, 'docs')).sort()) {
  const blocks = await convert({ kind: 'docs', slug, file: join(SRC, 'docs', slug, 'index.mdx') }, {});
  writeFileSync(join(OUT, 'docs', `${slug}.ts`), `export default ${JSON.stringify({ slug, title: DOC_TITLES[slug] ?? slug, description: '', image: '', date: '', tags: [], blocks })};\n`);
  docs.push(slug);
}
const series = [...new Set(articles.map((a) => a.series).filter(Boolean))].sort();
const cards = articles.map(({ date, ...a }, i) => ({ id: a.slug, ...a, index: i }));
writeFileSync(join(OUT, 'cards.ts'), `export default ${JSON.stringify(cards)};\n`);
writeFileSync(join(OUT, 'index.ts'), [
  '// Generated by tools/gen-content.ts: do not edit.',
  `export const articleSlugs: string[] = ${JSON.stringify(articles.map((a) => a.slug))};`,
  `export const docSlugs: string[] = ${JSON.stringify(docs)};`,
  `export const seriesSlugs: string[] = ${JSON.stringify(series)};`,
  `export const seriesTitles: Record<string, string> = ${JSON.stringify(Object.fromEntries(series.map((s) => [s, titleCase(s)])))};`,
  "export const cards = () => import('./cards.ts');",
  `export const articles: Record<string, () => Promise<{ default: unknown }>> = {\n${articles.map((a) => `  ${JSON.stringify(a.slug)}: () => import('./articles/${a.slug}.ts'),`).join('\n')}\n};`,
  `export const docs: Record<string, () => Promise<{ default: unknown }>> = {\n${docs.map((d) => `  ${JSON.stringify(d)}: () => import('./docs/${d}.ts'),`).join('\n')}\n};`,
  '',
].join('\n'));
// Every page converted: swap the new tree in (two renames on one filesystem; the old tree removed after).
const OLD = join(SITE, '.content-gen.old');
rmSync(OLD, { recursive: true, force: true });
if (existsSync(FINAL)) renameSync(FINAL, OLD);
renameSync(OUT, FINAL);
rmSync(OLD, { recursive: true, force: true });
console.log(`content: ${articles.length} articles (${SKIPPED.size} skipped: demo-tied), ${docs.length} docs, ${series.length} series; interactive in ${INTERACTIVE_ARTICLES.size} articles`);
