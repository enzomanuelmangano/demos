import type { Answer, Sources } from './app.contract.d.ts';

// The newsletter posts to the public subscribe endpoint (no secret: subs.reactiive.io's own server holds the
// Beehiiv key). Nothing else here reaches the network.
const SUBSCRIBE = 'https://subs.reactiive.io/api/subscribe';
export const grants = `net.fetch ${SUBSCRIBE}`;

const sources: Sources = {
  subscribe: async ([email]) => {
    const response = await fetch(SUBSCRIBE, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean };
    return { ok: response.ok && data.success === true };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

// The /demos hero's Canvas 2D surfaces (components/hero-canvas.ts).
export { heroSurfaces as surfaces, drawHero as draw } from './components/hero-canvas';
