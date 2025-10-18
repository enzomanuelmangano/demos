import { Dimensions, StyleSheet } from 'react-native';

import { memo } from 'react';

import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import { PriorityListView } from './priority-list-view';

import type { HistoryItem } from '../atoms/history-atom';
import type { SharedValue } from 'react-native-reanimated';

type TimeMachineListItemProps = {
  progress: SharedValue<number>;
  index: number;
  activeIndex: SharedValue<number>;
  target: HistoryItem;
};

const { width, height } = Dimensions.get('window');
export const TimeMachineListItem = memo(
  ({ progress, index, activeIndex, target }: TimeMachineListItemProps) => {
    const itemOpacity = useDerivedValue(() => {
      if (activeIndex.value === index) {
        return 1;
      }

      return progress.value ** 3;
    }, [activeIndex, index]);

    const rStyle = useAnimatedStyle(() => {
      return {
        width: width,
        height: height,
        opacity: itemOpacity.value,
        pointerEvents: progress.value > 0.1 ? 'none' : 'auto',
        transform: [
          {
            scale: interpolate(progress.value, [0, 1], [1, 0.7]),
          },
          {
            translateX: interpolate(progress.value, [0, 1], [0, -30]),
          },
        ],
      };
    }, [index, progress, activeIndex]);

    return (
      <Animated.View style={[styles.container, rStyle]}>
        <Animated.View style={styles.content}>
          <OptimizedPriorityListView target={target} />
        </Animated.View>
      </Animated.View>
    );
  },
);

const OptimizedPriorityListView = memo(
  ({ target }: { target: HistoryItem }) => {
    // const isTimeMachineActive = useAtomValue(IsTimeMachineActiveAtom);
    // const activeItemKey = useAtomValue(ActiveItemKeyAtom);
    // if (!isTimeMachineActive && target.key !== activeItemKey) {
    //   return null;
    // }

    return <PriorityListView items={target.items} />;
  },
  (prev, next) => {
    return prev.target.key === next.target.key;
  },
);

const styles = StyleSheet.create({
  container: {
    boxShadow: '0px 0px 10px #00000088',
  },
  content: {
    backgroundColor: '#f3f3f3',
    borderCurve: 'continuous',
    borderRadius: 25,
    flex: 1,
    overflow: 'hidden',
  },
});
