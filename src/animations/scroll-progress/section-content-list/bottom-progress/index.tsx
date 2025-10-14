import { StyleSheet } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { BottomProgressState } from '../typings';
import { CollapsedArea } from './collapsed-area';
import { ProgressBarArea } from './progress-bar-area';

import type { ViewProps } from 'react-native';

type BottomProgressProps = {
  style?: ViewProps['style'];
  progress: SharedValue<number>;
  readingTime: string;
  onReset: () => void;
};

const BottomProgress: FC<BottomProgressProps> = memo(
  ({ style, progress, readingTime, onReset }) => {
    const state = useDerivedValue(() => {
      if (progress.value === 0) {
        return BottomProgressState.INITIAL;
      }
      if (progress.value === 1) {
        return BottomProgressState.END;
      }
      return BottomProgressState.EXPANDED;
    }, []);

    const isExpanded = useDerivedValue(() => {
      return state.value === BottomProgressState.EXPANDED;
    }, []);

    const rAnimatedStyle = useAnimatedStyle(() => {
      const width = withTiming(isExpanded.value ? 200 : 70, {
        duration: 500,
      });

      return {
        width: width,
      };
    });

    return (
      <Animated.View style={[styles.container, rAnimatedStyle, style]}>
        <ProgressBarArea isVisible={isExpanded} progress={progress} />
        <CollapsedArea
          state={state}
          readingTime={readingTime}
          onReset={onReset}
        />
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    borderCurve: 'continuous',
    borderRadius: 40,
    height: 70,
    width: 200,
  },
});

export { BottomProgress };
