import React, { useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AntDesign } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Palette } from '../constants';

type SelectableListItemProps = {
  index: number;
  containerWidth: number;
  containerHeight: number;
  internalPadding: number;
  activeIndexes: Animated.SharedValue<number[]>;
};

const AnimatedImage = Animated.createAnimatedComponent(Image);

const SelectableListItem: React.FC<SelectableListItemProps> = React.memo(
  ({
    internalPadding,
    index,
    containerHeight,
    containerWidth,
    activeIndexes,
  }) => {
    const isActive = useDerivedValue(() => {
      return activeIndexes.value.includes(index);
    }, [index]);

    const externalBorderRadius = 10;

    const activeBorderWidth = useDerivedValue(() => {
      return withTiming(isActive.value ? 4 : 0);
    }, []);

    // The Math behind the perfect internalBorderRadius:
    // https://www.30secondsofcode.org/css/s/nested-border-radius#:~:text=The%20border%20radius%20of%20the,tersely%20R1%20%2B%20D%20%3D%20R2%20.
    const internalBorderRadius = useDerivedValue(() => {
      return externalBorderRadius + activeBorderWidth.value;
    }, [externalBorderRadius]);

    const rImageStyle = useAnimatedStyle(() => {
      return {
        borderRadius: internalBorderRadius.value,
        borderWidth: activeBorderWidth.value,
        borderColor: isActive.value ? Palette.primary : Palette.background,
      };
    }, [internalBorderRadius]);

    const rBadgeStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isActive.value ? 1 : 0),
        transform: [
          {
            scale: withSpring(isActive.value ? 1 : 0),
          },
        ],
      };
    }, [isActive]);

    const source = useMemo(() => {
      return {
        uri: `https://picsum.photos/400/400?key=${index}`,
      };
    }, [index]);

    return (
      <View
        style={{
          width: containerWidth,
          height: containerHeight,
          padding: internalPadding,
          borderRadius: externalBorderRadius,
        }}>
        <AnimatedImage
          source={source}
          style={[{ flex: 1 }, rImageStyle]}
          recyclingKey={index.toString()}
          cachePolicy={'memory'}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: 24,
              aspectRatio: 1,
              backgroundColor: Palette.primary,
              borderRadius: 12,
              justifyContent: 'center',
              alignItems: 'center',
            },
            rBadgeStyle,
          ]}>
          <AntDesign name="check" size={16} color="black" />
        </Animated.View>
      </View>
    );
  },
);

export { SelectableListItem };
