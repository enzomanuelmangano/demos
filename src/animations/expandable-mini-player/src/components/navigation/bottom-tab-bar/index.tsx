import { StyleSheet, View } from 'react-native';

import { PressablesGroup } from 'pressto';
import Animated from 'react-native-reanimated';

import { TabBarHeight } from './constants';
import { ExpandedSheet } from './expanded-sheet';
import { TabItem } from './tab-item';
import { BaseTabs } from '../../../constants/tabs';

type TabBarProps = {
  onTabPress: (routeName: string) => void;
};

const TabBar = ({ onTabPress }: TabBarProps) => {
  return (
    <View style={styles.container}>
      <ExpandedSheet />
      <PressablesGroup>
        <Animated.View style={styles.tabsContainer}>
          {BaseTabs.map(screen => {
            return (
              <TabItem
                key={screen.name}
                icon={screen.icon}
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
