import { useMemo } from 'react';

import {
  calculateGapWidth,
  calculateOverlap,
  calculateSectionWidth,
} from './utils';

import type { LayoutDimensions, ListItem, OfflineToOnlineProps } from './types';

export const useLayoutDimensions = ({
  online,
  offline,
  itemSize,
  gap,
  sectionGap,
}: Pick<
  OfflineToOnlineProps,
  'online' | 'offline' | 'itemSize' | 'gap' | 'sectionGap'
>): LayoutDimensions => {
  return useMemo(() => {
    const overlap = calculateOverlap(gap);
    const onlineWidth = calculateSectionWidth(online.length, itemSize, overlap);
    const offlineWidth = calculateSectionWidth(
      offline.length,
      itemSize,
      overlap,
    );
    const actualGapWidth = calculateGapWidth(itemSize, overlap, sectionGap);

    return {
      listWidth: onlineWidth + actualGapWidth + offlineWidth,
      onlineBackgroundWidth: onlineWidth,
      offlineBackgroundStart: onlineWidth + actualGapWidth,
      offlineBackgroundWidth: offlineWidth,
      overlap,
    };
  }, [online.length, offline.length, itemSize, gap, sectionGap]);
};

export const useListItems = (
  online: string[],
  offline: string[],
): ListItem[] => {
  return useMemo(
    () => [
      ...online.map(item => ({ item, isOffline: false })),
      ...offline.map(item => ({ item, isOffline: true })),
    ],
    [online, offline],
  );
};
