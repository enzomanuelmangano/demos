import { StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { useState, useMemo } from 'react';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppItem } from './app-item';
import type { AppData } from './constants';
import { APPS_DATA } from './constants';
import { useIsShaking } from './hooks';

/** Grid layout constants */
const SPACING = 8;
const NUM_COLUMNS = 4;

/**
 * AppsList component displays a grid of app items that can be deleted
 * through a shake interaction pattern
 */
export const AppsList = () => {
  const [items, setItems] = useState<AppData[]>(APPS_DATA);
  const { toggleShaking, stopShaking } = useIsShaking();
  const { width: screenWidth } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();

  /**
   * Calculate layout dimensions based on screen width
   */
  const layoutConfig = useMemo(() => {
    const horizontalPadding = SPACING * 2;
    const availableWidth = screenWidth - horizontalPadding;
    const spacing = SPACING;

    // Calculate item size based on available width and fixed number of columns
    const itemSize = Math.floor(
      (availableWidth - spacing * (NUM_COLUMNS - 1)) / NUM_COLUMNS - 2,
    );

    return {
      itemSize,
      spacing,
      containerPadding: horizontalPadding / 2,
    };
  }, [screenWidth]);

  return (
    <Pressable onPress={stopShaking}>
      <Animated.ScrollView
        contentContainerStyle={[
          styles.gridContainer,
          styles.rowWrapper,
          {
            paddingTop: safeTop,
            paddingHorizontal: layoutConfig.containerPadding,
            paddingBottom: 300,
          },
        ]}
        layout={LinearTransition}
        showsVerticalScrollIndicator={false}>
        {items.map(item => (
          <AppItem
            key={item.id}
            item={item}
            style={{
              width: layoutConfig.itemSize,
              marginRight: layoutConfig.spacing,
              marginBottom: layoutConfig.spacing,
              padding: SPACING + 6,
            }}
            onLongPress={toggleShaking}
            onDelete={() => {
              stopShaking();
              setTimeout(() => {
                // Just wait until the animation is finished
                setItems(prev => prev.filter(i => i.id !== item.id));
              }, 150);
            }}
          />
        ))}
      </Animated.ScrollView>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: SPACING * 2,
  },
  rowWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
