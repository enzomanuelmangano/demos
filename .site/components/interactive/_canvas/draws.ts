// The canvas article demos' drawing code, loaded on the first draw of one of their surfaces (surfaces.ts).
import type { Ctx2D, Frame } from './util';
import { drawGradient } from '../animated-gradient/draw';
import { drawLoader } from '../animated-loader-skia/draw';
import { drawSpiral } from '../animated-spiral/draw';
import { drawMetaball } from '../metaball/draw';

export function drawSurface(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  switch (surface) {
    case 'gradient': return drawGradient(ctx, frame, args as any);
    case 'loader': return drawLoader(ctx, frame, args as any);
    case 'articleSpiral': return drawSpiral(ctx, frame, args as any);
    case 'metaball': return drawMetaball(ctx, frame, args as any);
  }
  return false;
}
