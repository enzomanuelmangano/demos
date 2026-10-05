import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BlurView } from 'expo-blur';
import * as SplashScreen from 'expo-splash-screen';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardController } from 'react-native-keyboard-controller';
import { Presets } from 'react-native-pulsar';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppIcon } from './app-icon';
import { Background } from './background';
import {
  HOME_INTRO,
  holdHomeIntro,
  settleHomeIntro,
  homeIntro,
  introDelay,
  introTransform,
  useHomeIntro,
} from './home-intro';
import {
  CLOSE_SCALE,
  homeTap,
  launchGroup,
  launchPose,
  launchProgress,
} from './launch-transition';
import { PageDots } from './page-dots';
import { SEARCH_REVEAL, SEARCH_TRIGGER } from './search-constants';
import { SearchReveal } from './search-reveal';
import { iconRectForCell, useGridLayout } from './use-grid-layout';

import type { Demo } from './demos';
import type { LaunchSource } from './launch-transition';
import type { GridLayout } from './use-grid-layout';
import type { TextInput } from 'react-native';

/** Where the screen's centre is, for the cells that make the entrance. */
interface IntroFrame {
  insetTop: number;
  width: number;
  height: number;
}

// A cell of the first page during the home's entrance (see home-intro.ts): it
// falls onto its place about the screen's centre, starting later the further
// it is from it. Only the first page is in view, so only it gets one.
const IntroCell = ({
  index,
  layout,
  frame,
  children,
}: {
  index: number;
  layout: GridLayout;
  frame: IntroFrame;
  children: React.ReactNode;
}) => {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  // The cell's own centre, which its scale is about…
  const cellX =
    layout.sideMargin + col * layout.cellWidth + layout.cellWidth / 2;
  const cellY =
    frame.insetTop +
    layout.topPad +
    row * (layout.cellHeight + layout.rowGap) +
    layout.cellHeight / 2;
  // …and the icon's, which its delay is measured from (as it was measured).
  const icon = iconRectForCell(layout, frame.insetTop, index);
  const delay = introDelay(
    Math.hypot(
      icon.x + icon.width / 2 - frame.width / 2,
      icon.y + icon.height / 2 - frame.height / 2,
    ),
    frame.height,
  );
  const dx = cellX - frame.width / 2;
  const dy = cellY - frame.height / 2;
  const rIntro = useAnimatedStyle(() => ({
    transform: introTransform(homeIntro.get(), delay, dx, dy),
  }));
  return <Animated.View style={rIntro}>{children}</Animated.View>;
};

// One full page of the SpringBoard: a flex-wrapped grid of demo icons.
const PageComponent = ({
  demos,
  mounted,
  layout,
  onPressDemo,
  introFrame,
  introDone,
}: {
  demos: Demo[];
  // How many of this page's icons are mounted; the rest hold their cell.
  mounted: number;
  layout: GridLayout;
  onPressDemo: (slug: string) => void;
  // Set on the first page only: its cells make the entrance.
  introFrame?: IntroFrame;
  introDone: boolean;
}) => (
  <View
    // The pager re-clips its whole subtree every few points of a swipe: with
    // every page mounted, that walked thousands of views per frame. A page
    // that clips its own cells detaches them while it is off screen, and the
    // walk stops there.
    // The first page does not clip until its entrance is over: its cells start
    // off screen, and a cell clipped away there is not put back when it falls
    // into view (the clipping runs on layout and scroll, not on a transform).
    removeClippedSubviews={!introFrame || introDone}
    style={[
      styles.page,
      {
        width: layout.pageWidth,
        paddingHorizontal: layout.sideMargin,
        paddingTop: layout.topPad,
        rowGap: layout.rowGap,
      },
    ]}>
    {demos.map((demo, index) =>
      index < mounted ? (
        introFrame ? (
          <IntroCell
            key={demo.slug}
            index={index}
            layout={layout}
            frame={introFrame}>
            <AppIcon
              demo={demo}
              cellWidth={layout.cellWidth}
              cellHeight={layout.cellHeight}
              iconSize={layout.iconSize}
              onPress={onPressDemo}
            />
          </IntroCell>
        ) : (
          <AppIcon
            key={demo.slug}
            demo={demo}
            cellWidth={layout.cellWidth}
            cellHeight={layout.cellHeight}
            iconSize={layout.iconSize}
            onPress={onPressDemo}
          />
        )
      ) : (
        <View
          key={demo.slug}
          style={{ width: layout.cellWidth, height: layout.cellHeight }}
        />
      ),
    )}
  </View>
);
const Page = memo(PageComponent);

