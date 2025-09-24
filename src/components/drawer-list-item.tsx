import { createAnimatedPressable } from 'pressto';
import { type FC, type JSX, memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { interpolate } from 'react-native-reanimated';

type ExpoRouterListItemProps = {
  item: {
    id: number;
    name: string;
    icon: () => JSX.Element;
    alert?: boolean;
  };
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const PressableHighlight = createAnimatedPressable(progress => {
  'worklet';
  const opacity = interpolate(progress.value, [0, 1], [0, 0.1]).toFixed(2);
  const scale = interpolate(progress.value, [0, 1], [1, 0.95]);

  return {
    backgroundColor: `rgba(255,255,255,${opacity})`,
    transform: [{ scale }],
  };
});

const DrawerListItem: FC<ExpoRouterListItemProps> = memo(
  ({ item, onPress, style }) => {
    return (
      <PressableHighlight style={[styles.container, style]} onPress={onPress}>
        <item.icon />
        <Text style={styles.text}>{item.name}</Text>
        {item.alert && <Text style={styles.alert}>⚠️</Text>}
      </PressableHighlight>
    );
  },
);

DrawerListItem.displayName = 'DrawerListItem';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  alert: {
    fontSize: 16,
    marginLeft: 6,
  },
});

export { DrawerListItem };
