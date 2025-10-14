import { StyleSheet, useWindowDimensions } from 'react-native';

import { useState, useMemo } from 'react';

import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppItem } from './app-item';
import { APPS_DATA } from './constants';
import { useIsShaking } from './hooks';

import type { AppData } from './constants';

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
    <Animated.View
      style={[
        styles.gridContainer,
        styles.rowWrapper,
        {
          paddingTop: safeTop,
          paddingHorizontal: layoutConfig.containerPadding,
          paddingBottom: 300,
        },
      ]}
      layout={LinearTransition}>
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexGrow: 1,
    paddingBottom: SPACING * 2,
    width: '100%',
  },
  rowWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
