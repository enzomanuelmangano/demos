import { AntDesign } from '@expo/vector-icons';
import { type FC, memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { BottomProgressState } from '../typings';

type CollapsedAreaProps = {
  state: SharedValue<BottomProgressState>;
  readingTime: string;
  onReset: () => void;
};

const CollapsedArea: FC<CollapsedAreaProps> = memo(
  ({ state, readingTime, onReset }) => {
    const rCollapsedAreaStyle = useAnimatedStyle(() => {
      const isCollapsed =
        state.value === BottomProgressState.INITIAL ||
        state.value === BottomProgressState.END;
      return {
        opacity: withTiming(isCollapsed ? 1 : 0),
      };
    }, []);

    const rMinContainerStyle = useAnimatedStyle(() => {
      const isVisible = state.value === BottomProgressState.INITIAL;
      return {
        opacity: withTiming(isVisible ? 1 : 0),
      };
    }, []);

    const rUpArrowContainerStyle = useAnimatedStyle(() => {
      const isVisible = state.value === BottomProgressState.END;
      return {
        opacity: withTiming(isVisible ? 1 : 0),
      };
    }, []);

    const onPressArrow = useCallback(() => {
      if (state.value !== BottomProgressState.END) return;
      return onReset();
    }, [onReset, state.value]);

    return (
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#2E2D2E',
            borderRadius: 40,
            margin: 5,
          },
          rCollapsedAreaStyle,
        ]}>
        <Animated.View style={[StyleSheet.absoluteFill, rMinContainerStyle]}>
          <View style={styles.fillCenter}>
            <Text
              style={{
                color: '#9E9E9E',
                marginHorizontal: 5,
              }}
              adjustsFontSizeToFit
              numberOfLines={1}>
              {readingTime}
            </Text>
          </View>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, rUpArrowContainerStyle]}>
          <View style={styles.fillCenter} onTouchEnd={onPressArrow}>
            <AntDesign name="arrow-up" size={24} color="#9E9E9E" />
          </View>
        </Animated.View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { CollapsedArea };
