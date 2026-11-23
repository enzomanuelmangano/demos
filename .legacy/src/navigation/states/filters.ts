import { atomWithKVStorage } from './storage';

/** Whether the launcher lists the work-in-progress demos (`alert` ones). */
export const ShowUnstableAnimationsAtom = atomWithKVStorage(
  'unstable_animations',
  false,
);
