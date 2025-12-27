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
            <Ionicons name="scan" size={28} color="#1a1a1a" />
          </Animated.View>

          <Animated.View style={[styles.iconContainer, scanIconStyle]}>
            <Ionicons name="qr-code" size={28} color="#1a1a1a" />
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
    backgroundColor: '#ffffff',
    borderColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 32,
    borderWidth: 1,
    boxShadow: '0px 7px 12px rgba(0, 0, 0, 0.08)',
    elevation: 3,
    height: 64,
    justifyContent: 'center',
    width: 64,
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
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
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
