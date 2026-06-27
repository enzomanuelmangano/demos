import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
  useRoute,
} from '@react-navigation/native';
import Transition from 'react-native-screen-transitions';

import { BOUNDS_GROUP } from './constants';
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
  return bounds({ id, group: BOUNDS_GROUP }).navigation.zoom();
};

const demoScreenOptions = {
  gestureEnabled: true,
  gestureDirection: 'bidirectional',
  // Mask the demo into the icon's rounded bounds during the zoom (needs
  // @react-native-masked-view/masked-view). Without it the zoom scales the
  // full screen, so a white-bg demo's white fills the frame mid-transition
  // instead of shrinking into the icon.
  navigationMaskEnabled: true,
  screenStyleInterpolator: zoomInterpolator,
  transitionSpec: {
    open: Transition.Specs.DefaultSpec,
    close: Transition.Specs.FlingSpec,
  },
} as const;

// Defer the heavy demo mount off the navigation commit. The tap → navigate
// commit also re-renders all the home boundaries; mounting a demo (some are
// whole mini-apps) in that same synchronous commit blocked the JS thread ~340ms
// and froze the tap before the zoom could start. The zoom runs on the UI thread
// (Reanimated), so we render a black panel first (clipped to the icon by the
// mask, so it reads as the tile growing), let the zoom begin, then mount the
// real content ~2 frames later — it fills in while the zoom keeps animating.
const useDeferredMount = (): boolean => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  return ready;
};

const DemoScreen = () => {
  const { slug } = (useRoute().params ?? {}) as Partial<DemoRouteParams>;
  const dimensions = useWindowDimensions();
  const ready = useDeferredMount();

  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    if (slug) {
      show('help', { slug });
    }
  }, [show, slug]);
  useOnShakeEffect(handleFeedback);

  const metadata = slug ? getAnimationMetadata(slug) : undefined;
  const AnimationComponent = slug ? getAnimationComponent(slug) : undefined;

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }
  // Black placeholder for the first frames so the zoom starts instantly.
  if (!ready) {
    return <View style={styles.placeholder} />;
  }
  return <AnimationComponent {...(dimensions as any)} />;
};

// The whole app navigation: an independent tree (its own NavigationContainer)
// so the screen-transitions blank stack owns the container and the zoom works
// without colliding with expo-router's vendored react-navigation.
// Black scene background. react-navigation defaults to off-white, which
// flashed in any gap the zoom/demo hadn't covered; "transparent" was worse — it
// revealed the white iOS window. Black matches the launcher, so gaps read as
// the dark home (the kept grid renders over it during the transition).
const darkTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#000' },
};

export const Launcher = () => (
  // Black root behind the whole tree: the zoom scales the home (background)
  // view down, and whatever sits behind it must be black, not the white
  // window/card that would otherwise show through.
  <View style={styles.root}>
    <NavigationIndependentTree>
      <NavigationContainer theme={darkTheme}>
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
  placeholder: { backgroundColor: '#000', flex: 1 },
  root: { backgroundColor: '#000', flex: 1 },
});
