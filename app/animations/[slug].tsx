import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useDrawerProgress } from '@react-navigation/drawer';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import Animated, {
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();
  const rDrawerProgress = useDrawerProgress();

  const rBlurIntensity = useDerivedValue<number | undefined>(() => {
    return interpolate(rDrawerProgress.value, [0, 1], [0, 40]);
  });

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
    <>
      <AnimationComponent {...(dimensions as any)} />
      <AnimatedBlurView
        tint="default"
        intensity={rBlurIntensity}
        style={styles.blurView}
      />
    </>
  );
}

const styles = StyleSheet.create({
  blurView: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    zIndex: 1000000,
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
