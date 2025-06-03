import { StyleSheet, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../app-detail-screen';
import { useCustomNavigation } from '../navigation/expansion-provider';

import { AppItem } from './app-item';
import type { AppData } from './constants';
import { APPS_DATA as items } from './constants';

/** Grid layout constants */
const SPACING = 8;
const NUM_COLUMNS = 4;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * AppsList component displays a grid of app
 */
export const AppsList = () => {
  const { width: screenWidth } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  /**
   * Calculate layout dimensions based on screen width
   */
  const layoutConfig = useMemo(() => {
    const horizontalPadding = SPACING * 2;
    const availableWidth = screenWidth - horizontalPadding;

    // Calculate item size based on available width and fixed number of columns
    const totalSpacing = SPACING * (NUM_COLUMNS - 1);
    const itemSize = Math.floor((availableWidth - totalSpacing) / NUM_COLUMNS);

    return {
      itemSize,
      spacing: SPACING,
      containerPadding: horizontalPadding / 2,
    };
  }, [screenWidth]);

  /**
   * Group items into rows for proper grid layout
   */
  const itemRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < items.length; i += NUM_COLUMNS) {
      rows.push(items.slice(i, i + NUM_COLUMNS));
    }
    return rows;
  }, []);

  const handleItemPress = (item: AppData) => {
    navigation.navigate('AppDetail', { item });
  };

  const { springProgress } = useCustomNavigation();
  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: 1 - springProgress.value * 0.05 },
        {
          translateY: springProgress.value * 5,
        },
      ],
    };
  });

  return (
    <Animated.View style={[rStyle, { flex: 1, backgroundColor: '#fafafa' }]}>
      <Animated.ScrollView
        contentContainerStyle={[
          styles.gridContainer,
          {
            paddingTop: safeTop + 4,
            paddingHorizontal: layoutConfig.containerPadding,
            paddingBottom: 300,
          },
        ]}
        layout={LinearTransition}
        showsVerticalScrollIndicator={false}>
        {itemRows.map((row, rowIndex) => (
          <Animated.View
            key={rowIndex}
            style={[
              styles.row,
              // Only center if the row has the full number of columns
              row.length < NUM_COLUMNS && { justifyContent: 'flex-start' },
            ]}
            layout={LinearTransition}>
            {row.map((item, itemIndex) => (
              <AppItem
                key={item.id}
                item={item}
                style={[
                  {
                    width: layoutConfig.itemSize,
                    padding: SPACING + 6,
                  },
                  itemIndex < row.length - 1 && {
                    marginRight: layoutConfig.spacing,
                  },
                ]}
                onPress={() => handleItemPress(item)}
              />
            ))}
          </Animated.View>
        ))}
      </Animated.ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: SPACING * 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING,
  },
});
