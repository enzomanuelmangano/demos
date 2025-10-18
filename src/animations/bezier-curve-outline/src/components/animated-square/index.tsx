import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { PressableScale } from 'pressto';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import { AnimatedBlurView } from '../animated-blur-view';
import { ChessboardLayout } from './chessboard-layout';

import type { SharedValue } from 'react-native-reanimated';

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
  const blurIntensity = useDerivedValue<number | undefined>(() => {
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
  blurView: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  container: {
    backgroundColor: '#a5a5a5',
    borderCurve: 'continuous',
    borderRadius: 20,
    boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  },
  content: {
    borderCurve: 'continuous',
    borderRadius: 20,
    flex: 1,
    overflow: 'hidden',
  },
  icon: {
    height: 48,
    marginBottom: 4,
    width: 48,
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: '#AD8969',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
