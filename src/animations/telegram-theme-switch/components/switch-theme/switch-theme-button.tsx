import type { StyleProp, ViewStyle } from 'react-native';
import Reanimated, {
  measure,
  runOnJS,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AnimatedLottieView } from '../animated-lottie-view';

import { useSwitchTheme } from './context';

type SwitchThemeButtonProps = {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export const MAX_THEME_ANIMATION_SIZE = 65;

// https://lottiefiles.com/animations/light-to-darak-Y6M1BnwnBn

const SwitchThemeButton: React.FC<SwitchThemeButtonProps> = ({
  style,
  contentContainerStyle,
}) => {
  const { toggleTheme, animationProgress } = useSwitchTheme();

  const viewRef = useAnimatedRef<Reanimated.View>();

  const reanimatedProgressValue = useDerivedValue(() => {
    return animationProgress.value;
  });

  const isInvisible = useDerivedValue(() => {
    return (
      reanimatedProgressValue.value > 0 && reanimatedProgressValue.value < 1
    );
  });

  const rAnimatedStyle = useAnimatedStyle(() => {
    const opacity = isInvisible.value ? 0 : 1;
    return {
      opacity,
    };
  }, []);

  const scale = useSharedValue(1);

  const tapGesture = Gesture.Tap().onTouchesUp(() => {
    const value = measure(viewRef);
    if (!value) return;
    const center = {
      x: value.pageX,
      y: value.pageY,
      height: 80,
      width: 80,
    };

    runOnJS(toggleTheme)({ center, style });
  });

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(scale.value),
        },
      ],
    };
  });

  const animatedProps = useAnimatedProps(() => {
    return {
      progress: animationProgress.value,
    };
  });

  return (
    // A wrapper component to detect gesture interactions, in this case, tap gestures.
    <GestureDetector gesture={tapGesture}>
      {/* Animated view acting as the main container with styles dynamically generated from animations */}
      <Reanimated.View style={[contentContainerStyle, rContainerStyle]}>
        {/* Another animated view which possibly undergoes transformations or opacity changes */}
        <Reanimated.View
          ref={viewRef} // Reference to access this view programmatically
          style={[
            // Common styling to center content both vertically and horizontally
            { flex: 1, justifyContent: 'center', alignItems: 'center' },
            rAnimatedStyle, // Dynamic style for animations
          ]}>
          {/* Lottie component to play animations */}
          <AnimatedLottieView
            animatedProps={animatedProps}
            style={[
              style, // Base style
              {
                // Set the dimensions for the Lottie animation view
                height: MAX_THEME_ANIMATION_SIZE,
                width: MAX_THEME_ANIMATION_SIZE,
              },
            ]}
            source={require('../../assets/switch-theme.json')} // Lottie animation file
            colorFilters={[
              {
                // Overriding certain color properties in the animation
                keypath: 'Layer 1/icons Outlines',
                color: '#fff',
              },
            ]}
          />
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
};

export { SwitchThemeButton };
