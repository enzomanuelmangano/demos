import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
  useRoute,
} from '@react-navigation/native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Transition from 'react-native-screen-transitions';

import { BOUNDS_GROUP, SEARCH_BOUNDS_GROUP } from './constants';
import { getIconBackdrop } from './icon-source';
import { OPEN_DURATION, OPEN_EASING, OpenZoomOverlay } from './open-zoom';
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

const isFromSearch = (route: { params?: object } | undefined): boolean => {
  'worklet';
  const params = route?.params as Record<string, unknown> | undefined;
  return params?.fromSearch === true;
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
  // Same shared-element zoom whether the demo was opened from a grid icon or a
  // search result row — only the source bound group differs. Search rows are
  // their own Boundary.Triggers (SEARCH_BOUNDS_GROUP), so a search-opened demo
  // zooms out of the tapped row and dismisses back into it, exactly like the
  // grid icon path.
  const fromSearch =
    isFromSearch(active.route) ||
    isFromSearch(next?.route) ||
    isFromSearch(current.route);
  const group = fromSearch ? SEARCH_BOUNDS_GROUP : BOUNDS_GROUP;
  // No backdrop: iOS keeps the home grid fully visible behind a closing app.
  // The zoom alone reveals the grid as the demo shrinks back to its icon.
  // borderRadius: the expanding screen grows to the device's display corner
  // radius (min 25) so its corners meet the physical screen edge, instead of
  // staying at the tiny icon radius.
  // backgroundScale: 1 keeps the home (wallpaper + grid) perfectly static while
  // the demo zooms out of its icon. The default zoom scales the whole unfocused
  // screen down, which visibly shrank the wallpaper too — not what we want.
  return bounds({ id, group }).navigation.zoom({
    borderRadius: SCREEN_CORNER_RADIUS,
    backgroundScale: 1,
  });
};

// The real screen's open transition runs the SAME timing curve as the instant
// overlay card (open-zoom.tsx), just starting one navigate-commit later. That
// keeps the overlay strictly ahead on the same path, so it covers the real
// card until settle and the whole open reads as ONE continuous zoom that
// starts on the tap frame. NOTE: this must stay a TIMING config (no spring
// keys) — the library's duration-spring front-loads ~2/3 of the motion into
// the first fifth, which overtook the overlay and flashed the screen white.
const OPEN_SPEC = { duration: OPEN_DURATION, easing: OPEN_EASING } as const;

// When to swap the lightweight placeholder for the real (potentially heavy)
// demo. The whole point: keep the navigate commit cheap so the zoom STARTS
// immediately and runs perfectly smooth on the UI thread; the demo's expensive
// first render (e.g. Calendar mounts 420 views ~250ms) then lands AFTER the
// zoom has settled, while the screen sits fullscreen white under/behind the
// (identical white) overlay — so the mount's UI-thread work never janks any
// visible motion, and the content cross-fades in as the overlay lifts.
const DEMO_MOUNT_DELAY = OPEN_DURATION + 40;

const demoScreenOptions = {
  gestureEnabled: true,
  gestureDirection: 'bidirectional',
  // The mask is what CROPS the shrinking screen into the icon rect on close
  // (real iOS morph). Without it the zoom can only scale the whole screen
  // uniformly, so a gesture close showed either a phone-shaped miniature
  // (content visible) or a blown-up icon ghost (content hidden early — the
  // library's default mitigation). Its GPU cost was once suspected of open
  // jank, but the instant overlay now covers the entire open, so the mask
  // only ever composites during the (gesture-paced) close.
  navigationMaskEnabled: true,
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
  // Fade driver for the mounted content. NOT an `entering` layout animation:
  // FadeIn's start races the demo's (heavy, JS-blocking) mount commit, so its
  // first painted frame could land at FULL opacity before the animation
  // registered — the content flickered in instead of fading. With a shared
  // value the content is committed at opacity 0 (plain style, same commit as
  // the mount, can't flash) and the timing starts from the effect below, i.e.
  // strictly after that commit.
  const contentOpacity = useSharedValue(0);
  // Re-defer per slug: the screen instance is reused across opens (it's
  // preloaded + kept warm), so each open must reset the gate and re-defer the
  // heavy demo mount off the zoom, not stay mounted from the previous open.
  useEffect(() => {
    setMounted(false);
    contentOpacity.set(0);
    const t = setTimeout(() => setMounted(true), DEMO_MOUNT_DELAY);
    return () => clearTimeout(t);
  }, [slug, contentOpacity]);
  useEffect(() => {
    if (!mounted) return;
    contentOpacity.set(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
    );
  }, [mounted, contentOpacity]);
  const rContent = useAnimatedStyle(() => ({
    opacity: contentOpacity.get(),
  }));

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
  // content swaps in over it. The colour is the DEMO's backdrop (derived from
  // its icon at build time), matching the overlay card exactly — a dark demo
  // opens dark, and the overlay's fade-out over this surface stays invisible.
  return (
    <View
      style={[
        styles.demoRoot,
        { backgroundColor: getIconBackdrop(slug ?? '') },
      ]}>
      {mounted ? (
        // Fade the real demo in over the flat backdrop so content doesn't pop —
        // by mount time the zoom has settled, so this cross-fade is the only
        // motion and reads as the app "developing in" (iOS launch feel).
        <Animated.View style={[styles.demoFill, rContent]}>
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
    {/* Above the whole tree: the instant open-zoom card. It starts moving on
        the tap frame and covers the real screen's (commit-delayed) zoom until
        that one settles — see open-zoom.tsx. */}
    <OpenZoomOverlay />
  </View>
);

const styles = StyleSheet.create({
  demoFill: { flex: 1 },
  // Opaque flat backdrop shown while the demo mounts. The white here is only
  // the fallback — each render overrides it with the demo's own backdrop
  // colour (getIconBackdrop), kept in sync with the overlay card.
  demoRoot: { backgroundColor: '#ffffff', flex: 1, overflow: 'hidden' },
  error: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: { color: 'white', fontSize: 16, textAlign: 'center' },
  root: { backgroundColor: HOME_BACKDROP, flex: 1 },
});
