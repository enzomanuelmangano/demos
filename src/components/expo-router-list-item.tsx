import { PressableScale } from 'pressto';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

type ExpoRouterListItemProps = {
  item: {
    id: number;
    name: string;
    icon: () => React.JSX.Element;
    alert?: boolean;
  };
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const ExpoRouterListItem: React.FC<ExpoRouterListItemProps> = React.memo(
  ({ item, onPress, style }) => {
    return (
      <PressableScale onPress={onPress}>
        <Animated.View style={[styles.container, style]}>
          <item.icon />
          <Text style={styles.text}>{item.name}</Text>
          {item.alert && <Text style={styles.alert}>⚠️</Text>}
        </Animated.View>
      </PressableScale>
    );
  },
);

ExpoRouterListItem.displayName = 'ExpoRouterListItem';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 16,
    flex: 1,
  },
  alert: {
    fontSize: 18,
    marginLeft: 8,
  },
});

export { ExpoRouterListItem };
