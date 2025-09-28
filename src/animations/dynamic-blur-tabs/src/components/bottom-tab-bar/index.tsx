import { Dimensions, Platform, StyleSheet, View } from 'react-native';

import { type FC, useCallback } from 'react';

import { StackActions } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IsTabBarActive } from './states';
import { ScreenNames } from '../../constants/screens';
import {
  BOTTOM_BAR_HEIGHT,
  useSafeBottomBarHeight,
} from '../../hooks/use-bottom-bar-height';
import { TabBarItem } from '../bottom-tab-bar/tab-bar-item';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
export const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;
export const LINEAR_GRADIENT_COLORS = [
  'rgba(255,255,255,0)',
  'rgba(0,0,0,0.1)',
  'rgba(0,0,0,0.5)',
  'rgba(0,0,0,0.8)',
] as const;

const createScreensMap = () =>
  Object.keys(ScreenNames).reduce(
    (acc, key, index) => ({
      ...acc,
      [index]: key,
    }),
    {},
  ) as Record<number, keyof typeof ScreenNames>;

const screensMap = createScreensMap();

const BottomTabBar: FC<BottomTabBarProps> = ({ state, navigation }) => {
  const focusedIndex = useSharedValue(state.index);

  const currentIndex = state.index;

  const onTapIcon = useCallback(
    (selectedIndex: keyof typeof screensMap) => {
      const nextScreen = screensMap[selectedIndex];
      const isChangingRoute = currentIndex !== selectedIndex;
      const popsAmount = navigation
        .getState()
        .routes.find(item => item.name === nextScreen)?.state?.index;

      if (!isChangingRoute && popsAmount !== 0 && Boolean(popsAmount)) {
        navigation.dispatch(StackActions.pop(popsAmount));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigation.navigate(nextScreen as any);
    },
    [currentIndex, navigation],
  );

  const { bottom: safeBottom } = useSafeAreaInsets();

  const bottomBarSafeHeight = useSafeBottomBarHeight();
  const progress = useDerivedValue(() => {
    return withSpring(IsTabBarActive.value ? 1 : 0);
  }, [IsTabBarActive.value]);

  const paddingBottom = useDerivedValue(() => {
    return interpolate(progress.value, [0, 1], [safeBottom + 15, 0]);
  }, [safeBottom]);

  const rBarStyle = useAnimatedStyle(() => {
    const leftRight = interpolate(
      progress.value,
      [0, 1],
      [0.15 * SCREEN_WIDTH, 0],
    );
    const height = interpolate(
      progress.value,
      [0, 1],
      [BOTTOM_BAR_HEIGHT, BOTTOM_BAR_HEIGHT + safeBottom + 15],
    );
    const borderRadius = interpolate(
      progress.value,
      [0, 1],
      [0.15 * SCREEN_WIDTH, 20],
    );
    const borderWidth = interpolate(progress.value, [0, 1], [1, 0.6]);

    return {
      left: leftRight,
      right: leftRight,
      bottom: paddingBottom.value - 2,
      height: height,
      borderRadius: borderRadius,
      borderWidth: borderWidth,
    };
  });

  const rBottomViewStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(progress.value, [0, 1], [0, safeBottom + 15]),
    };
  }, [safeBottom]);

  const rBlurStyle = useAnimatedStyle(() => {
    return {
      paddingHorizontal: interpolate(progress.value, [0, 1], [0, 15]),
    };
  }, [progress.value]);

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={LINEAR_GRADIENT_COLORS}
        style={[{ height: bottomBarSafeHeight }, localStyles.gradientContainer]}
      />
      <Animated.View style={[localStyles.bottomContainer, rBarStyle]}>
        <AnimatedBlurView
          tint="systemMaterialDark"
          intensity={70}
          style={[
            localStyles.blurViewStyle,
            Platform.select({ android: localStyles.androidBlurView }),
            rBlurStyle,
          ]}>
          <View style={{ flex: 1 }}>
            <View style={localStyles.container}>
              {Object.keys(ScreenNames).map((key, index) => {
                return (
                  <TabBarItem
                    key={key}
                    screenName={key}
                    focusedIndex={focusedIndex}
                    index={index}
                    onPress={() => {
                      onTapIcon(index);
                      focusedIndex.value = index;
                    }}
                  />
                );
              })}
            </View>
            <Animated.View style={rBottomViewStyle} />
          </View>
        </AnimatedBlurView>
      </Animated.View>
    </>
  );
};

const localStyles = StyleSheet.create({
  androidBlurView: {
    backgroundColor: '#959595',
  },
  blurViewStyle: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    flex: 1,
  },
  bottomContainer: {
    borderColor: 'rgba(216, 216, 216, 0.597)',
    borderCurve: 'continuous',
    overflow: 'hidden',
    position: 'absolute',
  },
  container: {
    flexDirection: 'row',
    flex: 1,
  },
  gradientContainer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});

export { BottomTabBar };
