import type { Extrapolation, SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

export type CarouselItemProps<T> = {
  renderItem: (itemData: {
    item: T;
    index: number;
    progress: SharedValue<number>;
  }) => React.ReactNode;
  index: number;
  translateX: SharedValue<number>;
  listSize: number;
  maxVisibleItems: number;
  dataLength: number;
  item: T;
  listItemWidth: number;
  interpolateConfig: {
    inputRange: (index: number) => number[];
    outputRange: (index: number) => number[];
    extrapolationType?: Extrapolation;
  };
};

export const CarouselItem = <T,>({
  renderItem,
  index,
  listSize,
  translateX,
  maxVisibleItems,
  dataLength,
  item,
  interpolateConfig,
  listItemWidth,
}: CarouselItemProps<T>) => {
  // This logic isn't perfect and needs to be adjusted 😅
  // If it doesn't work properly for your use-case, you have two options:
  // 1. You can fix it 👀
  // 2. You can double your data array 👀 👀 👀
  // It's just a starting point to demonstrate the concept
  // The idea is to shift the translateX value based on the index and list size
  // to create a circular carousel effect with infinite scrolling
  // IMO this can be really powerful, since we're never actually changing the data
  // We're just shifting the view based on the index and list size
  // That means 0 re-renders and no performance hit for large data sets
  const derivedTranslate = useDerivedValue(() => {
    const translation = translateX.value % listSize;

    const isInitialIndex = index <= Math.round(maxVisibleItems / 2);
    const hasPassedCenter = Math.abs(translation) > listSize / 2;
    if (isInitialIndex && hasPassedCenter) {
      return translation + listSize;
    }

    const isLastIndex = index > dataLength - Math.round(maxVisibleItems / 2);
    if (isLastIndex && !hasPassedCenter) {
      return translation - listSize;
    }

    return translation;
  }, [listSize]);

  const progress = useDerivedValue(() => {
    const evaluatedProgress = interpolate(
      -derivedTranslate.value,
      interpolateConfig.inputRange(index),
      interpolateConfig.outputRange(index),
      interpolateConfig.extrapolationType,
    );

    return evaluatedProgress;
  }, [index]);

  const rStyle = useAnimatedStyle(() => {
    const translatedAmount = derivedTranslate.value;

    return {
      transform: [
        {
          translateX: translatedAmount,
        },
      ],
      zIndex: Math.floor(Math.abs(progress.value * 100)),
    };
  }, []);

  return (
    <Animated.View
      style={[
        rStyle,
        {
          width: listItemWidth,
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
      key={index}>
      {renderItem({
        item,
        index: index,
        progress: progress,
      })}
    </Animated.View>
  );
};
