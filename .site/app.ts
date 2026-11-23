import type { Answer, Draw, Result, Sources } from './app.contract.d.ts';
import * as content from './content-gen/index.ts';

// The newsletter posts to the public subscribe endpoint (no secret: subs.reactiive.io's own server holds the
// Beehiiv key). Nothing else here reaches the network.
const SUBSCRIBE = 'https://subs.reactiive.io/api/subscribe';
// The accounts' API (components/account/account.ts): the reference's /api/*, same origin as the site.
import { API, accountSources } from './components/account/account.ts';
export const grants = `net.fetch ${SUBSCRIBE}\nnet.fetch ${API}`;

// The content (tools/gen-content.ts): one module per page, imported only by the page that shows it.
const empty = { slug: '', title: '', description: '', image: '', date: '', tags: [], blocks: [] };
const load = async (table: Record<string, () => Promise<{ default: unknown }>>, slug: string) => (table[slug] ? ((await table[slug]()).default as Result<'loadArticle'>) : empty);

const sources: Sources = {
  ...accountSources,
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

// The Canvas 2D surfaces: the /demos hero's (components/hero-canvas.ts) and the canvas article demos'
// (components/interactive/_canvas/surfaces.ts).
import { heroSurfaces, drawHero } from './components/hero-canvas';
import { interactiveSurfaces, drawInteractive } from './components/interactive/_canvas/surfaces';
export const surfaces: Record<string, number> = { ...heroSurfaces, ...interactiveSurfaces };
export const draw: Draw = (surface, args, ctx, frame) => (surface in interactiveSurfaces ? drawInteractive : drawHero)(surface, args, ctx, frame);
