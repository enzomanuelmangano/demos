import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAtom } from 'jotai';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ActiveItemKeyAtom, HistoryAtom } from '../atoms/history-atom';
import { useTimeMachineGesture } from '../hooks/use-time-machine-gesture';
import { TimeMachineList } from '../time-machine-list';
import { BackgroundCanvas } from './background-canvas';
import { TimeMachineListItem } from './time-machine-list-item';
import { StoryListItemWidth } from '../time-machine-list/item';

const usePreviousRef = <T,>(value: T) => {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

const { width, height } = Dimensions.get('window');

export const App = () => {
  const [target, setHistory] = useAtom(HistoryAtom);
  const timeMachineProgress = useSharedValue(0); // 0 = closed, 1 = fully open
  const scrollOffset = useSharedValue(0);
  const [activeItemKey, setActiveItemKey] = useAtom(ActiveItemKeyAtom);
  const previousActiveItemKey = usePreviousRef(activeItemKey);

  const activeIndex = useDerivedValue(() => {
    return Math.round(scrollOffset.get() / StoryListItemWidth);
  }, [scrollOffset]);

  const progress = useDerivedValue(() => {
    return withSpring(timeMachineProgress.get(), {
      mass: 0.2,
      damping: 15,
      stiffness: 300,
    });
  });

  const onTimeMachineClose = useCallback(() => {
    const newActiveItemKey = target[activeIndex.get()].key;

    if (previousActiveItemKey.current === newActiveItemKey) {
      return;
    }

    setActiveItemKey(newActiveItemKey);
    setTimeout(() => {
      setHistory(prev => {
        const newHistory = [...prev];
        return newHistory.filter(item => item.key === newActiveItemKey);
      });
    }, 1000);
  }, [
    previousActiveItemKey,
    target,
    activeIndex,
    setActiveItemKey,
    setHistory,
  ]);

  const panGesture = useTimeMachineGesture({
    timeMachineProgress,
    onClose: onTimeMachineClose,
  });

  // e2e outcome probe: bridge a 'moved' flag once the history stack opens.
  const [moved, setMoved] = useState(false);
  useAnimatedReaction(
    () => timeMachineProgress.get() > 0.05,
    (opened, prev) => {
      if (opened && !prev) {
        scheduleOnRN(setMoved, true);
      }
    },
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View
        testID="time-machine-surface"
        style={{ flex: 1, justifyContent: 'center', backgroundColor: '#000' }}>
        {/* e2e outcome probe: near-invisible (alpha ~0.01). */}
        <Text testID="time-machine-status" style={styles.statusProbe}>
          {moved ? 'moved' : 'idle'}
        </Text>
        <BackgroundCanvas
          timeMachineProgress={timeMachineProgress}
          width={width}
          height={height}
        />

        <TimeMachineList
          onScroll={offset => {
            'worklet';
            scrollOffset.set(offset);
          }}
          data={target.map((item, index) => {
            return (
              <TimeMachineListItem
                key={item.key}
                progress={progress}
                activeIndex={activeIndex}
                target={item}
                index={index}
              />
            );
          })}
        />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  statusProbe: {
    color: '#000000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});
