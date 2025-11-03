import { JSX } from 'react';

import { atom } from 'jotai';

import { atomWithKVStorage } from './storage';
import { createIcon } from '../../animations/icon-factory';
import {
  AnimationComponent,
  AnimationMetadataType,
  getAllAnimations,
} from '../../animations/registry';

export const SearchFilterAtom = atom('');

export type AnimationItem = {
  id: number;
  name: string;
  slug: string;
  route: string;
  alert?: boolean;
  icon: () => JSX.Element;
  component: AnimationComponent;
  metadata: AnimationMetadataType;
};

export const AnimationsAtom = atom<AnimationItem[]>(
  getAllAnimations()
    .filter(animation => animation.metadata !== undefined)
    .map((animation, index) => ({
      id: index,
      ...animation,
      route: animation.slug,
      name: animation.metadata.name,
      alert: animation.metadata.alert,
      icon: () => createIcon(animation.metadata),
    }))
    .reverse(),
);

export const FilteredAnimationsAtom = atom<AnimationItem[]>(get => {
  const allAnimations = get(AnimationsAtom);
  const searchFilter = get(SearchFilterAtom);
  const showUnstable = get(ShowUnstableAnimationsAtom);

  const filteredAnimations = allAnimations.filter(item => {
    // Filter out any undefined items as a safety check
    if (!item || !item.slug) {
      return false;
    }

    if (!showUnstable && item.alert) {
      return false;
    }

    const searchText = searchFilter.trim().toLowerCase();
    if (searchText && !item.name.toLowerCase().includes(searchText)) {
      return false;
    }

    return true;
  });

  return filteredAnimations;
});

export const ShowUnstableAnimationsAtom = atomWithKVStorage(
  'unstable_animations',
  false,
);

export const HideDrawerIconAtom = atomWithKVStorage('hide_drawer_icon', false);