// iOS Home Screen launcher: a horizontally-paged grid of demo icons.
//
// A plain paging ScrollView, every page mounted once and kept. It was a
// virtualized list holding one page either side of the visible one: swiping
// mounted the next page mid-flight and unmounted the far one, so each swipe
// rebuilt ~24 icons (a context menu, a shared element, an image decode each)
// on the main thread while the page moved, and coming back rebuilt them
// again. Now the first page mounts with the home, the others one by one in
// the idle after it (see `mountedIcons`), and a swipe mounts nothing.
//
// `pagingEnabled` + full-width pages give iOS's native paging deceleration and
// edge rubber-band for free. The offset is mirrored into a shared value on the
// UI thread, which drives the page dots.
// iOS-home recede effect: while a demo is open the grid behind it is blurred,
// clearing with the close in lockstep. Driven by the launch clock (0 = home
// focused, 1 = demo fully open).
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
// Strong defocus behind an open demo / the search reveal — matches the heavy
// blur iOS puts behind the App Library search.
const HOME_MAX_BLUR = 90;
// Longest the keyboard preload waits for an idle slot after the entrance.
const KEYBOARD_PRELOAD_TIMEOUT = 1500;
// Longest the home's entrance may take before it is put at rest regardless.
const INTRO_BACKSTOP_MS = 2000;
// Upper bound on the wait for an idle slot to mount the next page.
const PAGE_MOUNT_TIMEOUT = 500;
// Longest a swipe can hold page mounts back (see `pagerMoving`).
const PAGER_MOVING_BACKSTOP = 1200;
// The search's second blur pass, over the first (see where it is rendered).
const SEARCH_EXTRA_BLUR = 100;

/**
 * How the pull's blur comes in: it still LEADS the search surface, but
 * gently. A smoothstep that starts soft and is whole at `blurFull`, not an
 * ease-out whole by halfway: that one defocused the grid on the first
 * pixels of a pull, fast and hard. The second pass only joins over the
 * last stretch, `blurExtra` (see where it is rendered).
 */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  'worklet';
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
// Squared on top of the smoothstep: a visual-effect blur reads as most of
// its depth at a small fraction of its intensity, so a linear ramp looked
// fast and heavy from the first pixels of a pull.
const searchBlurLead = (revealLevel: number) => {
  'worklet';
  const t = smoothstep(0, SEARCH_REVEAL.blurFull, revealLevel);
  return t * t;
};
const searchBlurExtra = (revealLevel: number) => {
  'worklet';
  return smoothstep(
    SEARCH_REVEAL.blurExtra[0],
    SEARCH_REVEAL.blurExtra[1],
    revealLevel,
  );
};
// Asymptote for the damped rubber-band that maps raw finger travel to the grid's
// downward pull. Pull tracks the finger ~1:1 early, then eases, so a long drag
// never runs away.
const PULL_RUBBER = 260;
// Backing off below this share of the trigger disarms the pull (hysteresis,
// so a finger resting on the trigger does not tick on and off).
const PULL_DISARM = 0.85;

// Bit flags for the single home-state reaction below (one per-frame worklet
// instead of four): which JS states flip.
const FLAG_DEMO_COVERING = 1; // demo open/opening/closing over the home
const FLAG_SEARCH_LIST = 4; // search surface in play -> mount result rows
const FLAG_PULL_ACTIVE = 8; // a pull gesture currently owns `reveal`

interface Props {
  // Opens a demo out of its icon (grid) or result row (search). See
  // app/index.tsx, which owns the choreography.
  onOpen: (source: LaunchSource, slug: string) => void;
}

