import { StyleSheet, useWindowDimensions } from 'react-native';

import Animated, {
  Easing,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { SCREEN_CORNER_RADIUS } from './screen-radius';

// The perceived tap→open latency was the React navigate commit (~140ms dev):
// the real screen can only start zooming AFTER it has been rendered, committed
// and mounted, so the finger got no motion for that whole beat. This overlay
// decouples motion from rendering: it is a single PRE-MOUNTED white card driven
// purely by shared values, so the zoom starts on the UI thread on the very
// frame of the tap, while React renders the demo screen behind it. The real
// screen runs its normal (unchanged) open-zoom ~a commit later; since both
// follow the same rect path and the overlay is always ahead (bigger), it fully
// covers the real card until the real transition settles, then fades away.
export interface OpenZoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

// iOS app-open feel — shared by the overlay AND the real screen's transition
// spec (launcher.tsx), so the two zooms run the same path with the overlay a
// commit ahead, always covering the real card until it settles.
//
// Ease-out, iOS-style: quick escape from the icon, long decelerating settle.
// Two failure modes bracket this choice:
//  • too front-loaded (duration springs, Apple's 0.32/0.72 sheet curve) and
//    the card blankets the screen in ~2 frames — reads as a white flash
//    (area grows with scale², which amplifies any early speed);
//  • an eased-in start (0.35, 0.1, …) leaves the card lingering at icon size
//    for the first third — reads as sluggish, like the tap dragged.
// This sits between: ~40% of the growth in the first fifth, then a smooth
// tail — visibly a zoom, but it leaves the icon immediately.
export const OPEN_EASING = Easing.bezier(0.24, 0.6, 0.22, 1);
export const OPEN_DURATION = 380;

const REST_RECT: OpenZoomRect = { x: 0, y: 0, width: 0, height: 0, radius: 0 };

export const openZoomRect = makeMutable<OpenZoomRect>(REST_RECT);
export const openZoomProgress = makeMutable(0);
// 1 while the overlay leads the open; timed back to 0 once the real screen has
// settled underneath (see the reaction in springboard.tsx + backstop below).
export const openZoomOpacity = makeMutable(0);

// Fade the overlay out, revealing the settled real screen underneath.
export const fadeOutOpenZoom = () => {
  'worklet';
  openZoomOpacity.set(withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) }));
};

// Kick the overlay zoom from the tapped source rect. Marked as a worklet so
// the grid's UI-thread tap recognizer (springboard.tsx) can invoke it directly
// on the UI runtime — the expansion then starts on the SAME FRAME the finger
// lifts, with no JS-thread hop at all. Calling it from JS (search rows, grid
// fallback) also works: the shared-value sets dispatch to the UI thread.
export const startOpenZoom = (rect: OpenZoomRect) => {
  'worklet';
  openZoomRect.set(rect);
  openZoomOpacity.set(1);
  openZoomProgress.set(0);
  openZoomProgress.set(
    withTiming(1, { duration: OPEN_DURATION, easing: OPEN_EASING }, finished => {
      'worklet';
      if (!finished) {
        return;
      }
      // Backstop: normally the springboard fades the overlay the moment the
      // real screen's transition settles. If that never fires (screen errored,
      // instant dismiss, …) don't leave a white card stuck over the app. A
      // later settle-fade simply replaces this pending one. The delay must
      // comfortably exceed a cold navigate commit + the real zoom (~900ms in
      // dev), otherwise the backstop lifts the card mid-zoom and the grid
      // flashes through before the demo has covered the screen.
      if (openZoomOpacity.get() === 1) {
        openZoomOpacity.set(
          withDelay(1400, withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) })),
        );
      }
    }),
  );
};

// Mounted once at the launcher root, ABOVE the navigation tree, so it covers
// the real screen while that one mounts + runs its own zoom underneath.
//
// The card is a FULLSCREEN view animated purely with transforms (+ radius).
// Transforms are plain view props applied directly on the UI thread each
// frame; animating left/top/width/height instead goes through ShadowTree
// layout, which the (heavy) navigate commit blocks — the card visibly
// teleported to fullscreen while the commit ran, defeating the whole point.
export const OpenZoomOverlay = () => {
  const { width, height } = useWindowDimensions();

  const rCard = useAnimatedStyle(() => {
    const opacity = openZoomOpacity.get();
    if (opacity <= 0.001) {
      return { opacity: 0, transform: [{ scaleX: 0 }, { scaleY: 0 }] };
    }
    const rect = openZoomRect.get();
    const progress = openZoomProgress.get();
    const startScaleX = rect.width / width;
    const startScaleY = rect.height / height;
    // Pre-transform radius: compensated by the horizontal scale so the card's
    // corners read as the icon's radius at the start (slightly elliptical for
    // the first frames — same trade-off the library zoom makes).
    const startRadius = rect.radius / Math.max(startScaleX, 0.001);
    return {
      opacity,
      borderRadius: interpolate(
        progress,
        [0, 1],
        [startRadius, SCREEN_CORNER_RADIUS],
      ),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1],
            [rect.x + rect.width / 2 - width / 2, 0],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [rect.y + rect.height / 2 - height / 2, 0],
          ),
        },
        { scaleX: interpolate(progress, [0, 1], [startScaleX, 1]) },
        { scaleY: interpolate(progress, [0, 1], [startScaleY, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.card, { width, height }, rCard]}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    // Matches the demo screen's placeholder backdrop (launcher.tsx demoRoot) so
    // the overlay→real-screen handoff is invisible.
    backgroundColor: '#ffffff',
    borderCurve: 'continuous',
    left: 0,
    position: 'absolute',
    top: 0,
  },
});
