import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  FlipInXDown,
  FlipOutXDown,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

export type StatusType = 'inProgress' | 'correct' | 'wrong';

export type AnimatedCodeNumberProps = {
  code?: number;
  highlighted: boolean;
  status: SharedValue<StatusType>;
};

export const AnimatedCodeNumber: React.FC<AnimatedCodeNumberProps> = ({
  code,
  highlighted,
  status,
}) => {
  const getColorByStatus = useCallback(
    (vStatus: StatusType) => {
      'worklet';
      // If the number is highlighted, we want to show it in white
      // This has the highest priority
      if (highlighted) return '#FFFFFF';

      // Then, we want to show the number in red if the status is wrong
      // or in green if the status is correct
      if (vStatus === 'correct') {
        return '#22bb33';
      }
      if (vStatus === 'wrong') {
        return '#bb2124';
      }

      // If the number is not highlighted and the status is inProgress,
      // we want to show it in the default color
      return '#2E2B2E';
    },
    [highlighted],
  );

  const rBoxStyle = useAnimatedStyle(() => {
    return {
      // We rely on the getColorByStatus to retrieve the color based on the status
      // Then we wrap it with the withTiming function to animate the color change
      // in a smooth way
      borderColor: withTiming(getColorByStatus(status.value)),
    };
  }, [getColorByStatus]);

  return (
    <Animated.View style={[styles.container, rBoxStyle]}>
      {code != null && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(250)}>
          <Animated.Text
            entering={FlipInXDown.duration(500)
              // Go to this website and you'll see the curve I used:
              // https://cubic-bezier.com/#0,0.75,0.5,0.9
              // Basically, I want the animation to start slow, then accelerate at the end
              // Do we really need to use a curve? Every detail matters :)
              .easing(Easing.bezier(0, 0.75, 0.5, 0.9).factory())
              .build()}
            exiting={FlipOutXDown.duration(500)
              // https://cubic-bezier.com/#0.6,0.1,0.4,0.8
              // I want the animation to start fast, then decelerate at the end (opposite of the previous one)
              .easing(Easing.bezier(0.6, 0.1, 0.4, 0.8).factory())
              .build()}
            style={styles.text}>
            {code}
          </Animated.Text>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: '90%',
    width: '80%',
    borderWidth: 2,
    borderRadius: 20,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'blue',
  },
  text: {
    color: '#FFF',
    fontSize: 40,
    fontFamily: 'FiraCode-Regular',
  },
});
