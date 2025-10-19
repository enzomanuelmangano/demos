import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

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
} from '../../../src/animations/registry';
import { AnimatedDrawerIcon } from '../../../src/navigation/components/animated-drawer-icon';
import { useOnShakeEffect } from '../../../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../../../src/packages/retray';

import type { Trays } from '../../../src/trays';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const DrawerIconSize = 40;

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();
  const rDrawerProgress = useDrawerProgress();

  const rBlurIntensity = useDerivedValue<number | undefined>(() => {
    return interpolate(rDrawerProgress.value, [0, 1], [0, 40]);
  });

  const { top: safeTop } = useSafeAreaInsets();

  const rDrawerIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(rDrawerProgress.value, [0, 0.5, 1], [0.5, 1, 0]),
    };
  });

  // Handle feedback trigger via shake gesture
  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('howCanWeHelp', { slug });
  }, [show, slug]);

  useOnShakeEffect(handleFeedback);

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

  return (
    <>
      <AnimationComponent {...(dimensions as any)} />
      <AnimatedBlurView
        tint="default"
        intensity={rBlurIntensity}
        style={styles.blurView}
      />
      <AnimatedDrawerIcon
        containerStyle={[
          styles.menu,
          rDrawerIconStyle,
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
    height: DrawerIconSize,
    justifyContent: 'center',
    left: 10,
    position: 'absolute',
    zIndex: 1000000,
  },
});
