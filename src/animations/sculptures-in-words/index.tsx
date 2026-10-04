import {
  PixelRatio,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useCallback, useRef } from 'react';

import { StatusBar } from 'expo-status-bar';
import { usePatternComposer } from 'react-native-pulsar';
import Animated, {
  Easing,
  useAnimatedStyle,
  cancelAnimation,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Canvas,
  Group,
  Paragraph,
  Skia,
  LinearGradient,
  Rect,
  Image as SkiaImage,
  vec,
} from 'react-native-skia';

import {
  IDLE_SPIN,
  CLOCK_DAMPING,
  CLOCK_MASS,
  CLOCK_STIFFNESS,
  MORPH_DURATION_MS,
  PAGE_BG,
  PAGE_MARGIN_FRAC,
  PAPER_ACCENT,
} from './constants';
import { FAB_SIZE, PortraitToggle } from './fab';
import { MORPH_PATTERN } from './haptics';
import { usePortraitRenderer } from './hooks/use-portrait-renderer';
import { NIKE_ARTICLE } from './nike-text';
import { Paginator } from './paginator';
import { VENUS_ARTICLE } from './text';
import { THINKER_ARTICLE } from './thinker-text';

/**
 * Hoisted, and it matters.
 *
 * Inline, this tuple is a new array on every render, and it is a dependency of
 * the renderer's setup effect — which then tore itself down and rebuilt on
 * every frame, cancelling each run before it could start drawing. The symptom
 * was a blank screen with no error in the log, because the error the cancelled
 * run reported was immediately replaced by the next one.
 */
const ARTICLES = [VENUS_ARTICLE, NIKE_ARTICLE, THINKER_ARTICLE] as const;

/** How much of the screen's height the edge fades cover. */
const BOTTOM_FADE_FRAC = 0.22;
const TOP_FADE_FRAC = 0.14;
/**
 * The fade is eased, not linear: a straight ramp reads as a hard band with a
 * visible start. Cubic — nothing at all for the first stretch, most of the
 * covering in the last — so the page just gets quieter toward the edge.
 */
const FADE_STOPS = 12;
const FADE_POSITIONS = Array.from(
  { length: FADE_STOPS },
  (_, i) => i / (FADE_STOPS - 1),
);
const FADE_COLORS = FADE_POSITIONS.map(t => {
  const alpha = Math.round(255 * t * t * t);
  return `${PAGE_BG}${alpha.toString(16).padStart(2, '0')}`;
});
/** The icon crossfade. */
const FACE_MS = 350;

/**
 * Sculptures in Words.
 *
 * Three articles — the Venus de Milo, the Victory of Samothrace and Rodin's
 * Thinker. Press the button and every letter of the one you are reading lifts
 * off the column and lands on its sculpture; swipe sideways and the letters
 * re-seat themselves onto the next figure.
 *
 * Both libraries draw, every frame, on one device:
 *
 *   Skia     the column — vector glyph outlines, one `drawGlyphs` call for the
 *            whole article, crisp at reading size, and the final composite.
 *   WebGPU   the figure — one instanced mark per letter, with a depth buffer,
 *            so her near side hides her far side.
 *
 * Neither could take the other's half. A bitmap atlas at reading size is mush
 * when filtered and gravel when alpha-tested — and alpha testing is not
 * optional once fragments write depth, because a soft edge that writes depth
 * occludes with its own falloff and every mark grows a halo. Skia, for its
 * part, has no depth buffer at all.
 *
 * The scroll is the platform's, not a pan gesture pretending to be one: the
 * momentum, the rubber band and the indicator are real, and the ScrollView's
 * offset is what every letter launches from. Which also means the source is
 * live — the letters that fly are the ones on screen at the moment you press.
 */
