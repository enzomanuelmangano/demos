// Import necessary components and types from react-native and react-native-reanimated
import type { FlatListProps, StyleProp, ViewStyle } from 'react-native';
import { FlatList } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// Define props type for the InteractiveList component
type InteractiveListProps<T> = FlatListProps<T> & {
  amountToShift?: SharedValue<number>; // Optional shared value representing amount to shift
  itemHeight: number; // Height of each item in the list
  itemContainerStyle?: StyleProp<ViewStyle>; // Optional style for each item's container
};

// Define the InteractiveList component
export const InteractiveList = <T,>({
  data,
  amountToShift,
  itemHeight,
  itemContainerStyle,
  ...rest
}: InteractiveListProps<T>) => {
  return (
    // Render a FlatList with additional props and custom renderItem function
    <FlatList
      data={data}
      {...rest} // Spread remaining props
      contentContainerStyle={rest.contentContainerStyle} // Content container style
      renderItem={item => {
        return (
          // Render AnimatedListItem within the FlatList's renderItem
          <AnimatedListItem
            amountToShift={amountToShift}
            index={item.index} // Index of the item being rendered
            itemHeight={itemHeight} // Height of each item
            itemContainerStyle={itemContainerStyle}>
            {rest.renderItem?.(item)}
          </AnimatedListItem>
        );
      }}
    />
  );
};

// Define props type for the AnimatedListItem component
type AnimatedListItemProps = {
  children: React.ReactNode; // Content to render inside the item
  index: number; // Index of the item
  amountToShift?: SharedValue<number>; // Optional shared value representing amount to shift
  itemHeight: number; // Height of the item
  itemContainerStyle?: StyleProp<ViewStyle>; // Optional style for the item's container
};

// Define the AnimatedListItem component
const AnimatedListItem = ({
  children,
  index,
  amountToShift,
  itemContainerStyle,
  itemHeight,
}: AnimatedListItemProps) => {
  // Define animated styles using useAnimatedStyle hook
  const rStyle = useAnimatedStyle(() => {
    const shiftedAmount = amountToShift?.value ?? 0; // Get the value of amount to shift, defaulting to 0

    // Define animation values for the item
    return {
      backgroundColor: withSpring(
        // Background color animation
        index === shiftedAmount ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
        {
          damping: 25,
          stiffness: 200,
          mass: 1.2,
        },
      ),
      shadowOpacity: withSpring(index === shiftedAmount ? 0.15 : 0, {
        // Shadow opacity animation
        damping: 25,
        stiffness: 200,
        mass: 1.2,
      }),
      shadowRadius: withSpring(index === shiftedAmount ? 12 : 4, {
        damping: 25,
        stiffness: 200,
        mass: 1.2,
      }),
      shadowColor: 'rgba(59, 130, 246, 0.4)',
      shadowOffset: {
        width: 0,
        height: withSpring(index === shiftedAmount ? 6 : 1, {
          damping: 25,
          stiffness: 200,
          mass: 1.2,
        }),
      },
      elevation: withSpring(index === shiftedAmount ? 12 : 2, {
        damping: 25,
        stiffness: 200,
        mass: 1.2,
      }),
      transform: [
        // Translate Y animation with spring physics
        {
          translateY: withSpring(-shiftedAmount * itemHeight, {
            damping: 30,
            stiffness: 180,
            mass: 1.5,
          }),
        },
      ],
      opacity: withSpring(index >= shiftedAmount ? 1 : 0, {
        damping: 26,
        stiffness: 190,
        mass: 1.4,
      }),
    };
  }, [index, amountToShift, itemHeight]); // Re-compute styles when these values change

  // Render the Animated.View with the calculated animated styles
  return (
    <Animated.View style={[rStyle, itemContainerStyle]}>
      {children}
    </Animated.View>
  );
};
