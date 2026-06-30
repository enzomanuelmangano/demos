import { StyleSheet, View } from 'react-native';

import { useCallback, useState } from 'react';

import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenAnimation } from 'react-native-screen-transitions';

import { activePage$ } from './active-page';
import { AppIcon } from './app-icon';
import { Background } from './background';
import { PageDots } from './page-dots';
import { useGridLayout } from './use-grid-layout';

import type { Demo } from './demos';
import type { GridLayout } from './use-grid-layout';
import type { LegendListRenderItemProps } from '@legendapp/list/react-native';

// One full page of the SpringBoard: a flex-wrapped grid of demo icons.
const Page = ({
  demos,
  layout,
  pageIndex,
  onPressDemo,
}: {
  demos: Demo[];
  layout: GridLayout;
  pageIndex: number;
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
        pageIndex={pageIndex}
        cellWidth={layout.cellWidth}
        cellHeight={layout.cellHeight}
        iconSize={layout.iconSize}
        onPress={onPressDemo}
      />
    ))}
  </View>
);

// iOS Home Screen launcher: a horizontally-paged grid of demo icons.
//
// Backed by a virtualized LegendList (not a plain ScrollView) so only the
// visible page — plus a small pre-render buffer — is mounted at a time. With
// 122 demos that's the difference between ~24 mounted icons and 122; it matters
// because every mounted icon is a react-native-screen-transitions boundary, and
// each active boundary runs a per-frame animated reaction during a transition.
// Keeping the mounted set tiny is what makes the open-zoom stay smooth.
//
// `pagingEnabled` + full-width items give iOS's native paging deceleration and
// edge rubber-band for free. We use the reanimated LegendList variant so the
// scroll offset is exposed as a shared value (drives the page dots off the JS
// thread). `recycleItems` is off so each page keeps a stable identity and its
// boundaries aren't reshuffled under the transition layer mid-animation.
const viewabilityConfig = { itemVisiblePercentThreshold: 60 } as const;

// iOS-home recede effect: while a demo is open the grid behind it sits slightly
// scaled-down and blurred; dragging the demo to dismiss un-scales + un-blurs it
// in lockstep with the gesture. Driven by the child Demo screen's transition
// progress (0 = home focused, 1 = demo fully open). Only the icon grid scales —
// the wallpaper stays put.
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
// Forwarded to LegendList's underlying ScrollView (not in its prop types).
const scrollTouchProps = { delaysContentTouches: false } as Record<
  string,
  unknown
>;
const HOME_MIN_SCALE = 0.93;
const HOME_MAX_BLUR = 50;

export const Springboard = () => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const navigation = useNavigation<any>();

  // Live progress of the demo covering this home screen. A stacked screen isn't
  // a React descendant, so we read THIS screen's own frame: when a demo is
  // pushed over home it becomes home's `next`, whose `progress` runs 0 -> 1 on
  // open and 1 -> 0 (gesture-driven) on dismiss.
  const homeAnimation = useScreenAnimation();
  const gridStyle = useAnimatedStyle(() => {
    const p = homeAnimation.value?.next?.progress ?? 0;
    return {
      transform: [
        {
          scale: interpolate(
            p,
            [0, 1],
            [1, HOME_MIN_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  // Animate the blur intensity itself (0 = sharp home, HOME_MAX_BLUR = fully
  // blurred behind an open demo) so the home truly defocuses/refocuses with the
  // gesture, rather than a pre-blurred layer fading in.
  const blurProps = useAnimatedProps(() => {
    const p = homeAnimation.value?.next?.progress ?? 0;
    return {
      intensity: interpolate(p, [0, 1], [0, HOME_MAX_BLUR], Extrapolation.CLAMP),
    };
  });
  // Only mount the fullscreen blur while a demo is actually transitioning. On
  // the idle grid a 0-intensity BlurView is still a fullscreen UIVisualEffectView
  // composited every frame — dead GPU cost that made horizontal scrolling stutter.
  // Gate its presence on the demo progress so plain grid scrolling pays nothing.
  const [blurActive, setBlurActive] = useState(false);
  useAnimatedReaction(
    () => (homeAnimation.value?.next?.progress ?? 0) > 0.001,
    (active, prev) => {
      if (active !== prev) runOnJS(setBlurActive)(active);
    },
  );

  // Warm the Demo screen's heavy react-native-screen-transitions provider/
  // wrapper tree at idle, with a dummy slug so NO real demo content mounts. The
  // ~240ms screen-mount cost (the open's real blocker) is otherwise paid on the
  // tap; preloading pays it invisibly so the tap just promotes this warm
  // instance and swaps the slug. Re-arm on every focus: the first open consumes
  // the preloaded route, so re-warming when we return to the grid keeps EVERY
  // open fast, not just the first.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        (navigation as any).preload?.('Demo', { slug: '__warm__' });
      }, 250);
      return () => clearTimeout(t);
    }, [navigation]),
  );

  const onPressDemo = useCallback(
    (slug: string) => {
      navigation.navigate('Demo', { slug });
    },
    [navigation],
  );

  // Publish the visible page into the observable so each icon can gate its own
  // boundary (see app-icon.tsx). No React state -> the grid never re-renders on
  // a page change; only the icons whose enabled flag flips do.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        activePage$.set(first.index);
      }
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: LegendListRenderItemProps<Demo[]>) => (
      <Page
        demos={item}
        layout={layout}
        pageIndex={index}
        onPressDemo={onPressDemo}
      />
    ),
    [layout, onPressDemo],
  );

  return (
    <View style={styles.root}>
      <Background />
      <Animated.View style={[styles.gridScale, gridStyle]}>
        <AnimatedLegendList
          data={layout.pages}
          renderItem={renderItem}
          keyExtractor={(_, index) => `page-${index}`}
          horizontal
          pagingEnabled
          recycleItems={false}
          // Pre-render one page in each direction so swiping reveals a ready
          // page instead of mounting ~24 icons on demand (which popped in late).
          // We previously set this to 0 to shrink the open commit, but the open
          // is now fast via preload + the boundary count barely affects it
          // (measured ~6ms), so the scroll-smoothness win is worth the extra
          // mounted page.
          drawDistance={layout.pageWidth}
          estimatedItemSize={layout.pageWidth}
          showsHorizontalScrollIndicator={false}
          // iOS ScrollViews hold touches ~150ms to detect a scroll before
          // delivering them to child Pressables. On a tap-to-open launcher that
          // is a dead delay before the icon's onPress (and the zoom) fires —
          // JS sits idle the whole time. Deliver taps immediately; paging still
          // works because a real drag cancels the child touch. (LegendList
          // forwards this to its underlying ScrollView; its types omit it.)
          {...scrollTouchProps}
          sharedValues={{ scrollOffset: scrollX }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          contentContainerStyle={{ paddingTop: insets.top }}
        />
      </Animated.View>

      {/* Blur layer over wallpaper + grid; intensity tracks the demo progress so
          the home recedes behind an open demo and sharpens back on dismiss. */}
      {blurActive ? (
        <AnimatedBlurView
          animatedProps={blurProps}
          tint="dark"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}

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
  gridScale: {
    flex: 1,
  },
  page: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  root: {
    // Dark base under the wallpaper image (shows only until it loads); matches
    // the dark loupe wallpaper's black edges.
    backgroundColor: '#000000',
    flex: 1,
  },
});