export const SculpturesInWordsScreen = () => {
  const { width, height } = useWindowDimensions();
  const pixelRatio = PixelRatio.get();
  const fadeHeight = height * BOTTOM_FADE_FRAC;
  const topFadeHeight = height * TOP_FADE_FRAC;

  // The one clock. Everything about the letters is a function of it.
  const progress = useSharedValue(0);
  // The FAB's icon, on its own short clock.
  const face = useSharedValue(0);
  const yaw = useSharedValue(0);
  const scroll = useSharedValue(0);
  /**
   * Which way the next tap goes. A ref, not state.
   *
   * It used to be `useState`, and it was the last thing on this screen that
   * re-rendered during an interaction — one render per tap, for a boolean
   * nothing renders from.
   */
  const revealed = useRef(false);
  const lastToggle = useRef(0);
  const morphHaptic = usePatternComposer(MORPH_PATTERN);

  /**
   * Where the scroll is, in sculptures. Never React state: the horizontal
   * scroll writes it on the UI thread and the shader reads it there, so
   * crossing between figures re-renders nothing.
   */
  const cross = useSharedValue(0);
  /**
   * Which way the letters are going, fixed at the tap.
   *
   * The shader only sees the clock, and a clock running down looks exactly
   * like a clock running up in reverse — so the direction has to be told to
   * it, or the return can never be its own animation.
   */
  const rewind = useSharedValue(0);

  const portrait = usePortraitRenderer({
    width,
    height,
    texts: ARTICLES,
    // The scroll itself, not a spring behind it: the figure moves exactly as
    // far as the finger has, and stops when it stops.
    cross,
    rewind,
    progress,
    yaw,
    scroll,
  });

  /** The same value the paginator wants, in the pixels it was written against. */
  const crossPx = useDerivedValue(() => cross.get() * width, [cross, width]);

  const crossScroll = useAnimatedScrollHandler(event => {
    cross.set(event.contentOffset.x / Math.max(1, width));
  });

  /**
   * The reading scroll is as long as the column under it.
   *
   * It used to take the first article's height for all three, so the Thinker
   * — 14,869 marks against the Venus's 11,809 — could not be scrolled to its
   * own end. An animated height rather than state: the columns cross on the
   * UI thread and nothing here should wake React.
   */
  const columnHeights = portrait.pages?.map(l => l.height) ?? [1];
  const spacer = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(columnHeights.length - 1, cross.get()));
    const lo = Math.floor(k);
    const hi = Math.min(columnHeights.length - 1, lo + 1);
    return {
      height:
        columnHeights[lo] + (columnHeights[hi] - columnHeights[lo]) * (k - lo),
    };
  }, [columnHeights]);

  /**
   * Only one of the two scrolls is in the tree at a time.
   *
   * `scrollEnabled` through animated props was the obvious answer and it did
   * not take: the sideways scroll stayed live at rest, sat on top of the
   * reading one, and swallowed every vertical drag. `display` in an animated
   * style does take, and it is stronger — a view that is not displayed is not
   * hit-tested at all.
   */
  const readLayer = useAnimatedStyle(() => ({
    display: progress.get() < 0.1 ? ('flex' as const) : ('none' as const),
  }));
  const crossLayer = useAnimatedStyle(() => ({
    display: progress.get() > 0.9 ? ('flex' as const) : ('none' as const),
  }));
  /**
   * The paginator fades; it does not appear.
   *
   * It used to share the scroll's `display` toggle, and a view that is not
   * displayed does not render its children — so the dots arrived already in
   * their final state, in one frame, and left the same way. There was no fade
   * to get wrong because there was no fade.
   *
   * Opacity is enough on its own here: this layer never takes a touch, so it
   * has nothing to keep out of the way. It follows the same clock as the
   * letters, over the back half of the morph, so the dots arrive once the
   * figure is a figure.
   */
  const paginatorLayer = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, (progress.get() - 0.55) / 0.35)),
  }));

  const onScroll = useAnimatedScrollHandler(event => {
    scroll.set(event.contentOffset.y);
  });

  // The column, slid under the viewport by the ScrollView's own offset.
  // Snapped to whole device pixels. A fractional translation re-rasterises
  // every glyph at a new sub-pixel offset each frame, and a page of small
  // type shimmers as it scrolls; on the pixel grid the masks stay put and
  // only move.
  const pageShift = useDerivedValue(
    () => [{ translateY: -Math.round(scroll.get() * pixelRatio) / pixelRatio }],
    [scroll, pixelRatio],
  );

  /**
   * The columns slide, they do not fade.
   *
   * `opacity` on a Skia Group does not reach a Paragraph — set to 0 the text
   * still draws, and the articles overprint each other into a mess. A
   * transform does reach it, and sliding is the better answer anyway: the
   * columns page sideways under the finger crossing between the sculptures,
   * which is what the gesture already means.
   */
  const columnShift = ARTICLES.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(
      () => [{ translateX: (i - cross.get()) * width }],
      [cross, width, i],
    ),
  );

  // Skia owns the text at rest — vector outlines, the real thing. The moment
  // the clock leaves zero the whole column hands over to WebGPU in ONE step,
  // not per letter: WebGPU draws the same glyphs on the same pixels from the
  // same shaped paragraph, so nothing visible changes.
  //
  // Hidden by CLIP, not opacity: a group's opacity does not reach into a
  // paragraph node (nor a picture), and the column stayed on screen under its
  // own copy — every edge drawn twice, the whole page a hair bolder. An empty
  // clip is honoured by everything.
  //
  // And hidden two frames AFTER WebGPU starts drawing, not on the same frame.
  // Both now follow the clock on the UI thread, but the GPU pass and Skia's
  // redraw can still land a frame apart; had both switched on the same value
  // there would be an ordering in which neither drew, and a blank frame is
  // the one thing that cannot be hidden. Two frames of both drawing identical
  // pixels can.
  //
  // One column wide on purpose — the other two are parked a screen to either
  // side by `columnShift` and this is what keeps them off the page. Tall
  // enough for the longest of them, though: the height here is a bound, not a
  // layout, and the first article's height cut the Thinker's column off at
  // the Venus's last line.
  const tallest = Math.max(...columnHeights);
  const columnClip = useDerivedValue(
    () =>
      progress.get() > 0.003
        ? Skia.XYWHRect(0, 0, 0, 0)
        : Skia.XYWHRect(0, 0, width, tallest),
    [width, tallest],
  );

  // A turntable: one full turn after another, at a constant rate, from
  // wherever the figure happens to be facing.
  const startIdleSpin = useCallback(() => {
    'worklet';
    const from = yaw.get();
    yaw.set(
      withRepeat(
        withTiming(from + Math.PI * 2, {
          duration: (Math.PI * 2 * 1000) / IDLE_SPIN,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );
  }, [yaw]);

  const toggle = useCallback(() => {
    // Until the figure exists there is nothing to turn the page into: the
    // column would be clipped away with no letters drawn in its place.
    if (!portrait.ready) {
      return;
    }
    const now = Date.now();
    if (now - lastToggle.current < 120) {
      return; // the press animation can fire twice on one tap
    }
    lastToggle.current = now;

    const next = !revealed.current;
    revealed.current = next;
    morphHaptic.play();
    face.set(withTiming(next ? 1 : 0, { duration: FACE_MS }));

    // One clock, one value, one spring. A tap moves the target; the spring
    // carries the clock there from wherever it is, keeping the velocity it
    // has, and every letter — a function of the clock — turns round on the
    // spot.
    const target = next ? 1 : 0;
    // Both of these choose the FRONT — which letter leaves first — and a
    // letter's place along its path is a function of that choice. Change one
    // mid-flight and every letter is somewhere else on the next frame: the
    // whole cloud jumps. So they are set only from rest, where every letter
    // is at one end of its path and no front can move it.
    //
    // A reversal mid-flight therefore keeps the front it is already flying
    // under, and runs it backwards. Not the shape the return would have
    // chosen for itself, but it is the same letters continuing, which is the
    // thing you can actually see.
    const clock = progress.get();
    const fromRest = clock <= 0.001 || clock >= 0.999;
    if (fromRest) {
      rewind.set(next ? 0 : 1);
      if (clock <= 0.001) {
        portrait.setOrigin(scroll.get());
      }
    }
    progress.set(
      withSpring(target, {
        mass: CLOCK_MASS,
        stiffness: CLOCK_STIFFNESS,
        damping: CLOCK_DAMPING,
      }),
    );

    cancelAnimation(yaw);
    if (next) {
      startIdleSpin();
    } else {
      // Squared up on its own spring, so the turn settles rather than stopping.
      yaw.set(withSpring(0, { dampingRatio: 1, duration: MORPH_DURATION_MS }));
    }
  }, [
    morphHaptic,
    face,
    portrait,
    progress,
    rewind,
    scroll,
    yaw,
    startIdleSpin,
  ]);

  return (
    <View style={[styles.fill, { backgroundColor: PAGE_BG }]}>
      {/* This screen is paper, whatever the rest of the app is. */}
      <StatusBar style="dark" />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {portrait.pages !== null && (
          <Group transform={pageShift} clip={columnClip}>
            {/* One column per article, a screen apart. Only one is ever on
                screen: the crossing happens while the letters are a statue,
                so by the time a column is readable again it is whole. */}
            {portrait.pages.map((layout, i) => (
              <Group key={i} transform={columnShift[i]}>
                <Paragraph
                  paragraph={layout.paragraph}
                  x={layout.originX}
                  y={layout.originY}
                  width={width - layout.originX * 2}
                />
              </Group>
            ))}
          </Group>
        )}

        <SkiaImage
          image={portrait.image}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="fill"
        />

        {/* The page fades out at both edges, over text and flying letters
            alike — one composite, so the two never differ. The top one stands
            in for a header: the status bar sits on paper, not on type. */}
        <Rect x={0} y={0} width={width} height={topFadeHeight}>
          <LinearGradient
            start={vec(0, topFadeHeight)}
            end={vec(0, 0)}
            colors={FADE_COLORS}
            positions={FADE_POSITIONS}
          />
        </Rect>
        <Rect x={0} y={height - fadeHeight} width={width} height={fadeHeight}>
          <LinearGradient
            start={vec(0, height - fadeHeight)}
            end={vec(0, height)}
            colors={FADE_COLORS}
            positions={FADE_POSITIONS}
          />
        </Rect>
      </Canvas>

      {/* The platform's scroll, over an empty column the height of the
          article. Nothing renders inside it — Skia draws the text — but the
          momentum, the bounce and the indicator are real, and the offset is
          what the shader launches every letter from. */}
      {/* Reading. */}
      <Animated.View style={[StyleSheet.absoluteFill, readLayer]}>
        <Animated.ScrollView
          style={StyleSheet.absoluteFill}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}>
          <Animated.View style={spacer} />
        </Animated.ScrollView>
      </Animated.View>

      {/* Crossing. Three pages wide and empty: a gesture surface, not a
          container, and the only thing it produces is a number. */}
      <Animated.View style={[StyleSheet.absoluteFill, crossLayer]}>
        <Animated.ScrollView
          horizontal
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width: width * ARTICLES.length }}
          onScroll={crossScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={width}
          // One sculpture per gesture. Without this a flick carries through
          // two or three of them, and the whole point — watching one figure
          // become another — goes past too fast to read.
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
        />
      </Animated.View>

      {/* Which marble you are on — only while there is a choice to make. */}
      {/* absoluteFill, or the wrapper is a zero-height box and the
          absolutely-positioned dots inside it have nothing to sit against. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, paginatorLayer]}>
        <Paginator
          count={ARTICLES.length}
          scrollX={crossPx}
          windowWidth={width}
          margin={width * PAGE_MARGIN_FRAC}
          alignTo={FAB_SIZE}
        />
      </Animated.View>

      {portrait.error !== null && (
        <View style={styles.errorBox} pointerEvents="none">
          <Text style={styles.errorText}>{portrait.error}</Text>
        </View>
      )}

      <PortraitToggle
        face={face}
        onPress={toggle}
        style={{
          bottom: width * PAGE_MARGIN_FRAC,
          right: width * PAGE_MARGIN_FRAC,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  errorBox: {
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  errorText: {
    color: PAPER_ACCENT,
    fontSize: 12,
  },
  fill: { flex: 1 },
});
