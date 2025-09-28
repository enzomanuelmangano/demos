import { StyleSheet, View } from 'react-native';

import { type FC, type ReactNode, useCallback, useEffect } from 'react';

import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  FadeOut,
  interpolate,
  Keyframe,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const LIST_ITEM_HEIGHT = 90;
const LIST_ITEM_MARGIN_BOTTOM = 20;
const LIST_ITEM_CONTAINER_HEIGHT = LIST_ITEM_HEIGHT + LIST_ITEM_MARGIN_BOTTOM;

type BlurredListProps<T> = {
  maxVisibleItems: number;
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => ReactNode;
};

type BlurredListItemContainerProps = {
  children: ReactNode;
  index: number;
  maxVisibleItems: number;
  currentListLength: number;
};

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const keyframe = new Keyframe({
  0: {
    opacity: 0,
    transform: [
      { scale: 0.5 },
      {
        translateY: 100,
      },
    ],
  },
  100: {
    opacity: 1,
    transform: [
      { scale: 1 },
      {
        translateY: 0,
      },
    ],
  },
});

const calculateTop = (
  index: number,
  currentListLength: number,
  maxVisibleItems: number,
) =>
  index * LIST_ITEM_CONTAINER_HEIGHT -
  Math.max(currentListLength - maxVisibleItems, 0) * LIST_ITEM_CONTAINER_HEIGHT;

const BlurredListItemContainer: FC<BlurredListItemContainerProps> = ({
  children,
  index,
  maxVisibleItems,
  currentListLength,
}) => {
  const progress = useSharedValue(0);
  const blurIntensity = useSharedValue<number | undefined>(50);
  const isOffVisibleArea = index - (currentListLength - maxVisibleItems) < 0;
  const top = calculateTop(index, currentListLength, maxVisibleItems);

  useEffect(() => {
    progress.value = withTiming(isOffVisibleArea ? 0 : 1, {
      duration: 350,
      easing: Easing.linear,
    });
    blurIntensity.value = withTiming(isOffVisibleArea ? 50 : 0, {
      duration: isOffVisibleArea ? 150 : 500,
      easing: Easing.linear,
    });
  }, [isOffVisibleArea, progress, blurIntensity]);

  const containerStyle = useAnimatedStyle(
    () => ({
      top: withSpring(top),
    }),
    [top],
  );

  const isLastItemProgress = useDerivedValue(() =>
    withTiming(index === currentListLength - 1 ? 1 : 0),
  );

  const contentStyle = useAnimatedStyle(() => ({
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: interpolate(isLastItemProgress.value, [0, 1], [20, 10]),
    },
    shadowOpacity: interpolate(isLastItemProgress.value, [0, 1], [0.03, 0.02]),
    shadowRadius: interpolate(isLastItemProgress.value, [0, 1], [10, 5]),
  }));

  if (isOffVisibleArea) {
    return null;
  }
  return (
    <Animated.View
      exiting={FadeOut.duration(180)}
      entering={keyframe.duration(200)}
      style={[styles.itemContainer, containerStyle]}>
      <Animated.View style={[styles.itemContent, contentStyle]}>
        {children}
      </Animated.View>
      <AnimatedBlurView
        tint={'extraLight'}
        intensity={blurIntensity}
        style={styles.blurView}
      />
    </Animated.View>
  );
};

export function BlurredList<T>({
  maxVisibleItems,
  data,
  renderItem,
}: BlurredListProps<T>) {
  const renderItemWithBlur = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <BlurredListItemContainer
        key={index}
        index={index}
        currentListLength={data.length}
        maxVisibleItems={maxVisibleItems}>
        {renderItem({ item, index })}
      </BlurredListItemContainer>
    ),
    [data.length, maxVisibleItems, renderItem],
  );

  return (
    <View
      style={[
        styles.container,
        { height: maxVisibleItems * LIST_ITEM_CONTAINER_HEIGHT },
      ]}>
      {data.map((item, index) => renderItemWithBlur({ item, index }))}
    </View>
  );
}

const styles = StyleSheet.create({
  blurView: {
    ...StyleSheet.absoluteFillObject,
    bottom: -20,
    top: -5,
    zIndex: 100,
  },
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  itemContainer: {
    height: LIST_ITEM_HEIGHT,
    marginBottom: LIST_ITEM_MARGIN_BOTTOM,
    position: 'absolute',
    width: '100%',
  },
  itemContent: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 20,
    elevation: 5,
    height: LIST_ITEM_HEIGHT,
    justifyContent: 'center',
    shadowRadius: 10,
    width: '80%',
  },
});
