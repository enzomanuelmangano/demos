import Animated, {
  Easing,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { StyleProp, ViewStyle } from 'react-native';
import { useCallback, useId } from 'react';

import { useCustomNavigation } from './expansion-provider';

type NavigationItemProps = {
  children: React.ReactNode;
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
      runOnJS(onNavigate)();
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
      startTransition(ref, {
        id,
        borderRadius: config?.borderRadius,
        color: config?.color,
        onComplete: () => {
          'worklet';
          runOnJS(onNavigateWrapper)();
        },
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
