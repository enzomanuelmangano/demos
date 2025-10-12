import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useDrawerProgress } from '@react-navigation/drawer';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';
import { AnimatedHamburgerIcon } from '../../src/navigation/components/animated-hamburger-icon';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const HamburgerMenuSize = 40;

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();
  const rDrawerProgress = useDrawerProgress();

  const rBlurIntensity = useDerivedValue<number | undefined>(() => {
    return interpolate(rDrawerProgress.value, [0, 1], [0, 40]);
  });

  const { top: safeTop } = useSafeAreaInsets();

  const rHamburgerIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(rDrawerProgress.value, [0, 0.5, 1], [0.5, 1, 0]),
    };
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
      <AnimatedHamburgerIcon
        containerStyle={[
          styles.menu,
          rHamburgerIconStyle,
          {
            top: safeTop,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  blurView: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    zIndex: 100000,
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
  menu: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#000000',
    borderCurve: 'continuous',
    borderRadius: 10,
    height: HamburgerMenuSize,
    justifyContent: 'center',
    left: 10,
    position: 'absolute',
    zIndex: 1000000,
  },
});
