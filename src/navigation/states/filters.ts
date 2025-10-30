import { atom } from 'jotai';

import { atomWithKVStorage } from './storage';

export const SearchFilterAtom = atom('');

export const ShowUnstableAnimationsAtom = atomWithKVStorage(
  'unstable_animations',
  true,
);
