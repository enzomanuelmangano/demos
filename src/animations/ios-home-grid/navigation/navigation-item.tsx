import { type ReactNode, useCallback, useId } from 'react';

import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type AnimatedRef,
  Easing,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useCustomNavigation } from './expansion-provider';

import type { StyleProp, ViewStyle } from 'react-native';
import type { WrapperRef } from 'react-native-reanimated/lib/typescript/commonTypes';

type NavigationItemProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onNavigate?: () => void;
  config?: {
    borderRadius?: number;
    color?: string;
  };
};

const NavigationItem = ({
  children,
  style,
  onNavigate,
  config,
}: NavigationItemProps) => {
  const ref = useAnimatedRef();
  const active = useSharedValue(false);

  const id = useId();
  const { startTransition, timingProgress, transitionId } =
    useCustomNavigation();

  const onNavigateWrapper = useCallback(() => {
    if (onNavigate) {
      scheduleOnRN(onNavigate);
    }
  }, [onNavigate]);

  const gesture = Gesture.Tap()
    .onBegin(() => {
      active.value = true;
    })
    .onFinalize(() => {
      active.value = false;
    })
    .onEnd(() => {
      active.value = false;
      scheduleOnRN(Haptics.selectionAsync);
      startTransition(ref as AnimatedRef<WrapperRef>, {
        id,
        borderRadius: config?.borderRadius,
        color: config?.color,
        onComplete: () => {
          'worklet';
          scheduleOnRN(onNavigateWrapper);
        },
        borderCurve: 'continuous',
      });
    });

  const opacity = useDerivedValue(() => {
    if (active.value) {
      return 0.85;
    }
    if (transitionId.value !== id) {
      return 1;
    }

    return withTiming(timingProgress.value > 0.9 ? 0 : 1, {
      easing: Easing.bezier(0.19, 1, 0.22, 1),
    });
  });

  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={ref} style={[style, rStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};

export { NavigationItem };
