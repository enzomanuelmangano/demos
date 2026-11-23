// The canvas article demos' Canvas 2D surfaces, by name and arity (app.ts merges them with the /demos hero's).
import type { Ctx2D, Frame } from './util';
import { drawGradient } from '../animated-gradient/draw';
import { drawLoader } from '../animated-loader-skia/draw';
import { drawSpiral } from '../animated-spiral/draw';
import { drawMetaball } from '../metaball/draw';

export const interactiveSurfaces: Record<string, number> = { gradient: 4, loader: 6, articleSpiral: 7, metaball: 4 };
export function drawInteractive(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  switch (surface) {
    case 'gradient': return drawGradient(ctx, frame, args as any);
    case 'loader': return drawLoader(ctx, frame, args as any);
    case 'articleSpiral': return drawSpiral(ctx, frame, args as any);
    case 'metaball': return drawMetaball(ctx, frame, args as any);
  }
  return false;
}
