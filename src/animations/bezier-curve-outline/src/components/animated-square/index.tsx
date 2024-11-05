import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { PressableScale } from 'pressto';

import { AnimatedBlurView } from '../animated-blur-view';

import { ChessboardLayout } from './chessboard-layout';

type AnimatedSquareProps = {
  progress: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  onPress: () => void;
};

export const AnimatedSquare = ({
  progress,
  onPress,
  width,
  height,
}: AnimatedSquareProps) => {
  const blurIntensity = useDerivedValue(() => {
    return interpolate(progress.value, [0, 0.7, 1], [0, 40, 0]);
  }, [progress]);

  const rContainerStyle = useAnimatedStyle(
    () => ({
      width: width.value,
      height: height.value,
    }),
    [progress],
  );

  const rIconStyle = useAnimatedStyle(
    () => ({
      opacity: 1 - progress.value,
    }),
    [progress],
  );

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.container, rContainerStyle]}>
      <View style={styles.content}>
        <AnimatedBlurView intensity={blurIntensity} style={styles.blurView} />
        <ChessboardLayout blackColor="#AD8969" whiteColor="#ECD9B9" />
        <Animated.View style={[styles.iconContainer, rIconStyle]}>
          <Image
            source={require('../../../assets/pawn.svg')}
            style={styles.icon}
          />
        </Animated.View>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: '#a5a5a5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  iconContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#AD8969',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    marginBottom: 4,
  },
});
