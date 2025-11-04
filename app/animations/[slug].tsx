import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

import { useDrawerProgress } from '@react-navigation/drawer';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import { useAtomValue } from 'jotai';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';
import { AnimatedDrawerIcon } from '../../src/navigation/components/animated-drawer-icon';
import { useOnShakeEffect } from '../../src/navigation/hooks/use-shake-gesture';
import { HideDrawerIconAtom } from '../../src/navigation/states/filters';
import { useRetray } from '../../src/packages/retray';

import type { Trays } from '../../src/trays';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const DrawerIconSize = 40;

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();
  const rDrawerProgress = useDrawerProgress();
  const hideDrawerIconSetting = useAtomValue(HideDrawerIconAtom);
  const metadata = getAnimationMetadata(slug);
  const hideDrawerIcon = hideDrawerIconSetting || metadata?.hideDrawerIcon;

  const rBlurIntensity = useDerivedValue<number | undefined>(() => {
    return interpolate(rDrawerProgress.value, [0, 1], [0, 40]);
  });

  const { top: safeTop } = useSafeAreaInsets();

  const rHideDrawerIconProgress = useDerivedValue<number>(() => {
    return withTiming(hideDrawerIcon ? 0 : 1, {
      duration: 200,
      easing: Easing.linear,
    });
  }, [hideDrawerIcon]);

  const rDrawerIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        rDrawerProgress.value,
        [0, 0.5, 1],
        [
          0.5 * rHideDrawerIconProgress.value,
          1 * rHideDrawerIconProgress.value,
          0,
        ],
      ),
      pointerEvents: hideDrawerIcon ? 'none' : 'auto',
    };
  }, [hideDrawerIcon]);

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

  const AnimationComponent = getAnimationComponent(slug);

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
