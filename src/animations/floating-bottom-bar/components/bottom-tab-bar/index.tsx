import { useWindowDimensions, StyleSheet } from 'react-native';

import { useCallback } from 'react';

import { Feather, Ionicons, Octicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedOpacityView } from './animated-opacity-view';
import { ShaderLight } from './shader-light';
import { ScreenNames } from '../../constants/screens';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const BottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const currentIndex = state.index;
  const selectedAnimatedIndex = useDerivedValue(() => {
    return withSpring(currentIndex);
  }, [currentIndex]);

  const { bottom } = useSafeAreaInsets();

  const { width: screenWidth } = useWindowDimensions();

  const tabBarWidth = screenWidth * 0.95;
  // we need to consider the tabBarWidth that is 95% of the screen width
  // and the paddingHorizontal that is 5% of the tabBarWidth
  const singleTabWidth = (tabBarWidth - 0.1 * tabBarWidth) / 5;

  const rShaderLightStyle = useAnimatedStyle(() => {
    const translateX = selectedAnimatedIndex.value * singleTabWidth;
    return {
      transform: [{ translateX: translateX }],
    };
  }, [singleTabWidth]);

  const getIconByScreenName = useCallback(
    (screenName: keyof typeof ScreenNames) => {
      switch (screenName) {
        case ScreenNames.Home:
          return <Octicons name="home" size={24} color="white" />;
        case ScreenNames.Bookmark:
          return <Feather name="bookmark" size={24} color="white" />;
        case ScreenNames.Add:
          return <Ionicons name="add-circle-outline" size={24} color="white" />;
        case ScreenNames.Profile:
          return <Octicons name="person" size={24} color="white" />;
        case ScreenNames.Settings:
          return <Ionicons name="settings-sharp" size={24} color="white" />;
      }
    },
    [],
  );

  return (
    <Animated.View
      style={[
        {
          width: tabBarWidth,
          bottom: bottom,
        },
        styles.container,
      ]}>
      <>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0.05 * tabBarWidth,
              zIndex: 10,
              height: 65,
              width: singleTabWidth,
            },
            rShaderLightStyle,
          ]}>
          <ShaderLight height={65} width={singleTabWidth} />
        </Animated.View>
        {Object.values(ScreenNames).map((screenName, index) => {
          return (
            <AnimatedOpacityView
              key={index}
              style={styles.iconContainer}
              onPress={() => {
                navigation.navigate(screenName);
              }}
              index={index}
              activeIndex={selectedAnimatedIndex}>
              {getIconByScreenName(screenName)}
            </AnimatedOpacityView>
          );
        })}
      </>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    backgroundColor: '#000000',
    borderCurve: 'continuous',
    borderRadius: 20,
    flexDirection: 'row',
    height: 65,
    paddingHorizontal: '5%',
    position: 'absolute',
  },
  iconContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export { BottomTabBar };
