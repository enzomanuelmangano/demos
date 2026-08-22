import { StyleSheet, View } from 'react-native';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppIconNative } from './app-icon-native';
import { SearchRevealNative } from './search-reveal-native';
import { PageDots } from '../page-dots';
import { SEARCH_TRIGGER } from '../search-constants';
import { useGridLayout } from '../use-grid-layout';

import type { Demo } from '../demos';
import type { GridLayout } from '../use-grid-layout';
import type { LegendListRenderItemProps } from '@legendapp/list/react-native';
import type { TextInput } from 'react-native';

// NATIVE-SPIKE springboard: the main branch's launcher with the transition
// machinery swapped for the iOS 18 native zoom (Link.Trigger withAppleZoom in
// each cell).
// Feature parity with springboard.tsx — pull-to-search, blur reveal, context
// menus, page dots — minus everything that existed only to serve the JS
// transition: no boundaries or page gating, no open-zoom overlay, no packed
// per-frame flag reaction, and no demo-recede blur (UIKit blurs + dims the
// home natively behind an open demo).
const Page = ({ demos, layout }: { demos: Demo[]; layout: GridLayout }) => (
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

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
// Forwarded to LegendList's underlying ScrollView (not in its prop types):
// deliver taps immediately instead of iOS's ~150ms scroll-detection hold.
const scrollTouchProps = { delaysContentTouches: false } as Record<
  string,
  unknown
>;
// Strong defocus behind the search reveal — matches the heavy blur iOS puts
// behind the App Library search. (The blur behind an OPEN DEMO is UIKit's own,
// from the native zoom — this layer only serves the pull/search.)
const HOME_MAX_BLUR = 90;
// Asymptote for the damped rubber-band mapping raw finger travel to the grid's
// downward pull.
const PULL_RUBBER = 260;

export const SpringboardNative = () => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  // True while no demo screen is stacked over the home. Gates the pull gesture
  // so a drag over an open demo can't leak into pull-to-search. Read via
  // expo-router's own pathname (NOT @react-navigation/native's useIsFocused —
  // that resolves a different react-navigation copy than the router's vendored
  // one and throws "couldn't find a navigation object"). JS state, so it lags
  // the tap by a beat — the native zoom starts instantly regardless; worst
  // case a pull started in that beat is settled back by onFinalize.
  const isFocused = usePathname() === '/';

  // Raycast-style pull-to-search, in place (no navigation) — ported from the
  // main branch. `pull` is the grid's rubber-band offset; `reveal` is the
  // search surface's monotonic 0→1 (tracks the pull, eases to 1 on commit).
  const pull = useSharedValue(0);
  const reveal = useSharedValue(0);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [pullInProgress, setPullInProgress] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // JS flags derived from `reveal` (one reaction): whether the search surface
  // is in play (mounts the result rows) — the fullscreen BlurView mounts on the
  // same flag, since a 0-intensity BlurView still costs GPU every frame and
  // would tax idle grid scrolling.
  const [searchListActive, setSearchListActive] = useState(false);
  useAnimatedReaction(
    () => reveal.get() > 0.001,
    (active, prev) => {
      if (active !== prev) scheduleOnRN(setSearchListActive, active);
    },
  );

  const enterSearch = useCallback(() => {
    setSearchMode(true);
    // Ease the reveal to fully-committed from its current (pulled) level —
    // monotonic, so the surface never dims mid-commit. The grid settles back.
    reveal.set(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
    pull.set(
      withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) }),
    );
  }, [pull, reveal]);

  // Elegant close: keep `searchMode` TRUE while the surface fades as one, then
  // flip back to the grid + clear the query (same two-phase exit as main).
  const finishExit = useCallback(() => {
    setSearchMode(false);
    setQuery('');
    reveal.set(withTiming(0, { duration: 120 }));
    pull.set(withTiming(0, { duration: 120 }));
  }, [reveal, pull]);
  const exitSearch = useCallback(() => {
    inputRef.current?.blur();
    reveal.set(
      withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, fin => {
        'worklet';
        if (fin) scheduleOnRN(finishExit);
      }),
    );
  }, [reveal, finishExit]);

  // Self-healing invariant, ported from main: (surface visible) must equal
  // (searchMode) whenever no pull owns `reveal`. Interrupted gestures /
  // replaced timings can strand them out of sync; reconcile after the
  // transition timings instead of chasing each race.
  useEffect(() => {
    if (pullInProgress || searchListActive === searchMode) return undefined;
    const t = setTimeout(() => {
      if (searchMode) {
        exitSearch();
      } else {
        reveal.set(withTiming(0, { duration: 200 }));
        pull.set(withTiming(0, { duration: 200 }));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [pullInProgress, searchListActive, searchMode, exitSearch, reveal, pull]);

  // A search row was tapped: the Link is already navigating with the native
  // zoom from that row. Keep the search open (mounted rows = a live dismiss
  // target) — just drop the keyboard so it isn't up behind the demo. The
  // second blur closes the race with SearchReveal's 120ms focus timer.
  const onSelectSearch = useCallback((_slug: string) => {
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.blur(), 250);
  }, []);

  // Whether the current pull committed to search (written onEnd, read in
  // onFinalize — onEnd is skipped when the pan is cancelled by the pager).
  const pullCommitted = useSharedValue(false);
  const pullGesture = useMemo(
    () =>
      Gesture.Pan()
        // Off while search is committed AND while a demo covers the home.
        .enabled(!searchMode && isFocused)
        // Deliberate pull only: vertical travel to activate, early horizontal
        // travel fails the pan (diagonal page-swipes stay with the pager).
        .activeOffsetY(22)
        .failOffsetX([-10, 10])
        .onBegin(() => {
          'worklet';
          pullCommitted.set(false);
          scheduleOnRN(setPullInProgress, true);
        })
        .onUpdate(e => {
          'worklet';
          const d = e.translationY > 0 ? e.translationY : 0;
          // Damped rubber-band for the grid; reveal tracks it, full at trigger.
          const p = PULL_RUBBER * (1 - Math.exp(-d / PULL_RUBBER));
          pull.set(p);
          reveal.set(Math.min(p / SEARCH_TRIGGER, 1));
        })
        .onEnd(e => {
          'worklet';
          if (e.translationY > SEARCH_TRIGGER || e.velocityY > 900) {
            pullCommitted.set(true);
            scheduleOnRN(enterSearch);
          }
        })
        // onFinalize fires on end, cancel and fail alike — every non-committed
        // pull settles back to rest even when the pager steals the touch.
        .onFinalize(() => {
          'worklet';
          scheduleOnRN(setPullInProgress, false);
          if (!pullCommitted.get()) {
            pull.set(withTiming(0, { duration: 260 }));
            reveal.set(withTiming(0, { duration: 260 }));
          }
        }),
    [pull, reveal, enterSearch, searchMode, isFocused, pullCommitted],
  );
  const rPull = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.get() }],
  }));

  // Pull/search blur over wallpaper + grid + dots. Only this surface drives it
  // — the demo-recede blur is UIKit's, applied natively during the zoom.
  const blurProps = useAnimatedProps(() => ({
    intensity: reveal.get() * HOME_MAX_BLUR,
  }));

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Demo[]>) => (
      <Page demos={item} layout={layout} />
    ),
    [layout],
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pullGesture}>
        <Animated.View
          pointerEvents={searchMode ? 'none' : 'auto'}
          style={[styles.grid, rPull]}>
          <AnimatedLegendList
            data={layout.pages}
            renderItem={renderItem}
            keyExtractor={(_, index) => `page-${index}`}
            horizontal
            pagingEnabled
            recycleItems={false}
            // No transition boundaries exist, so pre-rendering costs nothing
            // at open time — two pages per side for extra scroll smoothness
            // (the main branch had to cap this at one).
            drawDistance={layout.pageWidth * 2}
            estimatedItemSize={layout.pageWidth}
            showsHorizontalScrollIndicator={false}
            {...scrollTouchProps}
            sharedValues={{ scrollOffset: scrollX }}
            contentContainerStyle={{ paddingTop: insets.top }}
          />
        </Animated.View>
      </GestureDetector>

      {/* Page dots sit below the blur layer so they defocus with the grid
          during a pull. Hidden once search commits. */}
      {searchMode ? null : (
        <View style={[styles.dots, { bottom: insets.bottom + 14 }]}>
          <PageDots
            count={layout.pageCount}
            scrollX={scrollX}
            pageWidth={layout.pageWidth}
          />
        </View>
      )}

      {/* Pull/search blur — mounted only while the surface is in play so the
          idle grid pays nothing. */}
      {searchListActive || searchMode ? (
        <AnimatedBlurView
          animatedProps={blurProps}
          tint="dark"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Pull-to-search reveal: search field + results, revealed with the pull
          and composited over the blurred grid. Rows are native zoom sources. */}
      <SearchRevealNative
        reveal={reveal}
        searchMode={searchMode}
        listActive={searchListActive || searchMode}
        sideMargin={layout.sideMargin}
        iconSize={layout.iconSize}
        query={query}
        onChangeQuery={setQuery}
        onCancel={exitSearch}
        onSelect={onSelectSearch}
        inputRef={inputRef}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dots: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  grid: {
    flex: 1,
  },
  page: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // TRANSPARENT on purpose: the wallpaper renders behind the whole navigation
  // stack (app/_layout.tsx), so the native zoom's pushback scales only this
  // screen's content — icons, dots, search — over a still wallpaper.
  root: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});
