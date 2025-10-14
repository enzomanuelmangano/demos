import { Dimensions, StyleSheet } from 'react-native';

import { type FC, memo, type ReactNode, useCallback, useEffect } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { PressableOpacity } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenNames } from '../../constants/screens';

export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;
export const BOTTOM_BAR_HEIGHT = IS_SMALL_DEVICE ? 80 : 95;

const screensMap = Object.keys(ScreenNames).reduce((acc, key, index) => {
  return {
    ...acc,
    [index]: key,
  };
}, {}) as Record<number, keyof typeof ScreenNames>;

interface CustomBottomTabBarProps {
  activeTabIndex: number;
  onTabPress: (tabName: string) => void;
  colors: {
    card: string;
    text: string;
  };
}

const BottomTabBar: FC<CustomBottomTabBarProps> = ({
  activeTabIndex,
  onTabPress,
  colors,
}) => {
  const focusedIndex = useSharedValue(activeTabIndex);

  useEffect(() => {
    focusedIndex.value = activeTabIndex;
  }, [activeTabIndex, focusedIndex]);

  const onTapIcon = useCallback(
    (selectedIndex: keyof typeof screensMap) => {
      const nextScreen = screensMap[selectedIndex];
      onTabPress(nextScreen);
    },
    [onTabPress],
  );

  const { bottom: safeBottom } = useSafeAreaInsets();

  return (
    <>
      <Animated.View
        style={[
          localStyles.container,
          {
            backgroundColor: colors.card,
            paddingBottom: safeBottom / 2,
          },
        ]}>
        {Object.keys(ScreenNames).map((key, index) => {
          return (
            <TabBarItem
              key={key}
              iconName={key}
              focusedIndex={focusedIndex}
              index={index}
              textColor={colors.text}
              onPress={() => {
                onTapIcon(index);
                focusedIndex.value = index;
              }}
            />
          );
        })}
      </Animated.View>
    </>
  );
};

type TabBarItemProps = {
  children?: ReactNode;
  onPress: () => void;
  focusedIndex: SharedValue<number>;
  index: number;
  iconName: string;
  textColor: string;
};

const TabBarItem: FC<TabBarItemProps> = memo(
  ({ onPress, focusedIndex, index, iconName, textColor }) => {
    const isFocused = useDerivedValue(() => {
      return focusedIndex.value === index;
    }, [index]);

    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isFocused.value ? 1 : 0.3),
      };
    }, []);

    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <PressableOpacity style={localStyles.fillCenter} onPress={onPress}>
          <MaterialIcons
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            name={iconName.toLowerCase()}
            size={28}
            color={textColor}
          />
        </PressableOpacity>
      </Animated.View>
    );
  },
);

const localStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: BOTTOM_BAR_HEIGHT,
  },
  fill: {
    flex: 1,
  },
  fillCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});

export { BottomTabBar };
