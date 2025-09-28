import { StyleSheet, View } from 'react-native';

import { type FC } from 'react';

import { useDrawerProgress } from '@react-navigation/drawer';
import { PressableOpacity } from 'pressto';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const ICON_HEIGHT = 14;
const LINE_HEIGHT = 1.5;

type AnimatedHamburgerIconProps = {
  tintColor?: string;
  onPress?: () => void;
  size?: number;
};

export const AnimatedHamburgerIcon: FC<AnimatedHamburgerIconProps> = ({
  tintColor = '#fff',
  onPress,
  size = 18,
}) => {
  const drawerProgress = useDrawerProgress();

  const progress = useDerivedValue(() => {
    return (drawerProgress as SharedValue<number>).value;
  }, []);

  const topBarStyle = useAnimatedStyle(() => {
    const rotateInterpolation = interpolate(
      progress.value,
      [0, 1],
      [0, -Math.PI / 4],
    );

    return {
      transform: [
        {
          translateY: (progress.value * (ICON_HEIGHT - LINE_HEIGHT)) / 2,
        },
        { rotate: `${rotateInterpolation}rad` },
      ],
    };
  });

  const middleBarStyle = useAnimatedStyle(() => {
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

  const bottomBarStyle = useAnimatedStyle(() => {
    const rotateInterpolation = interpolate(
      progress.value,
      [0, 1],
      [0, Math.PI / 4],
    );

    return {
      transform: [
        {
          translateY: -(progress.value * (ICON_HEIGHT - LINE_HEIGHT)) / 2,
        },
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
      <Animated.View
        style={[
          {
            backgroundColor: tintColor,
          },
          styles.bar,
          topBarStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            backgroundColor: tintColor,
          },
          styles.bar,
          middleBarStyle,
        ]}
      />
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
  bar: {
    height: LINE_HEIGHT,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
