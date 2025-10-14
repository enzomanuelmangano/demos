import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useMemo } from 'react';

import {
  Blur,
  Circle,
  ColorMatrix,
  Group,
  Paint,
  Path,
  rect,
  Skia,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useDerivedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Touchable from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import { BottomTabItem } from './bottom-tab-item';
import { ScreenNames } from '../../constants/screens';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type React from 'react';

const BOTTOM_BAR_HEIGHT_OFFSET = 50;

const BottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const { width: screenWidth } = useWindowDimensions();

  const { bottom } = useSafeAreaInsets();
  const bottomTabBarHeight = 65 + bottom / 2;

  const tabBarScreens = Object.keys(ScreenNames).length;

  const currentIndex = state.index;
  const animatedIndex = useDerivedValue(() => {
    return withSpring(currentIndex);
  }, [currentIndex]);

  const animatedCircleCx = useDerivedValue(() => {
    return (
      (screenWidth / tabBarScreens) * animatedIndex.value +
      screenWidth / (tabBarScreens * 2)
    );
  }, [screenWidth, animatedIndex, tabBarScreens]);

  const bottomTabPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    path.addRect(
      rect(
        -10,
        45,
        screenWidth + BOTTOM_BAR_HEIGHT_OFFSET,
        bottomTabBarHeight + BOTTOM_BAR_HEIGHT_OFFSET,
      ),
    );
    path.addCircle(
      animatedCircleCx.value,
      BOTTOM_BAR_HEIGHT_OFFSET,
      BOTTOM_BAR_HEIGHT_OFFSET,
    );

    return path;
  }, [screenWidth, bottomTabBarHeight, animatedCircleCx]);

  const paint = useMemo(() => {
    return (
      <Paint>
        <Blur blur={5} />
        <ColorMatrix
          matrix={[
            // R, G, B, A, Position
            // prettier-ignore
            1, 0, 0, 0, 0,
            // prettier-ignore
            0, 1, 0, 0, 0,
            // prettier-ignore
            0, 0, 1, 0, 0,
            // prettier-ignore
            0, 0, 0, 20, -10,
          ]}
        />
      </Paint>
    );
  }, []);

  const navigateTo = (
    screenName: (typeof ScreenNames)[keyof typeof ScreenNames],
  ) => {
    navigation.navigate(screenName);
  };

  return (
    <>
      <Touchable.Canvas
        style={[
          styles.container,
          {
            height: bottomTabBarHeight + BOTTOM_BAR_HEIGHT_OFFSET,
          },
        ]}>
        <Group layer={paint}>
          <Path path={bottomTabPath} color="white" />
        </Group>
        <Circle
          cx={animatedCircleCx}
          cy={BOTTOM_BAR_HEIGHT_OFFSET}
          r={43}
          color={'#7E6CE2'}
        />
        {Object.values(ScreenNames).map((screenName, index) => {
          return (
            <BottomTabItem
              index={index}
              currentIndex={currentIndex}
              x={(screenWidth / tabBarScreens) * index}
              y={BOTTOM_BAR_HEIGHT_OFFSET}
              onTap={() => {
                'worklet';
                scheduleOnRN(navigateTo, screenName);
                scheduleOnRN(Haptics.selectionAsync);
              }}
              height={bottomTabBarHeight}
              width={screenWidth / tabBarScreens}
              key={screenName}
            />
          );
        })}
      </Touchable.Canvas>
      <View
        style={{
          width: '100%',
          height: bottomTabBarHeight,
          zIndex: -5,
          opacity: 0,
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    elevation: 5,
    left: 0,
    position: 'absolute',
    right: 0,
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: {
      width: 0,
      height: -10,
    },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    width: '100%',
  },
});

export { BottomTabBar };
