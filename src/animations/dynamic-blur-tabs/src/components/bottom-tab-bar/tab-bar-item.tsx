import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { PressableScale } from '../pressable-scale';

// Define the TabBarItem component
type TabBarItemProps = {
  onPress: () => void;
  focusedIndex: Animated.SharedValue<number>;
  index: number;
  screenName: string;
};

// React.memo for performance optimization (to prevent unnecessary re-renders)
export const TabBarItem: React.FC<TabBarItemProps> = React.memo(
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
      return (
        <MaterialIcons
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          name={pageName.toLowerCase()}
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
