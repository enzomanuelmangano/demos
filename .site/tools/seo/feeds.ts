// sitemap.xml, robots.txt, rss.xml and manifest.json: the live site's files (src/app/sitemap.ts, robots.ts,
// rss.xml/route.ts, public/manifest.json), generated from the content index at build.
import { loadArticles, loadDemoPosts, RSS_URL, SITE_URL } from './site.ts';
import { allPages } from './metadata.ts';

// A "]]>" inside the text would end the section early: split it across two sections.
const cdata = (v: string) => `<![CDATA[${v.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
const entry = (loc: string, extra: string) => `<url>\n<loc>${loc}</loc>\n${extra}</url>`;
const freq = (f: string, p: number) => `<changefreq>${f}</changefreq>\n<priority>${p}</priority>\n`;

/** The reference listed /demos only; the demo posts are listed too (decisions.md D25: nothing else links them all),
 *  after the articles, with their dates; then the pages new on this site (metadata.ts newPage: /apps). /_dev/* is
 *  never listed. */
export function sitemapXml(): string {
  const urls = [
    entry(SITE_URL, freq('weekly', 1)),
    entry(`${SITE_URL}/demos`, freq('daily', 1)),
    entry(`${SITE_URL}/articles`, freq('weekly', 0.8)),
    ...loadArticles().map((a) => entry(`${SITE_URL}/articles/${a.slug}`, `<lastmod>${a.date}</lastmod>\n${freq('weekly', 0.5)}`)),
    ...loadDemoPosts().map((d) => entry(`${SITE_URL}/demos/${d.slug}`, `<lastmod>${d.date}</lastmod>\n${freq('monthly', 0.4)}`)),
    ...allPages().filter((p) => p.newPage && !p.noindex).map((p) => entry(`${SITE_URL}${p.path}`, freq('monthly', 0.8))),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** `Host:` is Google's retired directive; the live file has it, so this one does. */
export const robotsTxt = () => `User-Agent: *\nAllow: /\n\nHost: ${SITE_URL}\nSitemap: ${SITE_URL}/sitemap.xml\n`;

const AUTHOR = 'hello@reactiive.io (Enzo Manuel Mangano)';
export function rssXml(): string {
  const items = loadArticles().map((a) => {
    const url = `${SITE_URL}/articles/${a.slug}`;
    return `    <item>
      <title>${cdata(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <author>${AUTHOR}</author>
      <description>${cdata(a.subtitle)}</description>
      <content:encoded>${cdata(`<h1>${a.title}</h1>\n      <p>${a.subtitle}</p>\n      <p>Read the full article at: <a href="${url}">${url}</a></p>`)}</content:encoded>
      <pubDate>${new Date(a.date).toUTCString()}</pubDate>
    </item>`;
  }).join('\n\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Reactiive.io blog</title>
    <link>${SITE_URL}</link>
    <description>Latest articles from Reactiive.io</description>
    <language>en</language>
    <atom:link href="${RSS_URL}" rel="self" type="application/rss+xml"/>

${items}
  </channel>
</rss>`;
}

export const manifestJson = () => JSON.stringify({
  name: 'Reactiive',
  description: 'Dive into the world of React Native - Discover the resources that helped me start my journey to building React Native animations',
  short_name: 'Reactiive',
  lang: 'en',
  orientation: 'portrait',
  start_url: '.',
  icons: [144, 192, 512].map((s) => ({ src: `/pwa/chrome-icon/chrome-icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png' })),
  theme_color: '#000000',
  background_color: '#000000',
  display: 'standalone',
}, null, 2) + '\n';
