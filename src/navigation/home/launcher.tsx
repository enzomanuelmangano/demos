import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
  useRoute,
} from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Transition from 'react-native-screen-transitions';

import { BOUNDS_GROUP } from './constants';
import { SCREEN_CORNER_RADIUS } from './screen-radius';
import { Springboard } from './springboard';
import { DemoStack } from './stack';
import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../animations/registry';
import { useRetray } from '../../packages/retray';
import { useOnShakeEffect } from '../hooks/use-shake-gesture';

import type { Trays } from '../../trays';
import type { ScreenTransitionConfig } from 'react-native-screen-transitions';

export interface DemoRouteParams {
  slug: string;
}

const getSlug = (route: { params?: object } | undefined): string => {
  'worklet';
  const params = route?.params as Record<string, unknown> | undefined;
  const v = params?.slug;
  return typeof v === 'string' ? v : '';
};

// Open-zoom: the demo screen grows out of the tapped icon's shared bound
// (matched by slug) over a dimming black backdrop.
const zoomInterpolator: ScreenTransitionConfig['screenStyleInterpolator'] = ({
  active,
  bounds,
  current,
  next,
}) => {
  'worklet';
  const id =
    getSlug(active.route) || getSlug(next?.route) || getSlug(current.route);
  if (!id) {
    return {};
  }
  // No backdrop: iOS keeps the home grid fully visible behind a closing app.
  // The zoom alone reveals the grid as the demo shrinks back to its icon.
  // borderRadius: the expanding screen grows to the device's display corner
  // radius (min 25) so its corners meet the physical screen edge, instead of
  // staying at the tiny icon radius.
  // backgroundScale: 1 keeps the home (wallpaper + grid) perfectly static while
  // the demo zooms out of its icon. The default zoom scales the whole unfocused
  // screen down, which visibly shrank the wallpaper too — not what we want.
  return bounds({ id, group: BOUNDS_GROUP }).navigation.zoom({
    borderRadius: SCREEN_CORNER_RADIUS,
    backgroundScale: 1,
  });
};

// Snappy, iOS-like open spring. The library's DefaultSpec (stiffness 1000,
// damping 500, mass 3) is ~4.5x overdamped with a heavy mass, so it crawls open
// over more than a second — that's the "too slow to open" feel. A duration +
// dampingRatio spring gives a fixed, fast settle with no sluggish tail; 0.9
// ratio keeps it crisp (no overshoot bounce on the growing corners).
const OPEN_DURATION = 300;
const OPEN_SPEC = { duration: OPEN_DURATION, dampingRatio: 0.9 } as const;

// When to swap the lightweight placeholder for the real (potentially heavy)
// demo. The whole point: keep the navigate commit cheap so the zoom STARTS
// immediately and runs perfectly smooth on the UI thread; the demo's expensive
// first render (e.g. Calendar mounts 420 views ~250ms) then lands AFTER the
// zoom has settled, while the screen is already full-size — so it never janks
// the motion. Mounting slightly before the zoom ends hides the content swap
// under the last frames of growth so it doesn't read as a late pop-in.
const DEMO_MOUNT_DELAY = OPEN_DURATION - 60;

const demoScreenOptions = {
  gestureEnabled: true,
  gestureDirection: 'bidirectional',
  // EXPERIMENT: MaskedView forces offscreen GPU compositing every frame of the
  // zoom (suspected slowness). Disabled -> the library clips via borderRadius +
  // overflow:hidden instead. Testing whether this is the perf culprit.
  navigationMaskEnabled: false,
  screenStyleInterpolator: zoomInterpolator,
  transitionSpec: {
    open: OPEN_SPEC,
    close: Transition.Specs.FlingSpec,
  },
} as const;

const DemoScreen = () => {
  const { slug } = (useRoute().params ?? {}) as Partial<DemoRouteParams>;
  const dimensions = useWindowDimensions();

  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    if (slug) {
      show('help', { slug });
    }
  }, [show, slug]);
  useOnShakeEffect(handleFeedback);

  // Defer the heavy demo mount until the zoom has (almost) finished. During the
  // zoom we render only a cheap icon placeholder, so the navigate commit is tiny
  // and the growth animation is buttery from frame one regardless of how heavy
  // the demo is. A fixed timer (not the library's settle flag, which fires
  // unreliably late) keeps the swap tightly locked to the spring.
  const [mounted, setMounted] = useState(false);
  // Re-defer per slug: the screen instance is reused across opens (it's
  // preloaded + kept warm), so each open must reset the gate and re-defer the
  // heavy demo mount off the zoom, not stay mounted from the previous open.
  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), DEMO_MOUNT_DELAY);
    return () => clearTimeout(t);
  }, [slug]);

  const metadata = slug ? getAnimationMetadata(slug) : undefined;
  const AnimationComponent = slug ? getAnimationComponent(slug) : undefined;

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }

  // During the zoom the demo isn't mounted yet, so we show a placeholder. It's a
  // flat backdrop, NOT the icon: the zoom grows the frame from icon-size to
  // fullscreen, and anything textured inside (like the icon) would visibly
  // scale up ~5x — a giant zooming icon. A solid colour looks identical at every
  // scale, so the frame just grows cleanly like an opening card, then the real
  // content swaps in over it.
  return (
    <View style={styles.demoRoot}>
      {mounted ? (
        // Fade the real demo in over the flat backdrop so content doesn't pop —
        // by mount time the zoom has settled, so this cross-fade is the only
        // motion and reads as the app "developing in" (iOS launch feel).
        <Animated.View
          style={styles.demoFill}
          entering={FadeIn.duration(220)}>
          <AnimationComponent {...(dimensions as any)} />
        </Animated.View>
      ) : null}
    </View>
  );
};

// The whole app navigation: an independent tree (its own NavigationContainer)
// so the screen-transitions blank stack owns the container and the zoom works
// without colliding with expo-router's vendored react-navigation.
// Light scene background matching the home wallpaper's edge tone: the open-zoom
// scales the grid down and reveals this layer, so it must blend with the light
// wallpaper rather than flash a hard edge (the kept grid renders over it).
const HOME_BACKDROP = '#edf0f6';
const homeTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: HOME_BACKDROP },
};

export const Launcher = () => (
  // Light root behind the whole tree: the zoom scales the home (background)
  // view down, and whatever sits behind it must match the light wallpaper, not
  // flash the white window/card that would otherwise show through.
  <View style={styles.root}>
    <NavigationIndependentTree>
      <NavigationContainer theme={homeTheme}>
        <DemoStack.Navigator>
          <DemoStack.Screen
            name="Home"
            component={Springboard}
            // Keep the grid mounted + visible behind an open demo, so dismissing
            // reveals it (default "hide" detaches it -> black void behind).
            options={{ inactiveBehavior: 'keep' }}
          />
          <DemoStack.Screen
            name="Demo"
            component={DemoScreen}
            options={demoScreenOptions}
          />
        </DemoStack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  </View>
);

const styles = StyleSheet.create({
  error: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: { color: 'white', fontSize: 16, textAlign: 'center' },
  // Opaque flat backdrop shown while the demo mounts. Neutral light so it blends
  // with the (mostly light) demos and the home wallpaper edge as the frame grows.
  demoRoot: { backgroundColor: '#ffffff', flex: 1, overflow: 'hidden' },
  demoFill: { flex: 1 },
  root: { backgroundColor: HOME_BACKDROP, flex: 1 },
});
