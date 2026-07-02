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

import { activePage$, elevatedSlug$ } from './active-page';
import { AppIcon } from './app-icon';
import { Background } from './background';
import { fadeOutOpenZoom, openZoomOpacity, startOpenZoom } from './open-zoom';
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
  onPressDemo: (slug: string, cellIndex: number) => void;
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
    {demos.map((demo, cellIndex) => (
      <AppIcon
        key={demo.slug}
        demo={demo}
        pageIndex={pageIndex}
        cellIndex={cellIndex}
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

  // Live frame of THIS (home) screen — `next` is the demo stacked over it.
  // Declared up here because the gestures below gate on it.
  const homeAnimation = useScreenAnimation();

  // True while a demo screen covers (or is opening/closing over) the home.
  // Gates the home's own gestures: the grid stays mounted behind an open demo
  // (inactiveBehavior 'keep'), and a downward drag over the demo could leak
  // into the pull-to-search pan — committing search BEHIND the open demo, so
  // returning + Cancel stranded a half-revealed search bar over the grid.
  const [demoCovering, setDemoCovering] = useState(false);
  const onDemoCoveringChange = useCallback((covering: boolean) => {
    setDemoCovering(covering);
    // Demo fully closed (progress back to 0): drop the open icon's cell
    // elevation (see elevatedSlug$). Cleared here rather than on a timer so it
    // holds through the whole close, including a slow gesture-driven one.
    if (!covering) elevatedSlug$.set(null);
  }, []);
  useAnimatedReaction(
    () => (homeAnimation.get()?.next?.progress ?? 0) > 0.001,
    (covering, prev) => {
      if (covering !== prev) scheduleOnRN(onDemoCoveringChange, covering);
    },
  );

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
      // SearchReveal focuses the field on a 120ms timer after search commits; a
      // fast row tap can land BEFORE that timer fires, so the field re-focuses
      // behind the opening demo and the keyboard gets stuck over the grid after
      // Cancel. A second blur past that window closes the race.
      setTimeout(() => inputRef.current?.blur(), 250);
      navigation.navigate('Demo', { slug, fromSearch: true });
    },
    [navigation],
  );

  // Whether the current pull committed to search. Written in onEnd, read in
  // onFinalize — see below.
  const pullCommitted = useSharedValue(false);
  const pullGesture = useMemo(
    () =>
      Gesture.Pan()
        // Off while search is committed AND while a demo covers the home —
        // drags over an open demo must never reach the pull-to-search.
        .enabled(!searchMode && !demoCovering)
        // Deliberate pull only: more vertical travel to activate, and any early
        // horizontal travel fails the pan — a diagonal page-swipe used to cross
        // the Y threshold first and flash the search bar mid-scroll.
        .activeOffsetY(22)
        .failOffsetX([-10, 10])
        .onBegin(() => {
          'worklet';
          pullCommitted.set(false);
        })
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
            pullCommitted.set(true);
            scheduleOnRN(enterSearch);
          }
        })
        // Settle-back lives in onFinalize, NOT onEnd: onEnd only fires when the
        // gesture ends successfully. When the pan is CANCELLED mid-pull (pager
        // scroll or a tap stealing the touch) onEnd is skipped — the reveal
        // froze at whatever level the finger left it, leaving the search bar
        // stuck over the interactive grid. onFinalize fires on end, cancel and
        // fail alike, so every non-committed pull always settles back to rest.
        .onFinalize(() => {
          'worklet';
          if (!pullCommitted.get()) {
            pull.set(withTiming(0, { duration: 260 }));
            reveal.set(withTiming(0, { duration: 260 }));
          }
        }),
    [pull, reveal, enterSearch, searchMode, demoCovering, pullCommitted],
  );
  const rPull = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.get() }],
  }));

  // UI-THREAD tap→zoom: recognize the icon tap with a gesture-handler Tap and
  // hit-test the icon square with pure grid math in the worklet, so the open
  // overlay (open-zoom.tsx) starts expanding on the SAME FRAME the finger
  // lifts — zero JS involvement. The icon's Pressable still fires onPress on
  // the JS thread a beat later and performs the actual navigation (and the
  // library's source-bound measurement); by then the zoom is already visibly
  // running. Runs simultaneously with the pager scroll and the pull gesture —
  // any real drag exceeds maxDelta and the tap fails, so scrolling is untouched.
  const pageLengths = useMemo(
    () => layout.pages.map(page => page.length),
    [layout.pages],
  );
  const tapZoomGesture = useMemo(() => {
    const { cols, cellWidth, cellHeight, iconSize, rowGap, sideMargin, topPad, pageWidth } =
      layout;
    const insetTop = insets.top;
    return Gesture.Tap()
      .enabled(!searchMode && !demoCovering)
      .maxDuration(280)
      .maxDeltaX(12)
      .maxDeltaY(12)
      .onEnd(e => {
        'worklet';
        // Which page the viewport shows (exact at rest; pagingEnabled snaps).
        const page = Math.round(scrollX.get() / pageWidth);
        if (page < 0 || page >= pageLengths.length) return;
        // Content shift if tapped mid-settle (0 at rest).
        const offset = page * pageWidth - scrollX.get();
        const xInPage = e.x - offset - sideMargin;
        const col = Math.floor(xInPage / cellWidth);
        if (col < 0 || col >= cols) return;
        const yInGrid = e.y - insetTop - topPad;
        const row = Math.floor(yInGrid / (cellHeight + rowGap));
        if (row < 0 || yInGrid < 0) return;
        // Inside the icon SQUARE only (not the label / gaps), matching the
        // Pressable target so overlay and navigation always agree.
        const iconLeft = col * cellWidth + (cellWidth - iconSize) / 2;
        const xInCell = xInPage - iconLeft;
        const yInRow = yInGrid - row * (cellHeight + rowGap);
        if (xInCell < 0 || xInCell > iconSize || yInRow > iconSize) return;
        // Empty trailing cells on the last page have no demo — no zoom.
        if (row * cols + col >= pageLengths[page]) return;
        startOpenZoom({
          x: sideMargin + iconLeft + offset,
          y: insetTop + topPad + row * (cellHeight + rowGap),
          width: iconSize,
          height: iconSize,
          radius: iconSize * 0.2237,
        });
      });
  }, [layout, insets.top, pageLengths, scrollX, searchMode, demoCovering]);

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
  // (`homeAnimation` itself is declared near the top — the gestures gate on it.)
  //
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

  // Mount the search result rows only while the search surface is in play (a
  // pull is in progress or search is committed). At rest the rows are unmounted
  // entirely: each one is a transition boundary, and every MOUNTED boundary
  // re-renders on each push/pop — 122 idle rows added ~200ms of dead JS to the
  // navigate commit of a grid-icon tap (the tap→zoom delay). Flipping on the
  // first pulled pixel means the ~14 initial rows mount within a frame or two
  // of the gesture start, well before the surface is meaningfully visible.
  const [searchListActive, setSearchListActive] = useState(false);
  useAnimatedReaction(
    () => reveal.get() > 0.001,
    (active, prev) => {
      if (active !== prev) scheduleOnRN(setSearchListActive, active);
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

  // JS side of the tap. The overlay zoom was normally ALREADY started by the
  // UI-thread tap gesture above; this only navigates. The guarded fallback
  // covers paths that bypass the gesture (e.g. accessibility activation) so
  // the demo never opens without its zoom card.
  const onPressDemo = useCallback(
    (slug: string, cellIndex: number) => {
      // Keep this cell painting above its siblings for the whole open/close
      // round trip (cleared when the demo's progress returns to 0).
      elevatedSlug$.set(slug);
      if (openZoomOpacity.get() < 0.5) {
        const col = cellIndex % layout.cols;
        const row = Math.floor(cellIndex / layout.cols);
        startOpenZoom({
          x:
            layout.sideMargin +
            col * layout.cellWidth +
            (layout.cellWidth - layout.iconSize) / 2,
          y:
            insets.top + layout.topPad + row * (layout.cellHeight + layout.rowGap),
          width: layout.iconSize,
          height: layout.iconSize,
          radius: layout.iconSize * 0.2237,
        });
      }
      navigation.navigate('Demo', { slug });
    },
    [navigation, layout, insets.top],
  );

  // Hand the overlay off to the real screen: the moment the demo's own zoom
  // settles underneath (progress 1), fade the overlay card away. Guarded on
  // full opacity so a close (progress falling back) never re-triggers it.
  useAnimatedReaction(
    () => homeAnimation.get()?.next?.progress ?? 0,
    progress => {
      if (progress >= 0.999 && openZoomOpacity.get() === 1) {
        fadeOutOpenZoom();
      }
    },
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
      <GestureDetector gesture={Gesture.Simultaneous(pullGesture, tapZoomGesture)}>
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
            // Pre-render one page in each direction. Each icon is a deep tree
            // (transition boundary + context menu + pressable + image), so
            // mounting a page on demand mid-swipe costs ~180ms and stutters the
            // scroll — the buffer keeps page mounts in the idle between swipes.
            // Capped at ONE page (not two) because every MOUNTED icon is a
            // transition boundary and the library re-renders all of them inside
            // the navigate commit of an icon tap; profiling showed that commit
            // is the tap→zoom delay, and its cost scales with mounted boundary
            // count (~1ms per boundary in dev). 3 mounted pages ≈ 72 boundaries
            // is the balance point between scroll smoothness and open latency.
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
