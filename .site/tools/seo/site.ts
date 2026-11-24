// The site's identity and the content the SEO files are built from: one place (docs/architecture.md §7). Mirrors the
// reference's lib/metadata.ts, constants/og.ts and the root layout's metadata, so every value here has a line there.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_POSTS } from '../demos-web/legacy-posts.ts';

export const SITE_URL = (process.env.SITE_ORIGIN ?? 'https://reactiive.io').replace(/\/$/, '');
export const SITE_NAME = 'Reactiive';
export const SITE_TWITTER = '@reactiive_';
export const SITE_AUTHOR_NAME = 'Enzo Manuel Mangano';
export const SITE_DESCRIPTION = 'Discover the beauty of React Native and how to build stunning animations with Reanimated and Skia';
export const HOME_DESCRIPTION = 'Dive into the world of React Native - Discover the resources that helped me start my journey to building React Native animations';
export const THEME_COLOR = '#0c0c0e';
export const RSS_URL = `${SITE_URL}/rss.xml`;

export type OgImage = { url: string; width: number; height: number; alt: string };
/** The three static share cards (public/og/*.png, 1280x720). */
export const OG = {
  home: { url: '/og/main.png', width: 1280, height: 720, alt: 'React Native animations by Reactiive' },
  demos: { url: '/og/demos.png', width: 1280, height: 720, alt: 'Exclusive weekly React Native animations source code.' },
  articles: { url: '/og/articles.png', width: 1280, height: 720, alt: 'Interactive articles about React Native animations by Reactiive' },
} satisfies Record<string, OgImage>;

export const PERSON = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: SITE_AUTHOR_NAME,
  url: SITE_URL,
  image: `${SITE_URL}/pfp.png`,
  sameAs: [
    'https://x.com/reactiive_',
    'https://twitter.com/reactiive_',
    'https://www.linkedin.com/in/enzomanuelmangano',
    'https://github.com/enzomanuelmangano',
    'https://www.youtube.com/@reactiive',
  ],
};

export const DOC_TITLES: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', license: 'License' };
export const ARTICLES_DESCRIPTION = 'Interactive articles about React Native animations by Reactiive';
export const DEMOS_DESCRIPTION = 'Explore the beauty of React Native animations with Reanimated, Skia and Gesture Handler';
export const COURSE_DESCRIPTION = 'Reanimate.dev — the complete guide to React Native animations, from the basics to advanced techniques.';

/**
 * Articles that present the Demos app are not ported (docs/progress-content.md; tools/gen-content.ts SKIPPED), nor
 * the two series made only of them: sitemap and feed leave them out, and their live URLs answer a permanent redirect
 * (tools/compose.ts; docs/decisions.md D13): the Patreon ones to /articles, the Demos ones to /demos.
 */
export const NOT_PORTED_REDIRECTS: Record<string, string> = {
  '/articles/building-demos': '/demos',
  '/articles/open-sourcing-demos': '/demos',
  '/articles/leaving-patreon': '/articles',
  '/articles/patreon-migration': '/articles',
  '/series/engineering': '/articles',
  '/series/thoughts': '/articles',
};
export const NOT_PORTED = new Set(Object.keys(NOT_PORTED_REDIRECTS).filter((p) => p.startsWith('/articles/')).map((p) => p.slice('/articles/'.length)));

const SITE_DIR = join(import.meta.dir, '../..');

export type Article = {
  slug: string; title: string; subtitle: string; date: string; tags: string[]; series?: string;
  /** Where the header image is served (and advertised): the reference's URL, kept by an edge rewrite in tools/compose.ts. */
  image: string;
};

/**
 * The articles' frontmatter, read from .content/articles/<slug>/index.json (the content pipeline's own source:
 * tools/gen-content.ts reads the same files). Fields used: title, subtitle, date, tags, series, featuredImage.
 * Newest first (the reference's articles.json order); ties keep the file-name order, checked by head-diff against the live sitemap.
 */
export function loadArticles(includeNotPorted = false): Article[] {
  const dir = join(SITE_DIR, '.content/articles');
  if (!existsSync(dir)) return [];
  const all = readdirSync(dir).sort().flatMap((slug) => {
    const f = join(dir, slug, 'index.json');
    if (!existsSync(f)) return [];
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (j.slug !== slug) throw new Error(`seo: ${f}: slug ${j.slug} is not the folder's`);
    for (const k of ['title', 'subtitle', 'date']) if (typeof j[k] !== 'string') throw new Error(`seo: ${f}: no ${k}`);
    const image = String(j.featuredImage ?? './images/header.webp').replace(/^\.\//, '');
    return [{ slug, title: j.title, subtitle: j.subtitle, date: j.date, tags: j.tags ?? [], series: j.series ?? undefined, image: `/content-assets/articles/${slug}/${image}` } as Article];
  });
  return all.filter((a) => includeNotPorted || !NOT_PORTED.has(a.slug)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export const titleCase = (slug: string) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export type DemoPost = { slug: string; app: string; title: string; description: string; date: string; tags: string[] };

/** A post's description: its first paragraph of prose (the reference's posts had none of their own, so the live head
 *  showed the site's), as whole sentences up to 160 characters, else cut at a word with an ellipsis. */
function firstParagraph(mdx: string): string {
  const para = mdx.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).map((p) => p.trim())
    .find((p) => /^[A-Za-z0-9"'“(]/.test(p) && !p.startsWith('import ') && !p.startsWith('export ')) ?? '';
  const plain = para.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return SITE_DESCRIPTION;
  let out = '';
  for (const s of plain.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [plain]) { if ((out + s).trim().length > 160) break; out += s; }
  out = out.trim();
  if (out) return out;
  const cut = plain.slice(0, 158);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

/** The demo posts kept as pages (tools/demos-web/legacy-posts.ts DEMO_POSTS), with the reference's frontmatter
 *  (.content/demos/<slug>/index.js: title, date, tags) and a description from the post's first paragraph. */
export function loadDemoPosts(): DemoPost[] {
  return DEMO_POSTS.map(({ slug, app }) => {
    const dir = join(SITE_DIR, '.content/demos', slug);
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', readFileSync(join(dir, 'index.js'), 'utf8'))(mod);
    const j = mod.exports as { title?: string; date?: string; tags?: string[]; slug?: string };
    if (j.slug !== slug || typeof j.title !== 'string' || typeof j.date !== 'string') throw new Error(`seo: .content/demos/${slug}/index.js: slug, title or date`);
    return { slug, app, title: j.title, description: firstParagraph(readFileSync(join(dir, 'index.mdx'), 'utf8')), date: j.date, tags: j.tags ?? [] };
  });
}
