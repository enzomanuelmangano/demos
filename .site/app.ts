import type { Answer, Result, Sources } from './app.contract.d.ts';
import * as content from './content-gen/index.ts';

// The newsletter posts to the public subscribe endpoint (no secret: subs.reactiive.io's own server holds the
// Beehiiv key). Nothing else here reaches the network.
const SUBSCRIBE = 'https://subs.reactiive.io/api/subscribe';
export const grants = `net.fetch ${SUBSCRIBE}`;

// The content (tools/gen-content.ts): one module per page, imported only by the page that shows it.
const empty = { slug: '', title: '', description: '', image: '', date: '', tags: [], blocks: [] };
const load = async (table: Record<string, () => Promise<{ default: unknown }>>, slug: string) => (table[slug] ? ((await table[slug]()).default as Result<'loadArticle'>) : empty);

const sources: Sources = {
  articleSlugs: async () => content.articleSlugs,
  docSlugs: async () => content.docSlugs,
  seriesSlugs: async () => content.seriesSlugs,
  loadArticle: async ([slug]) => load(content.articles, slug),
  loadDoc: async ([slug]) => load(content.docs, slug),
  // The cards of /articles ("*") or of one series; none elsewhere.
  loadCards: async ([series]) => {
    if (series === '') return [];
    const all = (await content.cards()).default as Result<'loadCards'>;
    return series === '*' ? all : all.filter((c) => c.series === series);
  },
  subscribe: async ([email]) => {
    const response = await fetch(SUBSCRIBE, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean };
    return { ok: response.ok && data.success === true };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

// The /demos hero's Canvas 2D surfaces (components/hero-canvas.ts).
export { heroSurfaces as surfaces, drawHero as draw } from './components/hero-canvas';
