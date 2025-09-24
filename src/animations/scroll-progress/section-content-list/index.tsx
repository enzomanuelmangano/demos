import {
  type FC,
  type ReactNode,
  memo,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { BottomProgress } from './bottom-progress';
import { clamp, getReadingTime } from './utils';

type Section = {
  title: string;
  description: string;
};

type SectionContentListProps = ScrollViewProps & {
  sections: Section[];
  renderSection: (section: Section, index: number) => ReactNode;
  bottomProgressStyle?: StyleProp<ViewStyle>;
};

const SectionContentList: FC<SectionContentListProps> = memo(
  ({ sections, renderSection, bottomProgressStyle, ...scrollViewProps }) => {
    const viewHeight = useSharedValue(1000);
    const scrollHeight = useSharedValue(1000);
    const progress = useSharedValue(0);

    const isResetting = useSharedValue(false);
    const currentScroll = useSharedValue(0);

    const onLayout = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event: any) => {
        const { height } = event.nativeEvent.layout;
        scrollHeight.value = height;
      },
      [scrollHeight],
    );

    const paddingBottom = useMemo(() => {
      return +(
        StyleSheet.flatten(scrollViewProps.contentContainerStyle ?? {})
          .paddingBottom ?? 0
      );
    }, [scrollViewProps.contentContainerStyle]);

    const scrollableHeight = useDerivedValue(() => {
      return scrollHeight.value - viewHeight.value + paddingBottom;
    }, [paddingBottom]);

    const onScroll = useAnimatedScrollHandler({
      onScroll: ({ contentOffset: { y } }) => {
        currentScroll.value = y;
        if (isResetting.value) return; // ignore scroll events while resetting
        progress.value = clamp(y / scrollableHeight.value, 0, 1);
      },
    });

    const readingTime = useMemo(() => {
      const time = sections.reduce((acc, section) => {
        return acc + getReadingTime(section.description);
      }, 0);

      return `${time} min`;
    }, [sections]);

    const scrollRef = useRef<Animated.ScrollView>(null);

    const onReset = useCallback(() => {
      isResetting.value = true;
      scrollRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    }, [isResetting]);

    useAnimatedReaction(
      () => isResetting.value && currentScroll.value === 0,
      hasCompleteReset => {
        if (hasCompleteReset) {
          isResetting.value = false;
        }
      },
      [isResetting],
    );

    return (
      <View
        onLayout={event => {
          viewHeight.value = event.nativeEvent.layout.height;
        }}>
        <Animated.ScrollView
          {...scrollViewProps}
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}>
          <View onLayout={onLayout}>{sections.map(renderSection)}</View>
        </Animated.ScrollView>
        <BottomProgress
          readingTime={readingTime}
          onReset={onReset}
          progress={progress}
          style={[
            {
              position: 'absolute',
              backgroundColor: '#222123',
              bottom: 50,
              zIndex: 100,
              alignSelf: 'center',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.1)',
            },
            bottomProgressStyle,
          ]}
        />
      </View>
    );
  },
);

export { SectionContentList };
