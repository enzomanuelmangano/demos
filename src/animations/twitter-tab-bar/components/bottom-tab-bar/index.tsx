import { Dimensions, StyleSheet } from 'react-native';

import { type FC, memo, type ReactNode, useCallback, useEffect } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenNames } from '../../constants/screens';
import { useTheme } from '../theme-provider';
import { useActiveTabBarContext } from './active-tab-bar-provider';
import { BottomFloatingButton } from './floating-button';

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
}

const BottomTabBar: FC<CustomBottomTabBarProps> = ({
  activeTabIndex,
  onTabPress,
}) => {
  const focusedIndex = useSharedValue(activeTabIndex);
  const { isActive } = useActiveTabBarContext();
  const { colors } = useTheme();
  const floatingProgress = useSharedValue(0);

  useEffect(() => {
    focusedIndex.set(activeTabIndex);
  }, [activeTabIndex, focusedIndex]);

  const onTapIcon = useCallback(
    (selectedIndex: keyof typeof screensMap) => {
      const nextScreen = screensMap[selectedIndex];

      isActive.set(true);
      if (nextScreen === 'Message') {
        floatingProgress.set(
          withTiming(1, {
            duration: 500,
          }),
        );
      } else {
        floatingProgress.set(
          withTiming(0, {
            duration: 500,
          }),
        );
      }

      onTabPress(nextScreen);
    },
    [floatingProgress, isActive, onTabPress],
  );

  const { bottom: safeBottom } = useSafeAreaInsets();

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withSpring(
            isActive.get() ? 0 : BOTTOM_BAR_HEIGHT + safeBottom,
            {
              dampingRatio: 1,
              duration: 500,
            },
          ),
        },
      ],
    };
  }, [safeBottom]);

  const rFloatingActionStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isActive.get() ? 1 : 0, {
            overshootClamping: true,
          }),
        },
      ],
    };
  }, []);

  return (
    <>
      <BottomFloatingButton
        onSelect={item => {
          console.log({ item });
        }}
        style={[
          {
            position: 'absolute',
            bottom: BOTTOM_BAR_HEIGHT + safeBottom / 2,
            right: 16,
            height: 64,
            aspectRatio: 1,
            backgroundColor: colors.primary,
            borderRadius: 32,
          },
          rFloatingActionStyle,
        ]}
        progress={floatingProgress}
      />

      <Animated.View
        style={[
          localStyles.container,
          {
            backgroundColor: colors.card,
            paddingBottom: safeBottom / 2,
          },
          rContainerStyle,
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
                focusedIndex.set(index);
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
      return focusedIndex.get() === index;
    }, [index]);

    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isFocused.get() ? 1 : 0.3),
      };
    }, []);

    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <PressableScale
          testID={`twitter-tab-bar-tab-${iconName.toLowerCase()}`}
          style={localStyles.fillCenter}
          onPress={onPress}>
          <MaterialIcons
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            name={iconName.toLowerCase()}
            size={28}
            color={textColor}
          />
        </PressableScale>
      </Animated.View>
    );
  },
);

const localStyles = StyleSheet.create({
  container: {
    bottom: 0,
    flexDirection: 'row',
    height: BOTTOM_BAR_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  fill: {
    flex: 1,
  },
  fillCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});

export { BottomTabBar };
