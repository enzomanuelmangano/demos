import { StyleSheet, View } from 'react-native';

import { useCallback, useMemo, useRef, useState } from 'react';

import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenAnimation } from 'react-native-screen-transitions';
import { scheduleOnRN } from 'react-native-worklets';

import { activePage$ } from './active-page';
import { AppIcon } from './app-icon';
import { Background } from './background';
import { PageDots } from './page-dots';
import { SEARCH_TRIGGER } from './search-constants';
import { SearchReveal } from './search-reveal';
import { useGridLayout } from './use-grid-layout';

import type { Demo } from './demos';
import type { GridLayout } from './use-grid-layout';
import type { LegendListRenderItemProps } from '@legendapp/list/react-native';
import type { TextInput } from 'react-native';

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
// Strong defocus behind an open demo / the search reveal — matches the heavy
// blur iOS puts behind the App Library search.
const HOME_MAX_BLUR = 90;
// Asymptote for the damped rubber-band that maps raw finger travel to the grid's
// downward pull. Pull tracks the finger ~1:1 early, then eases, so a long drag
// never runs away.
const PULL_RUBBER = 260;

export const Springboard = () => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const navigation = useNavigation<any>();

  // Raycast-style pull-to-search, in place (no navigation). A downward drag
  // rubber-bands the grid (`pull`) and ramps a blur over it; releasing past the
  // trigger commits to the search view (`searchMode`): the grid eases back to
  // rest but stays blurred + non-interactive while a search header + filtered
  // results composite over it. `searchActive` (UI thread) pins the blur at full
  // once committed, so the blur is unified with this same layer's demo-recede.
  // The Pan only claims vertical movement (activeOffsetY) and yields horizontal
  // drags to the pager (failOffsetX), so page swiping is untouched.
  // `pull`   — grid's downward rubber-band offset (settles to 0 after release).
  // `reveal` — the search surface's reveal 0→1. ONE monotonic value drives the
  // surface opacity / blur / list so there's no flicker: during the drag it
  // tracks the pull; on commit it eases to 1 from wherever it is (never the
  // crossfade-dip you get from max()-ing a falling pull against a rising flag).
  const pull = useSharedValue(0);
  const reveal = useSharedValue(0);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const enterSearch = useCallback(() => {
    setSearchMode(true);
    // Ease the reveal to fully-committed from its current (pulled) level —
    // monotonic, so the surface never dims mid-commit. The grid settles back up.
    reveal.set(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
    pull.set(
      withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) }),
    );
  }, [pull, reveal]);

  // Elegant close: dismiss the keyboard (it slides down) and fade the whole
  // surface out via `reveal` → 0, but keep `searchMode` TRUE for the duration so
  // the committed visuals (focused field, Cancel, results) stay put and fade as
  // one. Only once the fade finishes do we flip back to the grid + clear query.
  const finishExit = useCallback(() => {
    setSearchMode(false);
    setQuery('');
  }, []);
  const exitSearch = useCallback(() => {
    inputRef.current?.blur();
    reveal.set(
      withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, fin => {
        'worklet';
        if (fin) scheduleOnRN(finishExit);
      }),
    );
  }, [reveal, finishExit]);

  const onSelectSearch = useCallback(
    (slug: string) => {
      // Open the demo from the tapped row's shared bound. Keep the search open
      // (row mounted) so the zoom has a live source to grow from AND a live
      // target to shrink back into on dismiss — the demo dismisses back into the
      // search list, exactly mirroring the icon↔grid zoom. Just drop the keyboard
      // so it isn't up behind the demo. Cancel from the returned search → grid.
      inputRef.current?.blur();
      navigation.navigate('Demo', { slug, fromSearch: true });
    },
    [navigation],
  );

  const pullGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!searchMode)
        .activeOffsetY(14)
        .failOffsetX([-14, 14])
        .onUpdate(e => {
          'worklet';
          const d = e.translationY > 0 ? e.translationY : 0;
          // Damped rubber-band for the grid; reveal tracks it, full at the trigger.
          const p = PULL_RUBBER * (1 - Math.exp(-d / PULL_RUBBER));
          pull.set(p);
          reveal.set(Math.min(p / SEARCH_TRIGGER, 1));
        })
        .onEnd(e => {
          'worklet';
          // Commit to search when pulled past the trigger (or flicked hard).
          if (e.translationY > SEARCH_TRIGGER || e.velocityY > 900) {
            scheduleOnRN(enterSearch);
          } else {
            pull.set(withTiming(0, { duration: 260 }));
            reveal.set(withTiming(0, { duration: 260 }));
          }
        }),
    [pull, reveal, enterSearch, searchMode],
  );
  const rPull = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.get() }],
  }));

  // Live progress of the demo covering this home screen. A stacked screen isn't
  // a React descendant, so we read THIS screen's own frame: when a demo is
  // pushed over home it becomes home's `next`, whose `progress` runs 0 -> 1 on
  // open and 1 -> 0 (gesture-driven) on dismiss.
  //
  // The recede behind an open demo is BLUR ONLY — deliberately no scale on the
  // grid. A transform on the grid can't drive the zoom recede: the shared-bound
  // zoom measures each icon's frame with measure(), which reports LAYOUT position
  // and ignores transforms. At open the grid is unscaled so the source is
  // captured correctly, but during the close the grid would be scaled — so the
  // demo shrank into the icon's UNSCALED slot while the icon was displayed at its
  // SCALED position, landing visibly offset (the "wrong z / ghost icon" on back).
  // To recede WITH scale it'd have to go through the library's own backgroundScale
  // (which the bound math compensates for) — but that scales the wallpaper too,
  // which we don't want. Blur alone carries the depth and keeps the zoom exact.
  const homeAnimation = useScreenAnimation();
  // One blur layer, two drivers: the demo-recede (home defocuses behind an open
  // demo) and the pull-to-search reveal (home defocuses as you pull / search).
  // Take the max so whichever is active wins, and they never fight.
  const blurProps = useAnimatedProps(() => {
    const demoP = homeAnimation.get()?.next?.progress ?? 0;
    const demoBlur = interpolate(
      demoP,
      [0, 1],
      [0, HOME_MAX_BLUR],
      Extrapolation.CLAMP,
    );
    const searchBlur = reveal.get() * HOME_MAX_BLUR;
    return { intensity: Math.max(demoBlur, searchBlur) };
  });
  // Only mount the fullscreen blur while something is actually defocusing the
  // home. On the idle grid a 0-intensity BlurView is still a fullscreen
  // UIVisualEffectView composited every frame — dead GPU cost that made
  // horizontal scrolling stutter. Gate its presence on demo progress OR an
  // active pull/search so plain grid scrolling pays nothing.
  const [blurActive, setBlurActive] = useState(false);
  useAnimatedReaction(
    () =>
      (homeAnimation.get()?.next?.progress ?? 0) > 0.001 || reveal.get() > 0.01,
    (active, prev) => {
      if (active !== prev) scheduleOnRN(setBlurActive, active);
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
  // boundary (see app-icon.tsx). Update on momentum END, not continuously while
  // scrolling: flipping `enabled` on a page's worth of boundaries mid-swipe
  // triggered a ~240ms diffProperties re-render storm that stuttered the scroll.
  // Settling first means the gating re-render lands while the grid is at rest.
  const onMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / layout.pageWidth);
      activePage$.set(page);
    },
    [layout.pageWidth],
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
      <GestureDetector gesture={pullGesture}>
        <Animated.View
          pointerEvents={searchMode ? 'none' : 'auto'}
          style={[styles.gridScale, rPull]}>
          <AnimatedLegendList
            data={layout.pages}
            renderItem={renderItem}
            keyExtractor={(_, index) => `page-${index}`}
            horizontal
            pagingEnabled
            recycleItems={false}
            // Pre-render two pages in each direction. Each icon is a deep tree
            // (transition boundary + context menu + pressable + image), so
            // mounting a page on demand mid-swipe costs ~180ms and stutters the
            // scroll. A 2-page buffer means pages mount during the idle between
            // swipes, not during them. The open is fast via preload and barely
            // depends on boundary count (measured ~6ms), so the extra mounted
            // pages are worth the scroll smoothness.
            drawDistance={layout.pageWidth * 2}
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
            onMomentumScrollEnd={onMomentumScrollEnd}
            contentContainerStyle={{ paddingTop: insets.top }}
          />
        </Animated.View>
      </GestureDetector>

      {/* Page dots sit BELOW the blur layer so they defocus together with the
          grid during a pull/demo-recede (rendered before the blur in z-order).
          Hidden once search commits. */}
      {searchMode ? null : (
        <View style={[styles.dots, { bottom: insets.bottom + 14 }]}>
          <PageDots
            count={layout.pageCount}
            scrollX={scrollX}
            pageWidth={layout.pageWidth}
          />
        </View>
      )}

      {/* Blur layer over wallpaper + grid + dots. Intensity tracks whichever
          defocus is active — the demo-recede or the pull-to-search — so the home
          blurs behind an open demo and as the search reveals, sharpening back on
          dismiss / cancel. */}
      {blurActive ? (
        <AnimatedBlurView
          animatedProps={blurProps}
          tint="dark"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Pull-to-search reveal: the search field + results, revealed with the
          pull and composited over the blurred grid. */}
      <SearchReveal
        reveal={reveal}
        searchMode={searchMode}
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
