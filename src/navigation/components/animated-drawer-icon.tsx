import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useCallback, useMemo, type FC } from 'react';

import { useDrawerProgress } from '@react-navigation/drawer';
import { useNavigation } from 'expo-router';
import { PressableGlass } from 'pressto/glass';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

const ICON_HEIGHT = 14;
const LINE_HEIGHT = 1.5;

type AnimatedDrawerIconProps = {
  tintColor?: string;
  size?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

export const AnimatedDrawerIcon: FC<AnimatedDrawerIconProps> = ({
  tintColor = '#fff',
  size = 18,
  containerStyle: containerStyleProp,
}) => {
  const navigation = useNavigation();
  const progress = useDrawerProgress();

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

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        height: ICON_HEIGHT,
        width: size,
      },
    ],
    [size],
  );

  const onPress = useCallback(() => {
    (navigation as any).toggleDrawer();
  }, [navigation]);

  return (
    <PressableGlass hitSlop={20} onPress={onPress} style={containerStyleProp}>
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
    </PressableGlass>
  );
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
