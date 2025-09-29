import { StyleSheet, Text } from 'react-native';

import { type FC, type JSX, memo } from 'react';

import { createAnimatedPressable } from 'pressto';
import {
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type ExpoRouterListItemProps = {
  item: {
    id: number;
    name: string;
    icon: () => JSX.Element;
    alert?: boolean;
  };
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  selectedItemId: SharedValue<number>;
};

const PressableHighlight = createAnimatedPressable(progress => {
  'worklet';
  const scale = interpolate(progress.value, [0, 1], [1, 0.95]);

  return {
    transform: [{ scale }],
  };
});

const DrawerListItem: FC<ExpoRouterListItemProps> = memo(
  ({ item, onPress, style, selectedItemId }) => {
    const animatedStyle = useAnimatedStyle(() => {
      const isSelected = selectedItemId.value === item.id;
      return {
        backgroundColor: isSelected ? 'rgba(69, 69, 69, 0.3)' : 'transparent',
      };
    });

    return (
      <PressableHighlight
        style={[styles.container, style, animatedStyle]}
        onPress={onPress}>
        <item.icon />
        <Text style={styles.text}>{item.name}</Text>
        {item.alert && <Text style={styles.alert}>⚠️</Text>}
      </PressableHighlight>
    );
  },
);

DrawerListItem.displayName = 'DrawerListItem';

const styles = StyleSheet.create({
  alert: {
    fontSize: 16,
    marginLeft: 6,
  },
  container: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    flexDirection: 'row',
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    color: 'white',
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
});

export { DrawerListItem };
