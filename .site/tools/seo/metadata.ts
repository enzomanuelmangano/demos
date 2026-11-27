// Per-route head tags, identical to the live site's: the reference's pageMetadata() (src/lib/metadata.ts) over its root
// layout metadata, as Next.js renders them (same tags, same order). One typed place: add a page kind here, nowhere else.
import { COURSE_DESCRIPTION, DEMOS_APP_DESCRIPTION, DEMOS_DESCRIPTION, DOC_TITLES, HOME_DESCRIPTION, loadArticles, OG, SITE_AUTHOR_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_TWITTER, SITE_URL, THEME_COLOR, ARTICLES_DESCRIPTION, RSS_URL, titleCase, loadDemoPosts, type OgImage } from './site.ts';

export type Tag = { tag: 'title'; text: string } | { tag: 'meta' | 'link'; attrs: Record<string, string> };

export type PageMetadata = {
  /** The route's path as served ('/', '/articles/x'); the 404 page is '/404'. */
  path: string;
  /** Title as given to the page, without the template. */
  title: string;
  description?: string;
  image?: Partial<OgImage>;
  keywords?: readonly string[];
  type?: 'website' | 'article';
  publishedTime?: string;
  /** A page with no metadata of its own shows the layout's tags (the /docs index and the 404 page). */
  layoutOnly?: boolean;
  noindex?: boolean;
  /** 'home' carries the WebSite + Person graph, 'article' a NewsArticle. */
  jsonLd?: { kind: 'home' } | { kind: 'article'; slug: string } | { kind: 'demo'; slug: string };
  /** Plain title (no ' | Reactiive'): the home page, and layoutOnly pages. */
  plainTitle?: boolean;
  /** A page the live site does not have yet (new on this site): the head parity check has nothing to compare it with. */
  newPage?: boolean;
};

const abs = (u: string) => (u.startsWith('http') ? u : `${SITE_URL}${u}`);
const meta = (kind: 'name' | 'property' | 'http-equiv', name: string, content: string, extra: Record<string, string> = {}): Tag => ({ tag: 'meta', attrs: { [kind]: name, content, ...extra } });

