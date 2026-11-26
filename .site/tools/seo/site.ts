// The site's identity and the content the SEO files are built from: one place (docs/architecture.md §7). Mirrors the
// reference's lib/metadata.ts, constants/og.ts and the root layout's metadata, so every value here has a line there.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALIASES, LEGACY_DEMO_POSTS, NOT_IN_APP } from '../demos-web/legacy-posts.ts';

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
  // Not live's "Exclusive weekly React Native animations source code." (D23).
  demos: { url: '/og/demos.png', width: 1280, height: 720, alt: 'Demos: 100+ animations built with Exact, Rust and WebGPU' },
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
// /demos's own copy (owner, 2026-11-24, D23): differs from live's "Explore the beauty of React Native animations ..." on
// purpose; tools/parity/head-diff.ts expects it.
export const DEMOS_DESCRIPTION = '100+ animations built with Exact, Rust and WebGPU, running live in the browser.';
// /demos-app's: the TestFlight app is the Exact one too (owner, 2026-11-24, D23); live said "120+ React Native animation demos".
export const DEMOS_APP_DESCRIPTION = 'Get 100+ animations built with Exact, Rust and WebGPU on your iPhone through the TestFlight beta.';
export const COURSE_DESCRIPTION = 'Reanimate.dev — the complete guide to React Native animations, from the basics to advanced techniques.';

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
export function loadArticles(): Article[] {
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
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export const titleCase = (slug: string) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export type DemoPost = { slug: string; app: string; title: string; date: string; tags: string[] };

/** Every demo post (tools/demos-web/legacy-posts.ts), with the reference's frontmatter (.content/demos/<slug>/index.js:
 *  title, date, tags) and the app's slug of its demo, '' when the app has none. */
export function loadDemoPosts(): DemoPost[] {
  return LEGACY_DEMO_POSTS.map((slug) => {
    const app = NOT_IN_APP.includes(slug) ? '' : ALIASES[slug] ?? slug;
    const dir = join(SITE_DIR, '.content/demos', slug);
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', readFileSync(join(dir, 'index.js'), 'utf8'))(mod);
    const j = mod.exports as { title?: string; date?: string; tags?: string[]; slug?: string };
    if (j.slug !== slug || typeof j.title !== 'string' || typeof j.date !== 'string') throw new Error(`seo: .content/demos/${slug}/index.js: slug, title or date`);
    return { slug, app, title: j.title, date: j.date, tags: j.tags ?? [] };
  });
}
