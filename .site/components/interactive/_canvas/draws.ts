// The canvas article demos' drawing code, loaded on the first draw of one of their surfaces (surfaces.ts).
import type { Ctx2D, Frame } from './util';
import { drawGradient } from '../animated-gradient/draw';
import { drawLoader } from '../animated-loader-skia/draw';
import { drawSpiral } from '../animated-spiral/draw';
import { drawMetaball } from '../metaball/draw';

function paint(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  switch (surface) {
    case 'gradient': return drawGradient(ctx, frame, args as any);
    case 'loader': return drawLoader(ctx, frame, args as any);
    case 'articleSpiral': return drawSpiral(ctx, frame, args as any);
    case 'metaball': return drawMetaball(ctx, frame, args as any);
  }
  return false;
}

// Scroll smoothness (final sweep, 4x CPU): a demo's full paint costs 20-35 ms (the spiral's 1,500 dots and their
// halo), so a demo's first paint waits until the scroll has settled (250 ms without one), one demo per frame; until
// then the box shows its background, as it does before its canvas mounts. (A draw that paints nothing leaves the
// canvas empty, so every later draw paints.)
const painted = new Set<string>();
let firstPaintAt = -1;
// web/reveal.js keeps `__siteScrolling` true while the page has scrolled in the last 250 ms.
const scrolling = () => !!(globalThis as any).__siteScrolling;

export function drawSurface(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  // By canvas: the demo's key (every surface's first argument) and its mount time (a canvas mounted again starts over).
  const id = `${surface}:${args[0]}:${frame.mounted}`;
  if (!painted.has(id)) {
    if (scrolling() || frame.time === firstPaintAt) return true;
    firstPaintAt = frame.time;
    painted.add(id);
  }
  return paint(surface, args, ctx, frame);
}
