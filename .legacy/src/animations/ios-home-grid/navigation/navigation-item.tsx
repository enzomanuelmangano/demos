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
      active.set(true);
    })
    .onFinalize(() => {
      active.set(false);
    })
    .onEnd(() => {
      active.set(false);
      scheduleOnRN(Haptics.selectionAsync);
      startTransition(ref as AnimatedRef<any>, {
        id,
        borderRadius: config?.borderRadius,
        color: config?.color,
        onComplete: () => {
          'worklet';
          scheduleOnRN(onNavigateWrapper);
        },
      });
    });

  const opacity = useDerivedValue(() => {
    if (active.get()) {
      return 0.85;
    }
    if (transitionId.get() !== id) {
      return 1;
    }

    return withTiming(timingProgress.get() > 0.9 ? 0 : 1, {
      easing: Easing.bezier(0.19, 1, 0.22, 1),
    });
  });

  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.get(),
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      {/* collapsable={false} keeps a backing native view on Fabric so
          measure() returns dimensions instead of null (the expand
          transition silently no-op'd without it). */}
      <Animated.View collapsable={false} ref={ref} style={[style, rStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};

export { NavigationItem };
