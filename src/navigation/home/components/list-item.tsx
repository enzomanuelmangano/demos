import { PressableScale } from 'pressto';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Screens } from '../../screens';

type ListItemProps = {
  item: (typeof Screens)[number];
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const ListItem: React.FC<ListItemProps> = React.memo(
  ({ item, onPress, style }) => {
    return (
      <PressableScale onPress={onPress}>
        <Animated.View style={[styles.container, style]}>
          <item.icon />
          <Text style={styles.label}>{item.name}</Text>
        </Animated.View>
      </PressableScale>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    height: 80,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    borderCurve: 'continuous',
    shadowColor: '#000',
    elevation: 2,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flex: 1,
    marginHorizontal: 15,
    marginTop: 20,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    marginLeft: 10,
    color: 'white',
    fontFamily: 'FiraCode-Regular',
  },
});

export { ListItem };
