import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

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

// iOS Home Screen launcher: a horizontally-paged grid of demo icons. Uses a
// native pagingEnabled ScrollView so the paging deceleration + edge rubber-band
// match iOS exactly (no hand-rolled snap). All pages stay mounted (ScrollView
// isn't virtualized), so every icon's shared-bound stays measurable for the
// open-zoom.
const Page = ({
  demos,
  layout,
  onPressDemo,
}: {
  demos: Demo[];
  layout: GridLayout;
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
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top }}>
        {layout.pages.map((demos, i) => (
          <Page
            key={i}
            demos={demos}
            layout={layout}
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
