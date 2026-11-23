import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import Animated from 'react-native-reanimated';

import { LayoutTransition } from './animations';
import { BackgroundSection } from './background-section';
import { useLayoutDimensions, useListItems } from './hooks';
import { ListItem } from './list-item';

import type { ListItem as ListItemType, OfflineToOnlineProps } from './types';

export const OnlineToOffline = ({
  offline,
  online,
  itemSize = 64,
  gap = 8,
  listPadding = 4,
  listColor = '#000000',
  sectionGap,
}: OfflineToOnlineProps) => {
  const layoutDimensions = useLayoutDimensions({
    online,
    offline,
    itemSize,
    gap,
    sectionGap,
  });

  const listItems = useListItems(online, offline);

  const calculateItemPosition = useCallback(
    (item: ListItemType, index: number): number => {
      const { overlap, offlineBackgroundStart } = layoutDimensions;

      if (item.isOffline) {
        const offlineIndex = index - online.length;
        return offlineBackgroundStart + offlineIndex * (itemSize - overlap);
      } else {
        return index * (itemSize - overlap);
      }
    },
    [layoutDimensions, itemSize, online.length],
  );

  return (
    <View style={[styles.container, { height: itemSize }]}>
      <Animated.View
        layout={LayoutTransition}
        style={[
          styles.listContainer,
          {
            width: layoutDimensions.listWidth,
            height: itemSize,
          },
        ]}>
        <BackgroundSection
          key={`online-background-section`}
          width={layoutDimensions.onlineBackgroundWidth}
          left={0}
          listPadding={listPadding}
          listColor={listColor}
        />
        <BackgroundSection
          key={`offline-background-section`}
          width={layoutDimensions.offlineBackgroundWidth}
          left={layoutDimensions.offlineBackgroundStart}
          listPadding={listPadding}
          listColor={listColor}
        />
        {listItems.map((item, index) => (
          <ListItem
            key={item.item}
            item={item.item}
            leftPosition={calculateItemPosition(item, index)}
            itemSize={itemSize}
            listColor={listColor}
            isOffline={item.isOffline}
            zIndex={listItems.length - index}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  listContainer: {
    position: 'relative',
  },
});
