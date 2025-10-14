import { StyleSheet, View } from 'react-native';

import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { NavigationItem } from '../navigation/navigation-item';

import type { AppData } from './constants';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Props for the AppItem component
 * @property item - Data for the app including colors and ID
 * @property onPress - Callback to handle item tap/press
 * @property style - Additional styles to apply to the container
 */
interface AppItemProps {
  item: AppData;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const AppItem: React.FC<AppItemProps> = ({ item, onPress, style }) => {
  const handleNavigate = () => {
    onPress?.();
  };

  return (
    <Animated.View
      style={[styles.itemContainer, style]}
      layout={LinearTransition.duration(350)}
      exiting={FadeOut}>
      {/* Main touchable area for the app item */}
      <NavigationItem
        style={{
          flex: 1,
        }}
        onNavigate={handleNavigate}
        config={{
          borderRadius: 16,
          color: item.colors[1],
          borderCurve: 'continuous',
        }}>
        <View style={styles.touchable}>
          {/* Gradient background */}
          <View
            style={[
              styles.gradient,
              {
                backgroundColor: item.colors[0],
              },
            ]}
          />
        </View>
      </NavigationItem>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    borderCurve: 'continuous',
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  itemContainer: {
    aspectRatio: 1,
  },
  touchable: {
    flex: 1,
  },
});
