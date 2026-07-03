import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import { useLocalSearchParams } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';
import { getIconBackdrop } from '../../src/navigation/home/icon-source';
import { SCREEN_CORNER_RADIUS } from '../../src/navigation/home/screen-radius';
import { useOnShakeEffect } from '../../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../../src/packages/retray';

import type { Trays } from '../../src/trays';

// How long the iOS 18 native zoom runs before the heavy demo mounts. Same
// deferred-mount trick as the main branch: during the transition the screen is
// a flat backdrop the demo's colour (cheap commit, so UIKit's zoom morphs a
// clean surface and the mount's JS work can't jank the motion), then the real
// content fades in once the morph has settled.
const DEMO_MOUNT_DELAY = 450;

// SPIKE demo host. The open/close morph is UIKit's native zoom transition
// (Link.AppleZoom on the launcher icon) — this screen only provides the zoomed
// surface: flat backdrop first, demo faded in after the settle. Swipe-down
// dismiss comes free with the native transition. Shake opens feedback.
export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();

  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help', { slug });
  }, [show, slug]);

  useOnShakeEffect(handleFeedback);

  const [mounted, setMounted] = useState(false);
  const contentOpacity = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), DEMO_MOUNT_DELAY);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    contentOpacity.set(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
    );
  }, [mounted, contentOpacity]);
  const rContent = useAnimatedStyle(() => ({
    opacity: contentOpacity.get(),
  }));

  if (!slug) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No animation specified</Text>
      </View>
    );
  }

  const metadata = getAnimationMetadata(slug);
  const AnimationComponent = getAnimationComponent(slug);

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.demoRoot, { backgroundColor: getIconBackdrop(slug) }]}>
      {mounted ? (
        <Animated.View style={[styles.demoFill, rContent]}>
          <AnimationComponent {...(dimensions as any)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  demoFill: { flex: 1 },
  // The demo surface carries the device's display corner radius (continuous
  // curve, clipped): at rest the rounding coincides with the physical screen
  // corners so it's invisible, and during the native zoom / interactive
  // dismiss the shrinking screen keeps display-matched corners instead of
  // reading square against the morph's rounded mask.
  demoRoot: {
    backgroundColor: '#ffffff',
    borderCurve: 'continuous',
    borderRadius: SCREEN_CORNER_RADIUS,
    flex: 1,
    overflow: 'hidden',
  },
  errorContainer: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
});
