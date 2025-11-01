import { StyleSheet, View } from 'react-native';

import {
  type FC,
  type ReactNode,
  memo,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomProgress } from './bottom-progress';
import { clamp, getReadingTime } from './utils';

import type {
  LayoutChangeEvent,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type Section = {
  title: string;
  description: string;
};

type SectionContentListProps = ScrollViewProps & {
  sections: Section[];
  renderSection: (section: Section, index: number) => ReactNode;
  bottomProgressStyle?: StyleProp<ViewStyle>;
};

const GRADIENT_COLORS = ['#111111', '#11111100'] as const;

const SectionContentList: FC<SectionContentListProps> = memo(
  ({ sections, renderSection, bottomProgressStyle, ...scrollViewProps }) => {
    const viewHeight = useSharedValue(1000);
    const scrollHeight = useSharedValue(1000);
    const progress = useSharedValue(0);

    const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();

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

    const onViewLayout = useCallback(
      (event: LayoutChangeEvent) => {
        viewHeight.value = event.nativeEvent.layout.height;
      },
      [viewHeight],
    );

    const contentContainerStyle = useMemo(() => {
      return {
        paddingTop: safeTop + 16,
        paddingBottom: safeBottom + 100,
        paddingHorizontal: 32,
      };
    }, [safeTop, safeBottom]);

    return (
      <View onLayout={onViewLayout}>
        <Animated.ScrollView
          {...scrollViewProps}
          contentContainerStyle={contentContainerStyle}
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}>
          <View onLayout={onLayout}>{sections.map(renderSection)}</View>
        </Animated.ScrollView>
        <LinearGradient
          colors={GRADIENT_COLORS}
          style={[
            styles.gradient,
            {
              height: safeTop + 16,
            },
          ]}
          pointerEvents="none"
        />
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

const styles = StyleSheet.create({
  gradient: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
});
export { SectionContentList };
