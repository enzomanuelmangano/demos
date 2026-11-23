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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { createRequire } from 'node:module';

const SITE = join(import.meta.dir, '..');
const SRC = join(SITE, '.content');
const OUT = join(SITE, 'content-gen');
const ASSETS = join(SITE, 'assets/content');
const ASSET_URL = '/assets/content';

// The owner's scope cut (docs/progress-content.md): articles that present Demos are not ported.
export const SKIPPED = new Set(['building-demos', 'leaving-patreon', 'patreon-migration', 'open-sourcing-demos']);

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

type Tok = { id: string; text: string; color: string; italic: boolean };
type Line = { id: string; mark: string; toks: Tok[] };

function highlight(raw: string, langIn: string, meta: string, next: () => string): { lang: string; terminal: boolean; diff: boolean; code: string; lines: Line[] } {
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
  const marks = isDiff ? src.map((l) => (l.startsWith('+ ') || l === '+' ? 'add' : l.startsWith('- ') || l === '-' ? 'del' : '')) : [];
  const hasDiff = marks.some(Boolean);
  const code = isDiff && hasDiff ? src.map((l) => (l.startsWith('+ ') || l.startsWith('- ') ? l.slice(2) : l === '+' || l === '-' ? '' : l)).join('\n') : rawCode;
  const language = (isDiff && hasDiff ? actual : lang).toLowerCase();
  const grammar = (Prism.languages as any)[language];
  const tokens = grammar ? normalizeTokens(Prism.tokenize(code, grammar) as any) : normalizeTokens([code]);
  const d = terminal ? TERM : PLUS;
  const lines = tokens.map((line, i) => ({
    id: next(),
    mark: hasDiff ? marks[i] || 'pad' : '',
    toks: line.map((t) => {
      const style: Style = t.types.length === 1 && t.types[0] === 'plain' ? {} : t.types.length === 1 && t.empty != null ? d[t.types[0]] ?? {} : Object.assign({}, ...t.types.map((x) => d[x]));
      return { id: next(), text: t.empty ? '' : t.content, color: style?.color ?? '', italic: style?.fontStyle === 'italic' };
    }),
  }));
  return { lang, terminal, diff: hasDiff, code, lines };
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
function asset(kind: string, slug: string, rel: string): { url: string; width: number; height: number } {
  const file = join(SRC, kind, slug, rel);
  if (!existsSync(file)) throw new Error(`${kind}/${slug}: image ${rel} does not exist`);
  const { width, height } = imageSize(file);
  const outDir = join(ASSETS, kind, slug, dirname(rel));
  mkdirSync(outDir, { recursive: true });
  const ext = extname(rel).toLowerCase();
  let name = basename(rel);
  const target = () => join(outDir, name);
  if ((ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') && (width > MAX_WIDTH || ext === '.png')) {
    const webp = basename(rel, extname(rel)) + (ext === '.webp' ? '.webp' : `${ext.replace('.', '-')}.webp`);
    const out = join(outDir, webp);
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(file).mtimeMs) {
      const r = spawnSync('magick', [file, '-resize', `${MAX_WIDTH}x>`, '-quality', '82', '-define', 'webp:method=6', out]);
      if (r.status !== 0) throw new Error(`magick failed on ${file}: ${r.stderr}`);
    }
    if (statSync(out).size < statSync(file).size) name = webp;
    else rmSync(out);
  }
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
type Run = { id: string; text: string; code: boolean; strong: boolean; em: boolean; href: string; brand: boolean; math: string; width: number; height: number; valign: number };
type Repo = { name: string; owner: string; path: string; description: string; language: string; stars: string; forks: string; avatar: string; url: string };
type Block = { id: string; kind: string; depth: number; text: string; href: string; src: string; title: string; lang: string; width: number; height: number; mt: number; mb: number; loose: boolean; runs: Run[]; lines: Line[]; repo: Repo };
const NO_REPO: Repo = { name: '', owner: '', path: '', description: '', language: '', stars: '', forks: '', avatar: '', url: '' };

const repos: Record<string, any> = JSON.parse(readFileSync(join(SRC, 'github-repos.json'), 'utf8'));
const fmtCount = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

const INTERACTIVE_ARTICLES = new Set<string>();

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
    const full: Block = { id: next(), depth: 0, text: '', href: '', src: '', title: '', lang: '', width: 0, height: 0, mt: 0, mb: 0, loose: false, runs: [], lines: [], repo: NO_REPO, ...b };
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
      if (text || extra.math) out.push({ id: next(), text, code: false, strong: style.strong, em: style.em, href: style.href, brand: style.brand, math: '', width: 0, height: 0, valign: 0, ...extra });
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
          const h = highlight(n.value, n.lang ?? '', n.meta ?? '', next);
          block({ kind: 'code', depth, lang: h.lang, text: h.code, title: h.terminal ? 'terminal' : h.diff ? 'diff' : '', lines: h.lines, mb: 20 });
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
            block({ kind: 'github', depth, href: url, mb: 24, repo: r ? { name: r.name, owner: r.owner.login, path: path ? path.split('/').pop()! : '', description: r.description ?? '', language: r.language ?? '', stars: fmtCount(r.stargazers_count), forks: fmtCount(r.forks_count), avatar: `${r.owner.avatar_url}&s=80`, url } : { ...NO_REPO, name: repo, url } });
            break;
          }
          if (name === 'YouTubeEmbed') { block({ kind: 'youtube', depth, text: attr(n, 'videoId'), height: 400 }); break; }
          if (name === 'Embed') {
            const url = attr(n, 'url'), id = url.match(/\/status\/(\d+)/)?.[1];
            if (!/^https:\/\/(twitter\.com|x\.com)\/(.*)\/status\//.test(url) || !id) break; // the reference renders nothing
            block({ kind: 'tweet', depth, href: url, text: id, mb: 80 });
            break;
          }
          if (name === 'BlockMath') { const m = mathFile(plain(n), true); block({ kind: 'math', depth, src: m.src, width: m.width, height: m.height }); break; }
          if (name === 'InlineMath') { const m = mathFile(plain(n), false); block({ kind: 'paragraph', depth, runs: [{ id: next(), text: '', code: false, strong: false, em: false, href: '', brand: false, math: m.src, width: m.width, height: m.height, valign: m.valign }], mb: 20 }); break; }
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
  const cover = asset('articles', slug, String(meta.featuredImage).replace(/^\.\//, ''));
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
// Files served at fixed root URLs, beside the build (tools/compose.ts copies .out/content/ to the root): the RSS feed
// (app/rss.xml/route.ts's format, byte for byte) and each article's share image at its live URL
// (/content-assets/articles/<slug>/images/…, the og:image every share of an article already points to).
const FEED = join(SITE, '.out/content');
rmSync(FEED, { recursive: true, force: true });
mkdirSync(FEED, { recursive: true });
const SITE_URL = 'https://reactiive.io';
const cdata = (v: string) => `<![CDATA[${v}]]>`;
const metas = articles.map((a) => ({ ...JSON.parse(readFileSync(join(SRC, 'articles', a.slug, 'index.json'), 'utf8')) }));
const items = metas.map((m) => {
  const url = `${SITE_URL}/articles/${m.slug}`;
  return `    <item>
      <title>${cdata(m.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <author>hello@reactiive.io (Enzo Manuel Mangano)</author>
      <description>${cdata(m.subtitle)}</description>
      <content:encoded>${cdata(`<h1>${m.title}</h1>\n      <p>${m.subtitle}</p>\n      <p>Read the full article at: <a href="${url}">${url}</a></p>`)}</content:encoded>
      <pubDate>${new Date(m.date).toUTCString()}</pubDate>
    </item>`;
}).join('\n\n');
writeFileSync(join(FEED, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Reactiive.io blog</title>
    <link>${SITE_URL}</link>
    <description>Latest articles from Reactiive.io</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>

${items}
  </channel>
</rss>`);
for (const m of metas) {
  const rel = String(m.featuredImage).replace(/^\.\//, '');
  mkdirSync(join(FEED, 'content-assets/articles', m.slug, dirname(rel)), { recursive: true });
  copyFileSync(join(SRC, 'articles', m.slug, rel), join(FEED, 'content-assets/articles', m.slug, rel));
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
console.log(`content: ${articles.length} articles (${SKIPPED.size} skipped: demo-tied), ${docs.length} docs, ${series.length} series; interactive in ${INTERACTIVE_ARTICLES.size} articles`);
