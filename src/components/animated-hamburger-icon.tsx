import { useDrawerProgress } from '@react-navigation/drawer';
import { PressableOpacity } from 'pressto';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

const ICON_HEIGHT = 14;
const LINE_HEIGHT = 1.5;

type AnimatedHamburgerIconProps = {
  tintColor?: string;
  onPress?: () => void;
  size?: number;
};

export const AnimatedHamburgerIcon: React.FC<AnimatedHamburgerIconProps> = ({
  tintColor = '#fff',
  onPress,
  size = 18,
}) => {
  // Get the drawer progress from the expo router drawer
  const drawerProgress = useDrawerProgress();

  // Derive a reanimated value from the drawer progress
  const progress = useDerivedValue(() => {
    return (drawerProgress as SharedValue<number>).value;
  }, []);

  // Define the animated style for the top bar
  const topBarStyle = useAnimatedStyle(() => {
    // Interpolate the rotation based on the progress value
    const rotateInterpolation = interpolate(
      progress.value,
      [0, 1],
      [0, -Math.PI / 4],
    );

    return {
      transform: [
        // Translate the bar vertically based on the progress value
        {
          translateY: (progress.value * (ICON_HEIGHT - LINE_HEIGHT)) / 2,
        },
        // Rotate the bar based on the interpolated rotation value
        { rotate: `${rotateInterpolation}rad` },
      ],
    };
  });

  // Define the animated style for the middle bar
  const middleBarStyle = useAnimatedStyle(() => {
    // Interpolate the opacity based on the progress value
    const opacityInterpolation = interpolate(
      progress.value,
      [0, 0.5],
      [1, 0],
      'clamp',
    );

    return {
      opacity: opacityInterpolation,
    };
  });

  // Define the animated style for the bottom bar
  const bottomBarStyle = useAnimatedStyle(() => {
    // Interpolate the rotation based on the progress value
    const rotateInterpolation = interpolate(
      progress.value,
      [0, 1],
      [0, Math.PI / 4],
    );

    return {
      transform: [
        // Translate the bar vertically based on the progress value
        {
          translateY: -(progress.value * (ICON_HEIGHT - LINE_HEIGHT)) / 2,
        },
        // Rotate the bar based on the interpolated rotation value
        { rotate: `${rotateInterpolation}rad` },
      ],
    };
  });

  const containerStyle = [
    styles.container,
    {
      height: ICON_HEIGHT,
      width: size,
    },
  ];

  const content = (
    <View style={containerStyle}>
      {/* Animated top bar */}
      <Animated.View
        style={[
          {
            backgroundColor: tintColor,
          },
          styles.bar,
          topBarStyle,
        ]}
      />
      {/* Animated middle bar */}
      <Animated.View
        style={[
          {
            backgroundColor: tintColor,
          },
          styles.bar,
          middleBarStyle,
        ]}
      />
      {/* Animated bottom bar */}
      <Animated.View
        style={[
          {
            backgroundColor: tintColor,
          },
          styles.bar,
          bottomBarStyle,
        ]}
      />
    </View>
  );

  if (onPress) {
    return (
      <PressableOpacity hitSlop={20} onPress={onPress}>
        {content}
      </PressableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    height: LINE_HEIGHT,
  },
});
