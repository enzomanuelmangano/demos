import { useMemo } from 'react';

import { useAtomValue } from 'jotai';
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { StoryListItem, StoryListItemWidth, WindowWidth } from './item';
import { IsTimeMachineActiveAtom } from '../atoms/time-machine-active';

type TimeMachineListProps = {
  data: React.ReactNode[];
  onScroll?: (offset: number) => void;
};

export const TimeMachineList = ({ data, onScroll }: TimeMachineListProps) => {
  const animatedRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useSharedValue(0);
  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const ListPadding = WindowWidth - StoryListItemWidth;

  const contentContainerStyle = useMemo(() => {
    return {
      width: StoryListItemWidth * data.length + ListPadding,
    };
  }, [data.length, ListPadding]);

  useAnimatedReaction(
    () => scrollOffset.value,
    (offset, prevOffset) => {
      if (onScroll && offset !== prevOffset) {
        onScroll(offset);
      }
    },
  );

  const scrollEnabled = useAtomValue(IsTimeMachineActiveAtom);

  return (
    <Animated.ScrollView
      ref={animatedRef}
      horizontal
      snapToInterval={StoryListItemWidth}
      decelerationRate={'fast'}
      disableIntervalMomentum
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={8}
      onScroll={onScrollHandler}
      contentContainerStyle={contentContainerStyle}>
      {data.map((item, index) => (
        <StoryListItem index={index} key={index} scrollOffset={scrollOffset}>
          {item}
        </StoryListItem>
      ))}
    </Animated.ScrollView>
  );
};
