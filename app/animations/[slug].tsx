import {
  Keyboard,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useCallback, useEffect, useState } from 'react';

import { BlurView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import { useAtomValue } from 'jotai';
import { useDrawerProgress } from 'react-native-drawer-layout';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedProps,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

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

// Skia and WebGPU demos paint their first frame a few frames after their view
// is mounted, so a fade that starts at mount runs over an empty screen and the
// demo still pops in. Wait a few frames after layout before fading in.
const FadeInDelayFrames = 4;

const FadeInOnFirstFrames = ({ children }: { children: React.ReactNode }) => {
  const opacity = useSharedValue(0);

  const onLayout = useCallback(() => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames < FadeInDelayFrames) {
        requestAnimationFrame(tick);
        return;
      }
      opacity.set(withTiming(1, { duration: 250 }));
    };
    requestAnimationFrame(tick);
  }, [opacity]);

  const rStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View onLayout={onLayout} style={[styles.fill, rStyle]}>
      {children}
    </Animated.View>
  );
};

const DrawerIconSize = 40;

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();
  const rDrawerProgress = useDrawerProgress();
  const hideDrawerIconSetting = useAtomValue(HideDrawerIconAtom);
  const metadata = getAnimationMetadata(slug);
  const hideDrawerIcon = hideDrawerIconSetting || metadata?.hideDrawerIcon;

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // A demo is mounted only once the drawer has finished closing. Mounting it
  // during the close (100-500 ms of JS work for the heavier Skia/WebGPU demos)
  // froze the drawer mid-slide and left the blur over an empty screen, which
  // read as a grey flash before the demo popped in.
  const [mountedSlug, setMountedSlug] = useState<string | undefined>(() =>
    rDrawerProgress.get() < 0.01 ? slug : undefined,
  );
  const isMounted = mountedSlug === slug;

  useEffect(() => {
    if (rDrawerProgress.get() < 0.01) {
      setMountedSlug(slug);
    }
  }, [slug, rDrawerProgress]);

  useAnimatedReaction(
    () => rDrawerProgress.get() < 0.01,
    (closed, wasClosed) => {
      if (closed && !wasClosed) {
        scheduleOnRN(setMountedSlug, slug);
      }
    },
    [slug],
  );

  useAnimatedReaction(
    () => rDrawerProgress.get(),
    (value, prevValue) => {
      if (value < 0.5 && prevValue && prevValue !== value && prevValue > 0.5) {
        scheduleOnRN(dismissKeyboard);
        return;
      }
    },
  );

  // Animated intensity must go through useAnimatedProps: a shared value passed
  // directly as the prop only forwards its value on the FIRST render
  // (reanimated's PropsFilter) — re-renders drop the prop and the React commit
  // clobbers UI-thread updates with the component default.
  // No blur while the demo is not mounted yet: blurring an empty screen is
  // what showed up as the grey flash.
  const blurAnimatedProps = useAnimatedProps(
    () => ({
      intensity: isMounted
        ? // Eased in: the drawer covers a big part of its travel on its first
          // frame, and a linear ramp made the blur appear all at once.
          40 * rDrawerProgress.get() ** 2
        : 0,
    }),
    [isMounted],
  );

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
        rDrawerProgress.get(),
        [0, 0.5, 1],
        [
          0.5 * rHideDrawerIconProgress.get(),
          1 * rHideDrawerIconProgress.get(),
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
      {isMounted ? (
        <FadeInOnFirstFrames key={slug}>
          <AnimationComponent {...(dimensions as any)} />
        </FadeInOnFirstFrames>
      ) : (
        <View style={styles.placeholder} />
      )}
      <AnimatedBlurView
        tint="default"
        animatedProps={blurAnimatedProps}
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
    // RN 0.85 removed StyleSheet.absoluteFillObject — spell it out.
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
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
  fill: {
    flex: 1,
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
  placeholder: {
    backgroundColor: '#000',
    flex: 1,
  },
});
