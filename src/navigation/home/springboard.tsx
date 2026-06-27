import { StyleSheet, View } from 'react-native';

import { useCallback, useState } from 'react';

import { useNavigation } from '@react-navigation/native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from './app-icon';
import { PageDots } from './page-dots';
import { useGridLayout } from './use-grid-layout';

import type { Demo } from './demos';
import type { GridLayout } from './use-grid-layout';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// iOS Home Screen launcher: a horizontally-paged grid of demo icons. Uses a
// native pagingEnabled ScrollView so the paging deceleration + edge rubber-band
// match iOS exactly (no hand-rolled snap). All pages stay mounted (ScrollView
// isn't virtualized), but only the active page's icons register a shared-bound
// Trigger for the open-zoom (see AppIcon) — the visible page is the only one
// you can tap, and registering all 122 bounds blocked the JS thread on each tap.
const Page = ({
  demos,
  layout,
  active,
  onPressDemo,
}: {
  demos: Demo[];
  layout: GridLayout;
  active: boolean;
  onPressDemo: (slug: string) => void;
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
      <AppIcon
        key={demo.slug}
        demo={demo}
        cellWidth={layout.cellWidth}
        cellHeight={layout.cellHeight}
        iconSize={layout.iconSize}
        active={active}
        onPress={onPressDemo}
      />
    ))}
  </View>
);

export const Springboard = () => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const navigation = useNavigation<any>();

  // Which page's icons register a shared-bound Trigger (see AppIcon). Updated on
  // settle only — not per scroll frame — so swiping never re-renders the grid
  // mid-gesture. Rounding the offset predicts the paging snap target, so it's
  // correct even on a zero-velocity release (no momentum event).
  const [activeIndex, setActiveIndex] = useState(0);
  const syncActiveIndex = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / layout.pageWidth);
      setActiveIndex(prev => (prev === next ? prev : next));
    },
    [layout.pageWidth],
  );

  const onPressDemo = useCallback(
    (slug: string) => {
      navigation.navigate('Demo', { slug });
    },
    [navigation],
  );

  const onScroll = useAnimatedScrollHandler(event => {
    scrollX.set(event.contentOffset.x);
  });

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onScrollEndDrag={syncActiveIndex}
        onMomentumScrollEnd={syncActiveIndex}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top }}>
        {layout.pages.map((demos, i) => (
          <Page
            key={i}
            demos={demos}
            layout={layout}
            active={i === activeIndex}
            onPressDemo={onPressDemo}
          />
        ))}
      </Animated.ScrollView>

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
    backgroundColor: '#000',
    flex: 1,
  },
});
