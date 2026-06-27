import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

import {
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
  screenStyleInterpolator: zoomInterpolator,
  transitionSpec: {
    open: Transition.Specs.DefaultSpec,
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

  const metadata = slug ? getAnimationMetadata(slug) : undefined;
  const AnimationComponent = slug ? getAnimationComponent(slug) : undefined;

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }
  return <AnimationComponent {...(dimensions as any)} />;
};

// The whole app navigation: an independent tree (its own NavigationContainer)
// so the screen-transitions blank stack owns the container and the zoom works
// without colliding with expo-router's vendored react-navigation.
export const Launcher = () => (
  <NavigationIndependentTree>
    <NavigationContainer>
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
);

const styles = StyleSheet.create({
  error: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: { color: 'white', fontSize: 16, textAlign: 'center' },
});
