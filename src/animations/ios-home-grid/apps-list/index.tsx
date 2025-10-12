import { StyleSheet, useWindowDimensions } from 'react-native';

import { useMemo } from 'react';

import { useNavigation } from '@react-navigation/native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppItem } from './app-item';
import { APPS_DATA as items } from './constants';
import { useCustomNavigation } from '../navigation/expansion-provider';

import type { RootStackParamList } from '../app-detail-screen';
import type { AppData } from './constants';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const SPACING = 8;
const NUM_COLUMNS = 4;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const AppsList = () => {
  const { width: screenWidth } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  const layoutConfig = useMemo(() => {
    const horizontalPadding = SPACING * 2;
    const availableWidth = screenWidth - horizontalPadding;

    const totalSpacing = SPACING * (NUM_COLUMNS - 1);
    const itemSize = Math.floor((availableWidth - totalSpacing) / NUM_COLUMNS);

    return {
      itemSize,
      spacing: SPACING,
      containerPadding: horizontalPadding / 2,
    };
  }, [screenWidth]);

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
      <Animated.View
        style={[
          styles.gridContainer,
          {
            paddingTop: safeTop + 4,
            paddingHorizontal: layoutConfig.containerPadding,
            paddingBottom: 300,
          },
        ]}
        layout={LinearTransition}>
        {itemRows.map((row, rowIndex) => (
          <Animated.View
            key={rowIndex}
            style={[
              styles.row,
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
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexGrow: 1,
    paddingBottom: SPACING * 2,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING,
  },
});
