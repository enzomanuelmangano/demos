import type { Extrapolation, SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

// Define props for CarouselItem component
export type CarouselItemProps<T> = {
  renderItem: (itemData: {
    item: T;
    index: number;
    progress: SharedValue<number>;
  }) => React.ReactNode; // Function to render the carousel item
  index: number; // Index of the item
  translateX: SharedValue<number>; // Shared value for horizontal translation
  listSize: number; // Total size of the list
  maxVisibleItems: number; // Maximum number of visible items
  dataLength: number; // Total length of the data
  item: T; // The item data to render
  listItemWidth: number; // Width of each list item
  interpolateConfig: {
    // Configuration object for interpolation
    inputRange: (index: number) => number[]; // Function to generate input range based on index
    outputRange: (index: number) => number[]; // Function to generate output range based on index
    extrapolationType?: Extrapolation; // Type of extrapolation for animation
  };
};

// Component to render individual items in the carousel
export const CarouselItem = <T,>({
  renderItem, // Function to render the item
  index, // Index of the item
  listSize, // Total size of the list
  translateX, // Shared value for horizontal translation
  maxVisibleItems, // Maximum number of visible items
  dataLength, // Total length of the data
  item, // The item data to render
  interpolateConfig, // Configuration object for interpolation
  listItemWidth, // Width of each list item
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
    // Calculate translation
    const translation = translateX.value % listSize;

    // Check if it's initial index and passed the center
    const isInitialIndex = index <= Math.round(maxVisibleItems / 2);
    const hasPassedCenter = Math.abs(translation) > listSize / 2;
    if (isInitialIndex && hasPassedCenter) {
      return translation + listSize; // Move to the next item
    }

    // Check if it's last index and hasn't passed the center
    const isLastIndex = index > dataLength - Math.round(maxVisibleItems / 2);
    if (isLastIndex && !hasPassedCenter) {
      return translation - listSize; // Move to the previous item
    }

    // Otherwise, keep the translation as is
    return translation;
  }, [listSize]); // Dependency on list size

  // Calculate progress for animation interpolation
  const progress = useDerivedValue(() => {
    const evaluatedProgress = interpolate(
      -derivedTranslate.value,
      interpolateConfig.inputRange(index),
      interpolateConfig.outputRange(index),
      interpolateConfig.extrapolationType,
    );

    return evaluatedProgress;
  }, [index]);

  // Define animated styles
  const rStyle = useAnimatedStyle(() => {
    const translatedAmount = derivedTranslate.value;

    return {
      transform: [
        {
          translateX: translatedAmount, // Apply translation
        },
      ],
      // Set zIndex based on progress for layering
      // This might not be necessary for all use cases and can be removed
      // It's a bit tricky to parametrize this style, but it can be done
      zIndex: Math.abs(progress.value * 100),
    };
  }, []);

  // Render the item with animated styles
  return (
    <Animated.View
      style={[
        rStyle, // Apply animated styles
        {
          width: listItemWidth, // Set width of the item
          // You might want to parametrize these values
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
      key={index}>
      {renderItem({
        // Render the item using renderItem function
        item, // Pass the item data
        index: index, // Pass the index
        progress: progress, // Pass the progress for animation
      })}
    </Animated.View>
  );
};
