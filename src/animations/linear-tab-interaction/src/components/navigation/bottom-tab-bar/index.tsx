import { StyleSheet, View } from 'react-native';

import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { TabItem } from './tab-item';
import {
  BaseTabs,
  isEmptyTab,
  SecondLayerTabs,
  ThirdLayerTabs,
} from '../../../constants/tabs';
import { useSharedTransitionProgress } from '../../../navigation/custom/shared-progress';

const tabBarHeight = 80;

type TabBarProps = {
  activeScreenName: string;
};

const TabBar = ({ activeScreenName }: TabBarProps) => {
  const progress = useSharedTransitionProgress();

  const rFirstLayerTabStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [1, 0]);
    return {
      opacity: opacity ** 2,
      pointerEvents: opacity === 0 ? 'none' : 'auto',
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [0, -25]) },
      ],
    };
  });

  const rThirdLayerTabStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 1]);
    return {
      opacity: opacity ** 2,
      pointerEvents: opacity === 0 ? 'none' : 'auto',
      transform: [{ translateX: interpolate(progress.value, [0, 1], [25, 0]) }],
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        {SecondLayerTabs.map((screen, index) => {
          if (isEmptyTab(screen))
            return <View key={index} style={styles.empty} />;

          return (
            <TabItem
              key={screen.name}
              icon={screen.icon}
              screen={screen.name}
              isActive={screen.name === activeScreenName}
            />
          );
        })}
      </View>
      <Animated.View style={[styles.tabsContainer, rFirstLayerTabStyle]}>
        {BaseTabs.map(screen => {
          return (
            <TabItem
              key={screen.name}
              icon={screen.icon}
              screen={screen.name}
              opacity={screen.name === 'note' ? 0 : 1}
              isActive={screen.name === activeScreenName}
            />
          );
        })}
      </Animated.View>

      <Animated.View style={[styles.tabsContainer, rThirdLayerTabStyle]}>
        {ThirdLayerTabs.map((screen, index) => {
          if (isEmptyTab(screen))
            return <View key={index} style={styles.empty} />;

          return (
            <TabItem
              key={screen.name}
              icon={screen.icon}
              screen={screen.name}
              opacity={screen.name === 'note' ? 0 : 1}
              isActive={screen.name === activeScreenName}
            />
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    flexDirection: 'row',
    height: tabBarHeight,
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  empty: {
    flex: 1,
    pointerEvents: 'none',
  },
  tabsContainer: {
    ...StyleSheet.absoluteFillObject,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export { TabBar };
