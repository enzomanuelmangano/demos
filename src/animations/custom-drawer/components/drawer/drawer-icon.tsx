import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { type FC } from 'react';

import { useDrawerProgress } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const ICON_HEIGHT = 18;
const LINE_HEIGHT = 2;

type DrawerIconProps = {
  tintColor?: string | undefined;
};

const DrawerIcon: FC<DrawerIconProps> = ({ tintColor = '#111' }) => {
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
      Extrapolation.CLAMP,
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

  const navigation = useNavigation<any>();

  return (
    <TouchableOpacity
      onPress={() => {
        navigation.toggleDrawer();
      }}>
      <View style={styles.container}>
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: 2,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    height: ICON_HEIGHT,
    justifyContent: 'space-between',
    marginLeft: 15,
    width: 25,
  },
});

export { DrawerIcon };
