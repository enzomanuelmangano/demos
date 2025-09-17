import { useDrawerProgress } from '@react-navigation/drawer';
import { useRoute } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';

type RouteParams = {
  slug: string;
};

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function AnimationScreen() {
  const route = useRoute();
  const { slug } = (route.params as RouteParams) || {};
  const dimensions = useWindowDimensions();

  const drawerProgress = useDrawerProgress();

  const blurProgress = useDerivedValue<number | undefined>(() => {
    return drawerProgress.value * 20;
  }, []);

  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: blurProgress.value,
    };
  }, []);

  if (!slug) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No animation specified</Text>
      </View>
    );
  }

  const AnimationComponent = getAnimationComponent(slug);
  const metadata = getAnimationMetadata(slug);

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }

  // Render the component - use type assertion since components have different prop signatures
  // Some expect dimensions, some expect no props, some expect other props
  return (
    <View style={{ flex: 1 }}>
      <AnimationComponent {...dimensions} />
      <AnimatedBlurView
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 100000, pointerEvents: 'none' },
          rStyle,
        ]}
        tint="light"
        intensity={blurProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
});
