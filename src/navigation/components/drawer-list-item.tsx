import { StyleSheet, Text } from 'react-native';

import { memo, type FC } from 'react';

import { atom, useAtomValue } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { createAnimatedPressable } from 'pressto';
import { interpolate } from 'react-native-reanimated';

import { AnimationItem, FilteredAnimationsAtom } from '../states/filters';

import type { StyleProp, ViewStyle } from 'react-native';

type DrawerListItemProps = {
  item: AnimationItem;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const PressableHighlight = createAnimatedPressable(
  (progress, { isSelected }) => {
    'worklet';
    const opacity = interpolate(progress, [0, 1], [0, 0.1]).toFixed(2);
    const scale = interpolate(progress, [0, 1], [1, 0.95]);

    return {
      backgroundColor: `rgba(255,255,255,${isSelected ? 0.1 : opacity})`,
      transform: [{ scale }],
    };
  },
);

const IsItemVisible = atomFamily((itemSlug: string) => {
  return atom(get => {
    const allAnimations = get(FilteredAnimationsAtom);
    return allAnimations.some(item => item.slug === itemSlug);
  });
});

const DrawerListItem: FC<DrawerListItemProps> = memo(
  ({ item, onPress, style }) => {
    const isItemVisible = useAtomValue(IsItemVisible(item.slug));

    if (!isItemVisible) {
      return null;
    }

    return (
      <PressableHighlight style={[styles.container, style]} onPress={onPress}>
        <item.icon />
        <Text style={styles.text}>{item.name}</Text>
        {item.alert && <Text style={styles.alert}>⚠️</Text>}
      </PressableHighlight>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.item.slug === nextProps.item.slug;
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
    borderCurve: 'continuous',
    borderRadius: 12,
    flexDirection: 'row',
    flex: 1,
    marginRight: 10,
    marginVertical: 5,
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
