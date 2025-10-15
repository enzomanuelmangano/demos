import { StyleSheet, View } from 'react-native';

import { PressablesGroup } from 'pressto';
import Animated from 'react-native-reanimated';

import { TabBarHeight } from './constants';
import { ExpandedSheet } from './expanded-sheet';
import { TabItem } from './tab-item';
import { BaseTabs } from '../../../constants/tabs';

type TabBarProps = {
  activeIndex: number;
  onTabPress: (routeName: string) => void;
};

const TabBar = ({ activeIndex, onTabPress }: TabBarProps) => {
  return (
    <View style={styles.container}>
      <ExpandedSheet />
      <PressablesGroup>
        <Animated.View style={styles.tabsContainer}>
          {BaseTabs.map((screen, index) => {
            return (
              <TabItem
                key={screen.name}
                icon={screen.icon}
                screen={screen.name}
                isActive={index === activeIndex}
                onPress={() => onTabPress(screen.name)}
              />
            );
          })}
        </Animated.View>
      </PressablesGroup>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    flexDirection: 'row',
    height: TabBarHeight,
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tabsContainer: {
    ...StyleSheet.absoluteFillObject,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export { TabBar };