/** The tags of one page, in the order Next.js writes them. */
export function headTags(m: PageMetadata): Tag[] {
  const layout = m.layoutOnly === true;
  const title = m.plainTitle || layout ? m.title : `${m.title} | ${SITE_NAME}`;
  const description = m.description ?? SITE_DESCRIPTION;
  const url = layout ? SITE_URL : `${SITE_URL}${m.path === '/' ? '' : m.path}`;
  const image = { ...OG.home, ...(layout ? {} : m.image), ...(m.image?.alt === undefined && !layout ? { alt: description } : {}) };
  const imageUrl = abs(image.url!);
  const t: Tag[] = [];
  t.push({ tag: 'meta', attrs: { charset: 'utf-8' } });
  t.push(meta('name', 'viewport', 'width=device-width, initial-scale=1, viewport-fit=cover'));
  if (m.noindex) t.push(meta('name', 'robots', 'noindex'));
  t.push(meta('name', 'theme-color', THEME_COLOR, { media: '(prefers-color-scheme: light)' }));
  t.push(meta('name', 'theme-color', THEME_COLOR, { media: '(prefers-color-scheme: dark)' }));
  t.push(meta('name', 'theme-color', THEME_COLOR));
  t.push({ tag: 'title', text: title });
  t.push(meta('name', 'description', layout ? SITE_DESCRIPTION : description));
  t.push({ tag: 'link', attrs: { rel: 'author', href: SITE_URL } });
  t.push(meta('name', 'author', SITE_AUTHOR_NAME));
  t.push({ tag: 'link', attrs: { rel: 'manifest', href: '/manifest.json' } });
  if (m.keywords?.length) t.push(meta('name', 'keywords', m.keywords.join(',')));
  t.push(meta('name', 'creator', SITE_AUTHOR_NAME));
  t.push(meta('name', 'publisher', SITE_NAME));
  if (m.noindex) t.push(meta('name', 'robots', 'noindex, follow'));
  t.push(meta('name', 'apple-mobile-web-app-capable', 'yes'));
  t.push(meta('name', 'msapplication-TileColor', THEME_COLOR));
  t.push({ tag: 'link', attrs: { rel: 'canonical', href: url } });
  t.push({ tag: 'link', attrs: { rel: 'alternate', type: 'application/rss+xml', href: RSS_URL } });
  t.push(meta('name', 'mobile-web-app-capable', 'yes'));
  t.push(meta('name', 'apple-mobile-web-app-status-bar-style', 'default'));
  t.push(meta('property', 'og:title', layout ? title : m.plainTitle ? title : m.title));
  t.push(meta('property', 'og:description', layout ? SITE_DESCRIPTION : description));
  t.push(meta('property', 'og:url', url));
  t.push(meta('property', 'og:site_name', SITE_NAME));
  t.push(meta('property', 'og:locale', 'en_US'));
  t.push(meta('property', 'og:image', imageUrl));
  if (!layout) t.push(meta('property', 'og:image:secure_url', imageUrl));
  t.push(meta('property', 'og:image:width', String(image.width)));
  t.push(meta('property', 'og:image:height', String(image.height)));
  t.push(meta('property', 'og:image:alt', layout ? OG.home.alt : image.alt!));
  t.push(meta('property', 'og:type', m.type ?? 'website'));
  if (m.publishedTime) {
    t.push(meta('property', 'article:published_time', m.publishedTime));
    t.push(meta('property', 'article:author', SITE_AUTHOR_NAME));
    for (const k of m.keywords ?? []) t.push(meta('property', 'article:tag', k));
  }
  t.push(meta('name', 'twitter:card', layout ? 'summary' : 'summary_large_image'));
  t.push(meta('name', 'twitter:creator', SITE_TWITTER));
  t.push(meta('name', 'twitter:title', layout ? title : m.plainTitle ? title : m.title));
  t.push(meta('name', 'twitter:description', layout ? SITE_DESCRIPTION : description));
  t.push(meta('name', 'twitter:image', imageUrl));
  if (layout) {
    t.push(meta('name', 'twitter:image:alt', OG.home.alt));
    t.push(meta('name', 'twitter:image:width', String(OG.home.width)));
    t.push(meta('name', 'twitter:image:height', String(OG.home.height)));
  }
  t.push({ tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' } });
  t.push({ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/pwa/apple-touch-icon/apple-touch-icon-180.png', sizes: '180x180' } });
  t.push(meta('http-equiv', 'X-UA-Compatible', 'IE=edge'));
  return t;
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

/** The tags as HTML. */
export function renderTags(tags: Tag[]): string {
  return tags.map((t) => t.tag === 'title' ? `<title>${escText(t.text)}</title>` : `<${t.tag} ${Object.entries(t.attrs).map(([k, v]) => `${k}="${escAttr(v)}"`).join(' ')}>`).join('');
}

/** A share card passed without its alt, as the reference does for pages whose alt is their description. */
const card = ({ url, width, height }: OgImage): Partial<OgImage> => ({ url, width, height });

/** Every page kind the site serves, from the content (docs/inventory.md, SEO section). */
export function allPages(): PageMetadata[] {
  const articles = loadArticles();
  const series = [...new Set(articles.map((a) => a.series).filter((s): s is string => !!s))].sort();
  return [
    { path: '/', title: 'Home', plainTitle: true, description: HOME_DESCRIPTION, image: OG.home, jsonLd: { kind: 'home' } },
    { path: '/demos', title: 'Demos', description: DEMOS_DESCRIPTION, image: OG.demos },
    // The demo posts (docs/decisions.md D25): the live post's tags to the letter (the site's description, its
    // /demos/og-image/<slug> share image, which tools/compose.ts answers: live's own answers 404).
    ...loadDemoPosts().map((d): PageMetadata => ({
      path: `/demos/${d.slug}`, title: d.title, image: { url: `/demos/og-image/${d.slug}`, alt: d.title },
      keywords: d.tags, type: 'article', publishedTime: d.date, jsonLd: { kind: 'demo', slug: d.slug },
    })),
    { path: '/articles', title: 'Articles', description: ARTICLES_DESCRIPTION, image: OG.articles },
    ...articles.map((a): PageMetadata => ({
      path: `/articles/${a.slug}`, title: a.title, description: a.subtitle, image: { url: a.image, alt: a.subtitle },
      keywords: a.tags, type: 'article', publishedTime: a.date, jsonLd: { kind: 'article', slug: a.slug },
    })),
    ...series.map((s): PageMetadata => {
      const title = titleCase(s);
      return { path: `/series/${s}`, title, description: `Articles in the ${title} series on React Native animations.`, image: card(OG.articles) };
    }),
    { path: '/inspirations', title: 'Inspirations', description: 'The blogs, docs and creators whose work shaped Reactiive.io.', image: card(OG.home) },
    { path: '/demos-app', title: 'Demos (TestFlight)', description: DEMOS_APP_DESCRIPTION, image: card(OG.demos) },
    { path: '/apps', title: 'Apps', description: 'Patterns: solve chess puzzles and learn the tactical patterns behind them, a few minutes a day.', image: card(OG.home), newPage: true },
    { path: '/course', title: 'Course', description: COURSE_DESCRIPTION, image: card(OG.home) },
    { path: '/docs', title: SITE_NAME, layoutOnly: true },
    ...Object.entries(DOC_TITLES).map(([slug, title]): PageMetadata => ({ path: `/docs/${slug}`, title, image: card(OG.home) })),
    { path: '/404', title: `Page not found | ${SITE_NAME}`, noindex: true, layoutOnly: true },
  ];
}

/** The built file of a route (Exact's output layout: /x → x/index.html, the 404 page → 404.html). */
export const htmlFile = (path: string) => (path === '/' ? 'index.html' : path === '/404' ? '404.html' : `${path.slice(1)}/index.html`);
/** The live URL of a route (the 404 page is any path that does not exist). */
export const livePath = (path: string) => (path === '/404' ? '/this-page-does-not-exist' : path);
