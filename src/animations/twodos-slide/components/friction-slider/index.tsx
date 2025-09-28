import { Dimensions } from 'react-native';

import { useCallback } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type FrictionSliderProps = {
  onProgressChange?: ({
    clampedProgress,
    realProgress,
  }: {
    clampedProgress: number;
    realProgress: number;
  }) => void;
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

const ScreenWidth = Dimensions.get('window').width;

// I just like this spring mass value, but you can change it if you want
const SpringMass = 1.1;

const MaxTranslationFrictionThreshold = ScreenWidth / 8;
const MaxTranslationProgress = MaxTranslationFrictionThreshold * 1.8;

const MinFriction = 1;
const MaxFriction = 0.35;

// This component is about a PanGesture with a "friction effect"
export const FrictionSlider: React.FC<FrictionSliderProps> = ({
  onProgressChange,
  children,
  containerStyle,
}) => {
  const translateX = useSharedValue(0);
  // The contextX is used to store the previous translation value
  // Usually it's useful if the animation needs to keep track of the previous action.
  // In this specific case, the animation resets its value to 0 after the gesture ends
  // But if you release and before the animation ends you start a new gesture,
  // the contextX will be useful (it's just a small detail, but it's good to know about it)
  const contextX = useSharedValue(0);

  // This progressTranslateX is identical to the translateX shared value
  // But the spring animation at the end applies the overshootClamping property
  const progressTranslateX = useSharedValue(0);

  const convertTranslationToProgress = useCallback((translation: number) => {
    'worklet';
    return interpolate(
      translation,
      [-MaxTranslationProgress, 0, MaxTranslationProgress],
      [-1, 0, 1],
      Extrapolation.EXTEND,
    );
  }, []);

  const clampedProgress = useDerivedValue(() => {
    // Try to replace progressTranslateX with translateX to see the difference
    return convertTranslationToProgress(progressTranslateX.value);
  }, []);

  const realProgress = useDerivedValue(() => {
    return convertTranslationToProgress(translateX.value);
  }, []);

  // This is a reaction that triggers when the progress value changes
  // It's a kind of "useEffect" but for Reanimated values
  // I really use a lot this pattern because it helps me to keep the code organized
  // Without this approach it would be a bit annoying to fire the onProgressChange callback
  useAnimatedReaction(
    () => realProgress.value,
    (curr, prev) => {
      if (prev !== curr) {
        onProgressChange?.({
          // The clampedProgress is the one that will be used to update the Path
          // And it needs to ignore the re-bound effect
          // The realProgress is fully binded to the spring animation effect
          // And we need it to update the square rotation
          // If you look closely, if we slide a lot and then we leave the finger
          // The square will rotate a bit more to the right or left depending on the direction
          // But the path is not affected by this effect.
          // That's why we have two different progress values
          clampedProgress: clampedProgress.value,
          realProgress: realProgress.value,
        });
      }
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      // Cancels the current animation (if there's any)
      // - for instance, if the user releases the gesture and immediately starts a new one
      cancelAnimation(translateX);
      contextX.value = translateX.value;
    })
    .onUpdate(event => {
      const baseTranslation = event.translationX + contextX.value;

      // The friction effect is based on the distance that the user has moved the finger
      // The further the user moves the finger, the more friction the animation will have
      const incrementalFriction = interpolate(
        Math.abs(baseTranslation),
        [0, MaxTranslationFrictionThreshold],
        [MinFriction, MaxFriction],
        Extrapolation.CLAMP,
      );

      const translationWithFriction = baseTranslation * incrementalFriction;
      // The translateX value is the one that will be animated
      translateX.value = translationWithFriction;
      progressTranslateX.value = translationWithFriction;
    })
    .onFinalize(() => {
      // As mentioned before, the progressTranslateX is used to apply the overshootClamping property
      // And the translateX is used to keep track of the previous translation value
      translateX.value = withSpring(0, {
        mass: SpringMass,
      });
      progressTranslateX.value = withSpring(0, {
        mass: SpringMass,
        overshootClamping: true,
      });
    });

  const rTextStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: translateX.value,
        },
      ],
    };
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[rTextStyle, containerStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};
