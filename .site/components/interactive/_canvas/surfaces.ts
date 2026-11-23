// The canvas article demos' Canvas 2D surfaces, by name and arity (app.ts merges them with the /demos hero's). Their
// drawing code (draws.ts) is a chunk of its own, imported on the first draw of one of them: a page without the demos
// never loads it. Until it arrives a draw paints nothing and asks for the next frame.
import type { Ctx2D, Frame } from './util';

export const interactiveSurfaces: Record<string, number> = { gradient: 4, loader: 6, articleSpiral: 7, metaball: 4 };

let drawSurface: ((surface: string, args: any[], ctx: Ctx2D, frame: Frame) => boolean) | null = null;
let loading: Promise<unknown> | null = null;
export function drawInteractive(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  if (drawSurface) return drawSurface(surface, args, ctx, frame);
  loading ??= import('./draws').then((m) => { drawSurface = m.drawSurface; }, () => { loading = null; });
  return true;
}
