import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIconNative } from './app-icon-native';
import { Background } from '../background';
import { PageDots } from '../page-dots';
import { useGridLayout } from '../use-grid-layout';

import type { Demo } from '../demos';
import type { GridLayout } from '../use-grid-layout';
import type { LegendListRenderItemProps } from '@legendapp/list/react-native';

// SPIKE: springboard variant for the iOS 18 native zoom transition
// (Link.AppleZoom). Same responsive paged grid as the main branch, but with
// EVERYTHING the JS transition needed stripped out: no transition boundaries,
// no page-gated Trigger activation, no open-zoom overlay, no packed per-frame
// flag reaction, no blur recede, no pull-to-search, no context menus. What
// remains is just a paged list of Link-wrapped icons — UIKit does the rest.
//
// drawDistance: with zero mounted transition boundaries there is no
// navigate-commit tax to protect, so pre-render two pages per side for extra
// scroll smoothness (main branch had to cap this at one).
const Page = ({
  demos,
  layout,
}: {
  demos: Demo[];
  layout: GridLayout;
}) => (
  <View
    style={[
      styles.page,
      {
        width: layout.pageWidth,
        paddingHorizontal: layout.sideMargin,
        paddingTop: layout.topPad,
        rowGap: layout.rowGap,
      },
    ]}>
    {demos.map(demo => (
      <AppIconNative
        key={demo.slug}
        demo={demo}
        cellWidth={layout.cellWidth}
        cellHeight={layout.cellHeight}
        iconSize={layout.iconSize}
      />
    ))}
  </View>
);

const scrollTouchProps = { delaysContentTouches: false } as Record<
  string,
  unknown
>;

export const SpringboardNative = () => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Demo[]>) => (
      <Page demos={item} layout={layout} />
    ),
    [layout],
  );

  return (
    <View style={styles.root}>
      <Background />
      <AnimatedLegendList
        data={layout.pages}
        renderItem={renderItem}
        keyExtractor={(_, index) => `page-${index}`}
        horizontal
        pagingEnabled
        recycleItems={false}
        drawDistance={layout.pageWidth * 2}
        estimatedItemSize={layout.pageWidth}
        showsHorizontalScrollIndicator={false}
        {...scrollTouchProps}
        sharedValues={{ scrollOffset: scrollX }}
        contentContainerStyle={{ paddingTop: insets.top }}
      />
      <View style={[styles.dots, { bottom: insets.bottom + 14 }]}>
        <PageDots
          count={layout.pageCount}
          scrollX={scrollX}
          pageWidth={layout.pageWidth}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dots: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  page: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  root: {
    backgroundColor: '#000000',
    flex: 1,
  },
});
