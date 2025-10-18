import { View } from 'react-native';

import { type FC, memo, useMemo } from 'react';

import { AntDesign } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '../constants';

type SelectableListItemProps = {
  index: number;
  containerWidth: number;
  containerHeight: number;
  internalPadding: number;
  activeIndexes: SharedValue<number[]>;
};

const SelectableListItem: FC<SelectableListItemProps> = memo(
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
        uri: `https://picsum.photos/200/200?key=${index}`,
      };
    }, [index]);

    return (
      <View
        style={{
          width: containerWidth,
          height: containerHeight,
          padding: internalPadding,
          borderRadius: externalBorderRadius,
          borderCurve: 'continuous',
        }}>
        <Animated.View style={[rImageStyle, { flex: 1, overflow: 'hidden' }]}>
          <Image
            source={source}
            style={{ flex: 1 }}
            recyclingKey={index.toString()}
            cachePolicy={'memory-disk'}
            contentFit="cover"
            transition={100}
          />
        </Animated.View>
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
