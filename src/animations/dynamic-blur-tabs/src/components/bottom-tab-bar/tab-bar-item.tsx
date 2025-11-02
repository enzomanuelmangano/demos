import { StyleSheet } from 'react-native';

import { type FC, memo, useCallback } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type TabBarItemProps = {
  onPress: () => void;
  focusedIndex: SharedValue<number>;
  index: number;
  screenName: string;
};

export const TabBarItem: FC<TabBarItemProps> = memo(
  ({ onPress, focusedIndex, index, screenName }) => {
    const isFocused = useDerivedValue(() => {
      return focusedIndex.value === index;
    }, [index]);

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

    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <PressableScale style={localStyles.fillCenter} onPress={onPress}>
          {getIconByScreenName(screenName)}
        </PressableScale>
      </Animated.View>
    );
  },
);

const localStyles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fillCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
