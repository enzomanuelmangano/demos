import type { FlatListProps, StyleProp, ViewStyle } from 'react-native';
import { FlatList } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

type InteractiveListProps<T> = FlatListProps<T> & {
  amountToShift?: SharedValue<number>;
  itemHeight: number;
  itemContainerStyle?: StyleProp<ViewStyle>;
};
export const InteractiveList = <T,>({
  data,
  amountToShift,
  itemHeight,
  itemContainerStyle,
  ...rest
}: InteractiveListProps<T>) => {
  return (
    <FlatList
      data={data}
      {...rest}
      contentContainerStyle={rest.contentContainerStyle}
      renderItem={item => {
        return (
          <AnimatedListItem
            amountToShift={amountToShift}
            index={item.index}
            itemHeight={itemHeight}
            itemContainerStyle={itemContainerStyle}>
            {rest.renderItem?.(item)}
          </AnimatedListItem>
        );
      }}
    />
  );
};

type AnimatedListItemProps = {
  children: React.ReactNode;
  index: number;
  amountToShift?: SharedValue<number>;
  itemHeight: number;
  itemContainerStyle?: StyleProp<ViewStyle>;
};
const AnimatedListItem = ({
  children,
  index,
  amountToShift,
  itemContainerStyle,
  itemHeight,
}: AnimatedListItemProps) => {
  const rStyle = useAnimatedStyle(() => {
    const shiftedAmount = amountToShift?.value ?? 0;

    return {
      backgroundColor: withSpring(
        index === shiftedAmount ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
        {
          damping: 25,
          stiffness: 200,
          mass: 1.2,
        },
      ),
      shadowOpacity: withSpring(index === shiftedAmount ? 0.15 : 0, {
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
  }, [index, amountToShift, itemHeight]);

  return (
    <Animated.View style={[rStyle, itemContainerStyle]}>
      {children}
    </Animated.View>
  );
};
