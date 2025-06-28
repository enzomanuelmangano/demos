import { ScrollView, StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPS_DATA as items } from '../../constants';
import { BouncyView } from '../../components/bouncy-item';

import { AppItem } from './app-item';
import { LayoutConfig, NUM_COLUMNS, SPACING } from './constants';

/**
 * AppsList component displays a grid of app items with bouncy animations
 */
export const AppsList = () => {
  const { top: safeTop } = useSafeAreaInsets();

  /**
   * Group items into rows for proper grid layout
   * Each row contains NUM_COLUMNS items
   */
  const itemRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < items.length; i += NUM_COLUMNS) {
      rows.push(items.slice(i, i + NUM_COLUMNS));
    }
    return rows;
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.gridContainer,
          {
            paddingTop: safeTop + 4,
            paddingHorizontal: LayoutConfig.containerPadding,
            paddingBottom: 300,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {itemRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={[
              styles.row,
              {
                justifyContent: 'flex-start',
                zIndex: Math.round(
                  itemRows.length - Math.abs(rowIndex - itemRows.length / 2),
                ),
              },
            ]}>
            {row.map((item, itemIndex) => (
              <BouncyView key={itemIndex}>
                <View
                  key={itemIndex}
                  style={[
                    {
                      width: LayoutConfig.itemSize,
                      padding: SPACING + 6,
                    },
                    itemIndex < row.length - 1 && {
                      marginRight: LayoutConfig.spacing,
                    },
                  ]}>
                  <AppItem key={itemIndex} item={item} />
                </View>
              </BouncyView>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
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
