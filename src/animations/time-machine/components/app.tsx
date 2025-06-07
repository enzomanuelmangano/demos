import { Dimensions, StatusBar, View } from 'react-native';
import { useAtom } from 'jotai';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useCallback, useEffect, useRef } from 'react';

import { TimeMachineList } from '../time-machine-list';
import { StoryListItemWidth } from '../time-machine-list/item';
import { ActiveItemKeyAtom, HistoryAtom } from '../atoms/history-atom';
import { useTimeMachineGesture } from '../hooks/use-time-machine-gesture';
import { useStatusBar } from '../hooks/use-status-bar';

import { TimeMachineListItem } from './time-machine-list-item';
import { BackgroundCanvas } from './background-canvas';

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
    return Math.round(scrollOffset.value / StoryListItemWidth);
  }, [scrollOffset]);

  const progress = useDerivedValue(() => {
    return withSpring(timeMachineProgress.value, {
      mass: 0.2,
      damping: 15,
      stiffness: 300,
    });
  });

  const onTimeMachineClose = useCallback(() => {
    const newActiveItemKey = target[activeIndex.value].key;

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

  useStatusBar(timeMachineProgress);

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={{ flex: 1, justifyContent: 'center', backgroundColor: '#000' }}>
        <BackgroundCanvas
          timeMachineProgress={timeMachineProgress}
          width={width}
          height={height}
        />
        <StatusBar barStyle="dark-content" animated />

        <TimeMachineList
          onScroll={offset => {
            'worklet';
            scrollOffset.value = offset;
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
