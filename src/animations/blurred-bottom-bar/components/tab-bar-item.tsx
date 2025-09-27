import { MaterialIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { type FC, memo, type ReactNode, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

// Define the TabBarItem component
type TabBarItemProps = {
  children?: ReactNode;
  onPress: () => void;
  focusedIndex: SharedValue<number>;
  index: number;
  screenName: string;
};

// memo for performance optimization (to prevent unnecessary re-renders)
export const TabBarItem: FC<TabBarItemProps> = memo(
  ({ onPress, focusedIndex, index, screenName }) => {
    // Derive the focus state from the shared animated value
    const isFocused = useDerivedValue(() => {
      return focusedIndex.value === index;
    }, [index]);

    // Define the animated style for fading in/out the tab bar icon
    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isFocused.value ? 1 : 0.3),
      };
    }, []);

    const getIconByScreenName = useCallback((pageName: string) => {
      const iconMap: { [key: string]: string } = {
        home: 'home',
        explore: 'explore',
        camera: 'camera-alt',
        settings: 'settings',
      };

      const iconName = iconMap[pageName.toLowerCase()] || 'home';

      return (
        <MaterialIcons
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          name={iconName}
          size={25}
          color={'white'}
        />
      );
    }, []);

    // Render the individual tab bar item
    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <PressableScale style={localStyles.fillCenter} onPress={onPress}>
          {getIconByScreenName(screenName)}
        </PressableScale>
      </Animated.View>
    );
  },
);

// Define local styles
const localStyles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fillCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
