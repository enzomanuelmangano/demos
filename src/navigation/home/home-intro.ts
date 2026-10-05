import * as SplashScreen from 'expo-splash-screen';
import { Easing, makeMutable, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * The home's entrance, measured off an iPhone unlocking (frame by frame, at
 * 30fps): the whole grid is one layer that starts ~4× too large and shrinks
 * onto its place about the centre of the screen, while the wallpaper comes
 * into focus a little slower.
 *
 * The grid's scale falls off exponentially, with no overshoot: its distance
 * from 1 shrinks by the same factor every frame (2.33, 1.56, 1.26, 1.11, 1.04,
 * 1.01 a frame apart — a time constant of ~38ms), so it is a curve of time,
 * not a spring. The wallpaper takes ~500ms to settle.
 */
export const HOME_INTRO = {
  /** Grid scale on the first frame. */
  gridFrom: 4,
  /** Time constant of the grid's fall onto its place. */
  gridTau: 38,
  /** Long enough for the fall to be within a hair of 1 (e^-8). */
  gridDuration: 300,
  /** Wallpaper scale on the first frame. */
  wallpaperFrom: 1.12,
  wallpaperDuration: 500,
};

/** 0 → 1 over the intro, linear in time; each layer shapes its own curve. */
export const homeIntro = makeMutable(1);

/** Holds the grid at its first frame until the home is on screen. */
export const holdHomeIntro = () => homeIntro.set(0);

/**
 * Lifts the splash and plays the intro under it, on the same frame; `onDone`
 * runs on the JS thread once it has landed. Started from the home's first
 * layout: started on mount, the whole fall ran before the first frame of the
 * home reached the screen, and the home appeared already at rest.
 */
export const playHomeIntro = (onDone?: () => void) => {
  SplashScreen.hideAsync();
  homeIntro.set(
    withTiming(
      1,
      { duration: HOME_INTRO.wallpaperDuration, easing: Easing.linear },
      finished => {
        'worklet';
        if (finished && onDone) scheduleOnRN(onDone);
      },
    ),
  );
};

/**
 * The grid's scale at intro progress `p`: 1 + (from - 1)·e^(-t/τ), with the
 * tail shifted so that it lands on exactly 1 when the fall is over.
 */
export const gridIntroScale = (p: number) => {
  'worklet';
  const { gridFrom, gridTau, gridDuration, wallpaperDuration } = HOME_INTRO;
  const t = Math.min(1, (p * wallpaperDuration) / gridDuration);
  const k = gridDuration / gridTau;
  const end = Math.exp(-k);
  const fall = (Math.exp(-k * t) - end) / (1 - end);
  return 1 + (gridFrom - 1) * fall;
};

/** The wallpaper's scale and how much of its blurred copy still shows. */
export const wallpaperIntro = (p: number) => {
  'worklet';
  // Ease-out cubic: most of the settling up front, as the grid lands.
  const e = 1 - (1 - p) * (1 - p) * (1 - p);
  return {
    scale: HOME_INTRO.wallpaperFrom + (1 - HOME_INTRO.wallpaperFrom) * e,
    blur: 1 - e,
  };
};
