import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import type { AppData } from '../../constants';

/**
 * Props for the AppItem component
 * @property item - Data for the app including colors and ID
 * @property style - Additional styles to apply to the container
 */
interface AppItemProps {
  item: AppData;
  style?: StyleProp<ViewStyle>;
}

/**
 * AppItem component renders a single app icon with a colored background
 * Each item displays as a rounded square with the app's designated color
 */
export const AppItem: React.FC<AppItemProps> = ({ item, style }) => {
  return (
    <View style={[styles.itemContainer, style]}>
      <View
        style={[
          styles.gradient,
          {
            backgroundColor: item.color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    aspectRatio: 1,
  },
  gradient: {
    flex: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
