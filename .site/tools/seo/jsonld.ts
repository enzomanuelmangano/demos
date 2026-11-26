// JSON-LD identical to the live site's (src/app/page.tsx, src/app/articles/[post]/page.tsx): key order included.
import { HOME_DESCRIPTION, loadArticles, loadDemoPosts, PERSON, SITE_NAME, SITE_URL } from './site.ts';
import type { PageMetadata } from './metadata.ts';

export function jsonLd(m: PageMetadata): object | undefined {
  if (m.jsonLd?.kind === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: HOME_DESCRIPTION, inLanguage: 'en', publisher: { '@id': `${SITE_URL}/#person` } },
        { ...PERSON, '@id': `${SITE_URL}/#person` },
      ],
    };
  }
  if (m.jsonLd?.kind === 'article') {
    const slug = m.jsonLd.slug;
    const a = loadArticles().find((x) => x.slug === slug)!;
    return {
      '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.title, preview: a.subtitle, slug: a.slug,
      url: `${SITE_URL}/articles/${a.slug}`, status: 'Published', image: [`${SITE_URL}${a.image}`],
      datePublished: a.date, dateModified: a.date, author: [PERSON],
    };
  }
  if (m.jsonLd?.kind === 'demo') {
    // Live's demo post (src/app/demos/[post]/page.tsx).
    const slug = m.jsonLd.slug;
    const d = loadDemoPosts().find((x) => x.slug === slug)!;
    return {
      '@context': 'https://schema.org', '@type': 'NewsArticle', headline: d.title, slug: d.slug,
      url: `${SITE_URL}/demos/${d.slug}`, status: 'Published', image: [`${SITE_URL}/demos/og-image/${d.slug}`],
      datePublished: d.date, dateModified: d.date, author: [PERSON],
    };
  }
  return undefined;
}

/** As a script tag: `<` is escaped so a title cannot close it. */
export const jsonLdScript = (data: object) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
