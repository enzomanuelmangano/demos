import { getAllAnimations } from '../../animations/registry';

export interface Demo {
  slug: string;
  name: string;
}

// Flat {slug,name} list for the launcher grid. Newest-first (mirrors the old
// drawer order). slug is unique + stable and equals the /animations/[slug]
// route, so it doubles as the shared-bound id for the open-zoom.
export const DEMOS: Demo[] = getAllAnimations()
  .filter(animation => animation.metadata !== undefined)
  .map(animation => ({ slug: animation.slug, name: animation.metadata.name }))
  .reverse();
