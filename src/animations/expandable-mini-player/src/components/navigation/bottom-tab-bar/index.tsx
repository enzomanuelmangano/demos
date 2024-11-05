import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BaseTabs } from '../../../constants/tabs';

import { TabItem } from './tab-item';
import { ExpandedSheet } from './expanded-sheet';
import { TabBarHeight } from './constants';

type TabBarProps = {
  activeIndex: number;
};

const TabBar = ({ activeIndex }: TabBarProps) => {
  return (
    <View style={styles.container}>
      <ExpandedSheet />
      <Animated.View style={styles.tabsContainer}>
        {BaseTabs.map((screen, index) => {
          return (
            <TabItem
              key={screen.name}
              icon={screen.icon}
              screen={screen.name}
              isActive={index === activeIndex}
            />
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: TabBarHeight,
  },
  tabsContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    bottom: 10,
  },
});

export { TabBar };
