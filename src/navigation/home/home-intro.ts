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
 * screen; the far icons by their position, which resolves a hundredth of a
 * scale).
 *
 * Every icon follows the same curve, shifted in time: scaled about the centre
 * of the screen (so it is also further out along the line from the centre,
 * often off screen) by 1 + (c1 + c2·x)·e^(-x/τ), x = t - d. That is a
 * critically damped spring released with an inward velocity: it falls fast,
 * crosses 1 about 140ms after its own start, dips to ~0.982 — the rebound —
 * and comes back to 1 without oscillating, over ~600ms. A residual of 0.01
 * in scale over the 10 icons the match resolves best (0.003 for the far
 * ones). What makes the icons read as independent is `d`, which grows with the
 * icon's distance from the centre, and more than linearly: ~22ms at the
 * centre, ~85ms at 0.23 of the screen's height, ~245ms for the top row, which
 * comes down from above the screen last. The dock is the exception: it falls
 * at once, from below. The wallpaper comes into focus over ~550ms.
 */
export const HOME_INTRO = {
  /** Scale above 1 where an icon's own clock starts (x = 0). */
  c1: 0.438,
  /** Its inward velocity, per ms: what takes it below 1 and back. */
  c2: -0.003197,
  /** Time constant of the spring. */
  tau: 82.2,
  /** Past this long after `d` the icon is on its place, to the pixel. */
  settle: 700,
  /** After this long the rebound is under 0.5%: the grid takes touches. */
  touchable: 450,
  /** Furthest an icon gets from the screen's centre, as a scale (off screen). */
  maxScale: 12,
  /**
   * The clock starts this far below 0: the first frame the screen shows is
   * already ~13ms into the fall (an icon at the centre is at ~1.85 there).
   */
  lead: 13,
  /** `d` for the dock and the page dots. */
  dockDelay: 40,
  /**
   * `d` against the distance from the centre, in screen heights: the measured
   * values, in between interpolated.
   */
  delayAt: [
    [0, 20],
    [0.053, 22],
    [0.125, 27],
    [0.195, 62],
    [0.23, 85],
    [0.245, 87],
    [0.287, 127],
    [0.357, 245],
    [0.39, 281],
  ] as ReadonlyArray<readonly [number, number]>,
  /** Wallpaper scale on the first frame. */
  wallpaperFrom: 1.12,
  wallpaperDuration: 550,
};

const LAST_DELAY = HOME_INTRO.delayAt[HOME_INTRO.delayAt.length - 1][1];
const TOTAL = Math.max(
  LAST_DELAY + HOME_INTRO.settle,
  HOME_INTRO.wallpaperDuration,
);
/** When the last icon's rebound is under 0.5%. */
const TOUCHABLE_AT = LAST_DELAY + HOME_INTRO.touchable;

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
 * The returned function lifts the splash, and once it is gone the clock
 * starts. `onTouchable` runs on the JS thread when the rebound is under 0.5%.
 */
export const useHomeIntro = (onTouchable: () => void) => {
  const playing = useSharedValue(false);
  const started = useSharedValue(false);
  const released = useSharedValue(false);
  const frameRef = useRef<{ setActive: (active: boolean) => void } | null>(
    null,
  );
  const stop = useCallback(() => frameRef.current?.setActive(false), []);
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
    if (!released.get() && next >= TOUCHABLE_AT) {
      released.set(true);
      scheduleOnRN(onTouchable);
    }
    if (next < TOTAL) {
      homeIntro.set(next);
      return;
    }
    homeIntro.set(TOTAL);
    playing.set(false);
    scheduleOnRN(stop);
  }, false);
  frameRef.current = frame;
  return useCallback(() => {
    const start = () => {
      started.set(false);
      released.set(false);
      playing.set(true);
      frame.setActive(true);
    };
    SplashScreen.hideAsync().then(start, start);
  }, [frame, playing, started, released]);
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
 * 1 + (c1 + c2·x)·e^(-x/τ), held at `maxScale` while still far off screen,
 * and exactly 1 `settle` ms after `delay`.
 */
export const introScale = (elapsed: number, delay: number) => {
  'worklet';
  const { c1, c2, tau, settle, maxScale } = HOME_INTRO;
  const x = elapsed - delay;
  if (x >= settle) return 1;
  return Math.min(maxScale, 1 + (c1 + c2 * x) * Math.exp(-x / tau));
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
