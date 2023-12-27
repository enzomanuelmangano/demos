import { useDrawerProgress } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolate,
  useAnimatedStyle,
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';

const ICON_HEIGHT = 18;
const LINE_HEIGHT = 2;

type DrawerIconProps = {
  tintColor?: string | undefined;
};

const DrawerIcon: React.FC<DrawerIconProps> = ({ tintColor = '#111' }) => {
  // Get the drawer progress from the navigation drawer
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
      Extrapolate.CLAMP,
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

  // Get the navigation object from the useNavigation hook
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();

  return (
    <TouchableOpacity
      onPress={() => {
        // Toggle the drawer when the icon is pressed
        navigation.toggleDrawer();
      }}>
      <View style={styles.container}>
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: ICON_HEIGHT,
    width: 25,
    marginLeft: 15,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    height: 2,
  },
});

export { DrawerIcon };
