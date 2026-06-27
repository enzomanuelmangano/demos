import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

import { useLocalSearchParams } from 'expo-router';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';
import { useOnShakeEffect } from '../../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../../src/packages/retray';

import type { Trays } from '../../src/trays';

// Demo host. The open/close + swipe-to-dismiss transition is driven by the
// screen-transitions stack (zoom interpolator in app/_layout.tsx) — this screen
// only resolves and renders the animation. Shake still opens the feedback tray.
export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();

  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help', { slug });
  }, [show, slug]);

  useOnShakeEffect(handleFeedback);

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

  return <AnimationComponent {...(dimensions as any)} />;
}

const styles = StyleSheet.create({
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
