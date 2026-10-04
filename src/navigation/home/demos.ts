import { useMemo } from 'react';

import { useAtomValue } from 'jotai';

import { getAllAnimations } from '../../animations/registry';
import { ShowUnstableAnimationsAtom } from '../states/filters';

export interface Demo {
  slug: string;
  name: string;
}

interface ListedDemo extends Demo {
  unstable: boolean;
}

// Flat {slug,name} list for the launcher grid. Newest-first (mirrors the old
// drawer order). slug is unique + stable and equals the /animations/[slug]
// route, so it doubles as the shared-bound id for the open-zoom.
const ALL_DEMOS: ListedDemo[] = getAllAnimations()
  .filter(animation => animation.metadata !== undefined)
  .map(animation => ({
    slug: animation.slug,
    name: animation.metadata.name,
    unstable: animation.metadata.alert === true,
  }))
  .reverse();

const STABLE_DEMOS = ALL_DEMOS.filter(demo => !demo.unstable);

/**
 * The demos the launcher lists: the work-in-progress ones only when the
 * "Show Unstable" setting is on. Stable references per setting, so the grid
 * and the search do not recompute on every render.
 */
export const useDemos = (): Demo[] => {
  const showUnstable = useAtomValue(ShowUnstableAnimationsAtom);
  return useMemo(
    () => (showUnstable ? ALL_DEMOS : STABLE_DEMOS),
    [showUnstable],
  );
};