export const Springboard = ({ onOpen }: Props) => {
  const layout = useGridLayout();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // The entrance (see home-intro.ts): as the home first shows, each icon of
  // the first page falls onto its place about the centre of the screen, the
  // further ones later (see IntroCell). Transforms only, on the synchronous
  // path: nothing commits while it plays. Until it lands the grid takes no
  // touches: the launch measures an icon through its transforms, and a scale
  // still in flight is not in the tree it measures yet.
  const reduceMotion = useReducedMotion();
  const [introDone, setIntroDone] = useState(reduceMotion);
  const introStarted = useRef(false);
  const playIntro = useHomeIntro(useCallback(() => setIntroDone(true), []));
  useLayoutEffect(() => {
    if (!reduceMotion) holdHomeIntro();
  }, [reduceMotion]);
  const onGridLayout = useCallback(() => {
    if (introStarted.current) return;
    introStarted.current = true;
    if (reduceMotion) {
      SplashScreen.hideAsync();
      return;
    }
    // One frame after layout: the frame the grid is first drawn in.
    requestAnimationFrame(() => {
      playIntro();
      // However the entrance goes, the home is at rest and takes touches
      // within two seconds of it starting: a frame callback that never runs
      // must not strand it. Armed here, not at mount: a slow first layout
      // must not cut a fall short.
      backstop.current = setTimeout(() => {
        settleHomeIntro();
        setIntroDone(true);
      }, INTRO_BACKSTOP_MS);
    });
  }, [reduceMotion, playIntro]);
  const backstop = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (backstop.current) clearTimeout(backstop.current);
    },
    [],
  );
  const introFrame = useMemo(
    () => ({ insetTop: insets.top, width: screenWidth, height: screenHeight }),
    [insets.top, screenWidth, screenHeight],
  );
  // The dots sit low on the screen, where the dock is on an iPhone: they fall
  // with it, from below and at once, not after the icons nearest them.
  const dotsFromMiddle = screenHeight / 2 - (insets.bottom + 14 + 3.5);
  const dotsDelay = HOME_INTRO.dockDelay;
  const rDotsIntro = useAnimatedStyle(() => ({
    transform: introTransform(homeIntro.get(), dotsDelay, 0, dotsFromMiddle),
  }));

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

  // All the JS-side flags derived from the home's live state, packed into one
  // per-frame reaction (they read the same shared values every frame):
  // `demoCovering` — a demo is open/opening/closing over the home. Gates the
  //   home's own gestures: the grid stays mounted under the transparent demo
  //   route, and a downward drag must never commit search BEHIND a demo.
  // `searchListActive` — the search surface is in play; mounts the result
  //   rows from the first pulled pixel (each row is a shared element).
  const [demoCovering, setDemoCovering] = useState(false);
  const [searchListActive, setSearchListActive] = useState(false);
  const [pullInProgress, setPullInProgress] = useState(false);
  const pullActive = useSharedValue(false);
  const onHomeFlagsChange = useCallback((flags: number) => {
    setDemoCovering((flags & FLAG_DEMO_COVERING) !== 0);
    setSearchListActive((flags & FLAG_SEARCH_LIST) !== 0);
    setPullInProgress((flags & FLAG_PULL_ACTIVE) !== 0);
  }, []);
  useAnimatedReaction(
    () => {
      // A launch covers the home from the tap (the group is named before
      // anything is measured) until the close has landed back on the icon.
      // Read here, not through a helper worklet: a shared value read inside
      // another function is not a dependency of this reaction, and the flags
      // then stayed 'covering' after the close.
      const covering = launchGroup.get() !== null;
      const revealLevel = reveal.get();
      let flags = 0;
      if (covering) flags |= FLAG_DEMO_COVERING;
      if (revealLevel > 0.001) flags |= FLAG_SEARCH_LIST;
      if (pullActive.get()) flags |= FLAG_PULL_ACTIVE;
      return flags;
    },
    (flags, prev) => {
      if (flags !== prev) {
        scheduleOnRN(onHomeFlagsChange, flags);
      }
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
    // Hard-reset the surface drivers: exiting means the surface IS gone, so
    // never leave a stray non-zero behind whatever path got us here.
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

  // Self-healing invariant: (search surface visible) must equal (searchMode)
  // whenever no pull gesture owns `reveal`. The surface is driven by shared
  // values written from several async paths — the pan worklet, the commit /
  // exit timings and their completion callbacks — and an interruption in any
  // of them (gesture cancelled by the pager, a timing replaced mid-flight, a
  // dropped finished=false callback) strands the two out of sync: either a
  // ghost search bar floats over the interactive grid, or a committed search
  // is left with no surface. Rather than chasing each race, reconcile: if the
  // mismatch persists past the transition timings (~350ms), snap to the state
  // `searchMode` claims.
  useEffect(() => {
    if (pullInProgress || searchListActive === searchMode) return undefined;
    const t = setTimeout(() => {
      if (searchMode) {
        // Committed search with no surface: run the missed exit for real so
        // focus/keyboard/query are torn down through the normal path.
        exitSearch();
      } else {
        reveal.set(withTiming(0, { duration: 200 }));
        pull.set(withTiming(0, { duration: 200 }));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [pullInProgress, searchListActive, searchMode, exitSearch, reveal, pull]);

  const onSelectSearch = useCallback(
    (slug: string) => {
      // Open the demo out of the tapped row's icon. Keep the search open (row
      // mounted): the row owns the travelling icon, so it must still be there
      // for the close to land on — the demo dismisses back into the search
      // list, exactly mirroring the grid. Just drop the keyboard so it isn't
      // up behind the demo. Cancel from the returned search → grid.
      // The field's blur alone left the keyboard up over the opening demo:
      // the dismissal goes to whatever holds the keyboard.
      inputRef.current?.blur();
      Keyboard.dismiss();
      // SearchReveal focuses the field on a 120ms timer after search commits; a
      // fast row tap can land BEFORE that timer fires, so the field re-focuses
      // behind the opening demo and the keyboard gets stuck over the grid after
      // Cancel. A second dismissal past that window closes the race.
      setTimeout(() => {
        inputRef.current?.blur();
        Keyboard.dismiss();
      }, 250);
      onOpen('search', slug);
    },
    [onOpen],
  );

  // Whether the current pull committed to search. Written in onEnd, read in
  // onFinalize — see below.
  const pullCommitted = useSharedValue(false);
  // Whether the current pull started while an open was already in flight —
  // decided ON THE UI THREAD in onBegin. `enabled(!demoCovering)` below can't
  // cover this: demoCovering is JS state that reaches the gesture a commit or
  // two AFTER the tap, so a swipe-down started instantly after tapping an icon
  // (finger down before the demo has mounted) would still land in this pan and
  // commit search behind the opening demo. The launch group has no such lag:
  // it is named on the tap itself.
  const pullBlocked = useSharedValue(false);
  // Whether the pull is past the point where letting go opens search.
  const pullArmed = useSharedValue(false);
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
          pullArmed.set(false);
          const blocked = launchGroup.get() !== null;
          pullBlocked.set(blocked);
          pullActive.set(!blocked);
        })
        .onUpdate(e => {
          'worklet';
          if (pullBlocked.get()) return;
          const d = e.translationY > 0 ? e.translationY : 0;
          // Damped rubber-band for the grid; reveal tracks it, full at the trigger.
          const p = PULL_RUBBER * (1 - Math.exp(-d / PULL_RUBBER));
          pull.set(p);
          reveal.set(Math.min(p / SEARCH_TRIGGER, 1));
          // The tick of a pull-to-refresh: one as the pull crosses the point
          // where letting go opens search, a lighter one if it backs off.
          // On the UI thread, on the frame it crosses.
          if (!pullArmed.get() && e.translationY > SEARCH_TRIGGER) {
            pullArmed.set(true);
            Presets.System.impactLight();
          } else if (
            pullArmed.get() &&
            e.translationY < SEARCH_TRIGGER * PULL_DISARM
          ) {
            pullArmed.set(false);
            Presets.System.selection();
          }
        })
        .onEnd(e => {
          'worklet';
          if (pullBlocked.get()) return;
          // Commit to search when pulled past the trigger (or flicked hard).
          // The same line as the tick: armed means letting go opens search,
          // so a pull eased back into the hysteresis band still commits.
          if (pullArmed.get() || e.velocityY > 900) {
            // A flick opens search without crossing the trigger: its tick
            // lands here instead.
            if (!pullArmed.get()) Presets.System.impactLight();
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
          pullActive.set(false);
          if (!pullBlocked.get() && !pullCommitted.get()) {
            pull.set(withTiming(0, { duration: 260 }));
            reveal.set(withTiming(0, { duration: 260 }));
          }
        }),
    [
      pull,
      reveal,
      enterSearch,
      searchMode,
      demoCovering,
      pullCommitted,
      pullActive,
      pullBlocked,
      pullArmed,
    ],
  );
  // The recede behind an open demo is BLUR ONLY — deliberately no scale on the
  // grid: the launch measures the icon through its transforms, so a scaled
  // grid would move the frame the close lands on.
  //
  // One blur layer, two drivers: the demo-recede (home defocuses behind an open
  // demo) and the pull-to-search reveal (home defocuses as you pull / search).
  // Take the max so whichever is active wins, and they never fight.
  const blurProps = useAnimatedProps(() => {
    // The blur also clears as an open demo is dragged smaller, so the grid
    // sharpens as the card is about to return to it.
    const demoP =
      launchGroup.get() !== null
        ? launchProgress.get() *
          interpolate(
            launchPose.scale.get(),
            [1, CLOSE_SCALE],
            [1, 0.5],
            Extrapolation.CLAMP,
          )
        : 0;
    const demoBlur = interpolate(
      demoP,
      [0, 1],
      [0, HOME_MAX_BLUR],
      Extrapolation.CLAMP,
    );
    const searchBlur = searchBlurLead(reveal.get()) * HOME_MAX_BLUR;
    return { intensity: Math.max(demoBlur, searchBlur) };
  });
  const searchBlurProps = useAnimatedProps(() => ({
    intensity: searchBlurExtra(reveal.get()) * SEARCH_EXTRA_BLUR,
  }));
  // Both blurs stay mounted and are driven on the UI thread, from the first
  // pixel of a pull or a launch. Mounted from JS, they arrived a few frames
  // behind the finger, and the results revealed over a sharp grid. (Hiding
  // them with an animated opacity when idle does not work: a visual effect
  // view brought back from opacity 0 on the UI thread stays undrawn until the
  // next React commit.)

  // A tap forwarded by a closing demo (see `homeTap`): open the icon under it,
  // found by the grid's own geometry on the page in view.
  homeTap.current = (x, y) => {
    if (searchMode) return;
    const page = Math.round(scrollX.get() / layout.pageWidth);
    const demos = layout.pages[page];
    if (!demos) return;
    const offset = page * layout.pageWidth - scrollX.get();
    for (let cell = 0; cell < demos.length; cell++) {
      const rect = iconRectForCell(layout, insets.top, cell, offset);
      if (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ) {
        // A cell whose icon has not mounted yet has no launch source: the
        // demo would open with nothing to grow out of, invisible over the
        // home. The tap is dropped instead.
        if (page * layout.perPage + cell >= mountedIconsRef.current) return;
        onOpen('grid', demos[cell].slug);
        return;
      }
    }
  };

  const onPressDemo = useCallback(
    (slug: string) => onOpen('grid', slug),
    [onOpen],
  );

  // The first page mounts with the home; the other icons follow a row at a
  // time, one per idle slot, and then stay mounted. A row, not a page: a whole
  // page (~24 icons) committed to the main thread in one go, and a swipe that
  // began during it dropped frames. And never while the pager moves.
  const totalIcons = layout.perPage * layout.pageCount;
  const [mountedIcons, setMountedIcons] = useState(layout.perPage);
  const [pagerMoving, setPagerMoving] = useState(false);
  // Read where a render is not: the forwarded tap and the scroll worklets.
  const mountedIconsRef = useRef(mountedIcons);
  mountedIconsRef.current = mountedIcons;
  const gridComplete = useSharedValue(false);
  useEffect(() => {
    gridComplete.set(mountedIcons >= totalIcons);
    if (mountedIcons >= totalIcons) setPagerMoving(false);
  }, [mountedIcons, totalIcons, gridComplete]);
  useEffect(() => {
    // Not while the entrance plays: each row is a commit on the main thread,
    // and a stall there is a frame the entrance does not get.
    if (!introDone || pagerMoving || mountedIcons >= totalIcons) {
      return undefined;
    }
    const handle = requestIdleCallback(
      () => setMountedIcons(count => count + layout.cols),
      { timeout: PAGE_MOUNT_TIMEOUT },
    );
    return () => cancelIdleCallback(handle);
  }, [introDone, mountedIcons, totalIcons, pagerMoving, layout.cols]);
  // The keyboard is preloaded (a hidden field takes focus once, so the first
  // real one opens without lag) after the entrance, not with the app: it was
  // ~175ms of the main thread, in the window the home first shows in.
  useEffect(() => {
    if (!introDone) return undefined;
    const handle = requestIdleCallback(() => KeyboardController.preload(), {
      timeout: KEYBOARD_PRELOAD_TIMEOUT,
    });
    return () => cancelIdleCallback(handle);
  }, [introDone]);
  // Backstop: a swipe whose end the scroll events never report must not hold
  // the remaining pages back for good.
  useEffect(() => {
    if (!pagerMoving) return undefined;
    const t = setTimeout(() => setPagerMoving(false), PAGER_MOVING_BACKSTOP);
    return () => clearTimeout(t);
  }, [pagerMoving]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.set(event.contentOffset.x);
    },
    // Only while icons remain to mount: once the grid is whole, a swipe
    // re-renders nothing.
    onBeginDrag: () => {
      if (gridComplete.get()) return;
      scheduleOnRN(setPagerMoving, true);
    },
    // A paging swipe always ends in momentum; a drag released in place does
    // not, and ends here.
    onEndDrag: event => {
      if (gridComplete.get()) return;
      if (event.velocity?.x === 0) scheduleOnRN(setPagerMoving, false);
    },
    onMomentumEnd: () => {
      if (gridComplete.get()) return;
      scheduleOnRN(setPagerMoving, false);
    },
  });

  // Fewer pages (Show Unstable turned off) leave the content shorter, and the
  // scroll view keeps an offset past its end: an empty page, with the dots
  // and the forwarded taps pointing at one that is gone.
  const pagerRef = useAnimatedRef<Animated.ScrollView>();
  useEffect(() => {
    const last = (layout.pageCount - 1) * layout.pageWidth;
    if (scrollX.get() > last) {
      pagerRef.current?.scrollTo({ x: last, animated: false });
    }
  }, [layout.pageCount, layout.pageWidth, scrollX, pagerRef]);

  return (
    <View style={styles.root}>
      <Background introDone={introDone} />
      <GestureDetector gesture={pullGesture}>
        <Animated.View
          pointerEvents={searchMode || !introDone ? 'none' : 'auto'}
          // The grid holds still under a pull and only defocuses, as the
          // App Library's does: it is the results that come down with the
          // finger (see SearchReveal's \`pull\`).
          onLayout={onGridLayout}
          style={styles.gridScale}>
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            // Taps reach the icons at once: Fabric's ScrollView never delays
            // content touches (the ~150ms UIKit hold would sit before every
            // launch), and a real drag still cancels the child touch.
            contentContainerStyle={{ paddingTop: insets.top }}>
            {layout.pages.map((demos, index) => (
              <Page
                key={index}
                demos={demos}
                // Clamped to the page: a page already whole stays the same
                // props, and its memo holds while the next one mounts.
                mounted={Math.min(
                  demos.length,
                  Math.max(0, mountedIcons - index * layout.perPage),
                )}
                layout={layout}
                onPressDemo={onPressDemo}
                introFrame={index === 0 ? introFrame : undefined}
                introDone={introDone}
              />
            ))}
          </Animated.ScrollView>
        </Animated.View>
      </GestureDetector>

      {/* Page dots sit BELOW the blur layer so they defocus together with the
          grid during a pull/demo-recede (rendered before the blur in z-order).
          Hidden once search commits. */}
      {searchMode ? null : (
        <Animated.View
          style={[styles.dots, { bottom: insets.bottom + 14 }, rDotsIntro]}>
          <PageDots
            count={layout.pageCount}
            scrollX={scrollX}
            pageWidth={layout.pageWidth}
          />
        </Animated.View>
      )}

      {/* Blur layer over wallpaper + grid + dots. Intensity tracks whichever
          defocus is active — the demo-recede or the pull-to-search — so the home
          blurs behind an open demo and as the search reveals, sharpening back on
          dismiss / cancel. */}
      <AnimatedBlurView
        animatedProps={blurProps}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {/* A second pass for search only. One native blur tops out at a radius
          that leaves a mostly empty page reading sharp: the wallpaper's wide
          arc showed through as if nothing was blurred. Stacked, the second
          blurs the first, and the search sits on an even, defocused ground. */}
      <AnimatedBlurView
        animatedProps={searchBlurProps}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {/* Pull-to-search reveal: the search field + results, revealed with the
          pull and composited over the blurred grid. */}
      <SearchReveal
        reveal={reveal}
        pull={pull}
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
