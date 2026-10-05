import { useCallback, useRef } from 'react';

import * as SplashScreen from 'expo-splash-screen';
import {
  makeMutable,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * The home's entrance, measured off an iPhone unlocking, icon by icon (each
 * one tracked through every frame at 30fps by matching it against the settled
 * screen, then a curve fitted to the whole set: a residual of ~0.02 in scale,
 * under the 0.05 the matching resolves).
 *
 * Every icon follows the same curve, shifted in time: scaled about the centre
 * of the screen (so it is also further out along the line from the centre,
 * often off screen) by 1 + 0.5·e^(-(t - d)/τ), τ ≈ 41ms — no overshoot, no
 * hold, the curve just runs on before the icon is on screen. What makes them
 * read as independent is `d`, which grows with the icon's distance from the
 * centre, and more than linearly: ~20ms at the centre, ~70ms at 0.23 of the
 * screen's height, ~240ms for the top row, which comes down from above the
 * screen last. The dock is the exception: it falls at once (d ≈ 35ms), from
 * below. The wallpaper comes into focus over ~550ms.
 */
export const HOME_INTRO = {
  /** Scale above 1 where an icon's own clock starts (t = d). */
  amplitude: 0.5,
  /** Time constant of the fall. */
  tau: 40.8,
  /** After this long past `d` the icon is on its place, to the pixel. */
  fall: 300,
  /** Furthest an icon gets from the screen's centre, as a scale (off screen). */
  maxScale: 12,
  /**
   * The clock starts this far below 0: the first frame the screen shows is
   * already ~20ms into the fall (an icon at the centre is at ~1.85 there, not
   * at 1.5), measured the same way as the rest.
   */
  lead: 22,
  /** `d` for the dock and the page dots. */
  dockDelay: 35,
  /**
   * `d` against the distance from the centre, in screen heights: the measured
   * values, in between interpolated.
   */
  delayAt: [
    [0, 20],
    [0.053, 21],
    [0.12, 29],
    [0.16, 48],
    [0.23, 72],
    [0.275, 100],
    [0.287, 111],
    [0.357, 237],
    [0.39, 269],
  ] as ReadonlyArray<readonly [number, number]>,
  /** Wallpaper scale on the first frame. */
  wallpaperFrom: 1.12,
  wallpaperDuration: 550,
};

const LAST_DELAY = HOME_INTRO.delayAt[HOME_INTRO.delayAt.length - 1][1];
const TOTAL = Math.max(
  LAST_DELAY + HOME_INTRO.fall,
  HOME_INTRO.wallpaperDuration,
);

/** Milliseconds into the intro; at rest it is past the end. */
export const homeIntro = makeMutable(TOTAL);

/** Holds everything at its first frame until the home is on screen. */
export const holdHomeIntro = () => homeIntro.set(-HOME_INTRO.lead);

/** Longest a single frame may move the clock. */
const MAX_FRAME_MS = 34;

/**
 * Plays the intro, frame by frame. The clock is advanced by the frame's own
 * duration, never by more than `MAX_FRAME_MS`: with a clock of real time, the
 * main thread blocking for ~80ms as the home mounts made the first frame the
 * screen showed of it already that far into the fall, and the start of the
 * animation, its fastest part, was skipped. Now a stall slows it down.
 *
 * `play` lifts the splash, and once it is gone the clock starts. `onDone` runs
 * on the JS thread when everything has landed.
 */
export const useHomeIntro = (onDone: () => void) => {
  const playing = useSharedValue(false);
  const started = useSharedValue(false);
  const frameRef = useRef<{ setActive: (active: boolean) => void } | null>(
    null,
  );
  const finish = useCallback(() => {
    frameRef.current?.setActive(false);
    onDone();
  }, [onDone]);
  const frame = useFrameCallback(info => {
    'worklet';
    if (!playing.get()) return;
    // The first frame only shows the start, whatever the time before it.
    if (!started.get()) {
      started.set(true);
      homeIntro.set(-HOME_INTRO.lead);
      return;
    }
    const next =
      homeIntro.get() +
      Math.min(info.timeSincePreviousFrame ?? 0, MAX_FRAME_MS);
    if (next < TOTAL) {
      homeIntro.set(next);
      return;
    }
    homeIntro.set(TOTAL);
    playing.set(false);
    scheduleOnRN(finish);
  }, false);
  frameRef.current = frame;
  return useCallback(() => {
    const start = () => {
      started.set(false);
      playing.set(true);
      frame.setActive(true);
    };
    SplashScreen.hideAsync().then(start, start);
  }, [frame, playing, started]);
};

/** Puts the home at rest at once: the intro must never leave it mid-fall. */
export const settleHomeIntro = () => homeIntro.set(TOTAL);

/** `d` for something `distance` points from the centre of the screen. */
export const introDelay = (distance: number, screenHeight: number) => {
  const x = distance / screenHeight;
  const table = HOME_INTRO.delayAt;
  if (x <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) {
    const [x1, d1] = table[k];
    if (x <= x1) {
      const [x0, d0] = table[k - 1];
      return d0 + ((d1 - d0) * (x - x0)) / (x1 - x0);
    }
  }
  return LAST_DELAY;
};

/**
 * Scale at `elapsed` ms for something whose clock starts at `delay`:
 * 1 + amplitude·e^(-(t - d)/τ), the tail shifted so it lands on exactly 1
 * `fall` ms after `d`, and held at `maxScale` while still far off screen.
 */
export const introScale = (elapsed: number, delay: number) => {
  'worklet';
  const { amplitude, tau, fall, maxScale } = HOME_INTRO;
  const t = elapsed - delay;
  if (t >= fall) return 1;
  const end = Math.exp(-fall / tau);
  const s = 1 + (amplitude * (Math.exp(-t / tau) - end)) / (1 - end);
  return Math.min(maxScale, s);
};

/**
 * The transform for something centred `dx`, `dy` from the centre of the screen,
 * scaled about that centre rather than its own.
 */
export const introTransform = (
  elapsed: number,
  delay: number,
  dx: number,
  dy: number,
) => {
  'worklet';
  const scale = introScale(elapsed, delay);
  return [
    { translateX: dx * (scale - 1) },
    { translateY: dy * (scale - 1) },
    { scale },
  ];
};

/** The wallpaper's scale and how much of its blurred copy still shows. */
export const wallpaperIntro = (elapsed: number) => {
  'worklet';
  const p = Math.min(1, elapsed / HOME_INTRO.wallpaperDuration);
  // Ease-out cubic: most of the settling up front, as the icons land.
  const e = 1 - (1 - p) * (1 - p) * (1 - p);
  return {
    scale: HOME_INTRO.wallpaperFrom + (1 - HOME_INTRO.wallpaperFrom) * e,
    blur: 1 - e,
  };
};
