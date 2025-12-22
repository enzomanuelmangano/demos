import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BG_COLOR_DARK } from '../constants';

interface ToggleButtonProps {
  progress: SharedValue<number>;
  onPress: () => void;
}

export const ToggleButton = ({ progress, onPress }: ToggleButtonProps) => {
  const teamIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.25],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const scanIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0.2, 0.45],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const labelConnectStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 0.2],
          [0, 8],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const labelShareStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0.25, 0.5],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0.25, 0.5],
          [8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const buttonPulseStyle = useAnimatedStyle(() => {
    const pulse =
      progress.value > 0.95
        ? withRepeat(
            withSequence(
              withTiming(1.05, { duration: 1000 }),
              withTiming(1, { duration: 1000 }),
            ),
            -1,
            true,
          )
        : withTiming(1, { duration: 300 });

    return {
      transform: [{ scale: pulse }],
    };
  });

  return (
    <View style={styles.buttonContainer}>
      <Animated.View style={buttonPulseStyle}>
        <PressableScale style={styles.button} onPress={onPress}>
          <Animated.View style={[styles.iconContainer, teamIconStyle]}>
            <Ionicons name="heart" size={22} color="#fff" />
          </Animated.View>

          <Animated.View style={[styles.iconContainer, scanIconStyle]}>
            <Ionicons name="qr-code" size={22} color="#fff" />
          </Animated.View>
        </PressableScale>
      </Animated.View>

      <View style={styles.labelContainer}>
        <Animated.Text style={[styles.label, labelConnectStyle]}>
          Connect
        </Animated.Text>
        <Animated.Text
          style={[styles.label, styles.labelAbsolute, labelShareStyle]}>
          Share
        </Animated.Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: BG_COLOR_DARK,
    borderRadius: 28,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 3,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  buttonContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    bottom: 50,
    position: 'absolute',
  },
  iconContainer: {
    position: 'absolute',
  },
  label: {
    color: BG_COLOR_DARK,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  labelAbsolute: {
    position: 'absolute',
  },
  labelContainer: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    marginTop: 12,
  },
});
