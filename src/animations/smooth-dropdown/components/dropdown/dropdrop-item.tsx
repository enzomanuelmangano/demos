import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo, useCallback, ComponentProps } from 'react';

import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import Color from 'color';
import { PressableScale } from 'pressto';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

type DropdownOptionType = {
  label: string;
  iconName: ComponentProps<typeof AntDesign>['name'];
};

type DropdownItemProps = {
  onPress?: (
    item: DropdownOptionType & {
      isHeader: boolean;
    },
  ) => void;
  progress: SharedValue<number>;
  isHeader: boolean;
  index: number;
  itemHeight: number;
  maxDropDownHeight: number;
  optionsLength: number;
} & DropdownOptionType;

const DropdownItem: FC<DropdownItemProps> = memo(
  ({
    onPress,
    progress,
    isHeader,
    index,
    optionsLength,
    maxDropDownHeight,
    itemHeight,
    label,
    iconName,
  }) => {
    const onPressWrapper = useCallback(() => {
      onPress && onPress({ label, isHeader, iconName });
    }, [onPress, label, isHeader, iconName]);

    // Calculating the background color of the item based on its index
    // That's kind of a hacky way to do it, but it works :)
    // Basically you can achieve a similar result by using the main color (in this case #1B1B1B)
    // as the background color of the item and than update the opacity of the item
    // However, this will update the opacity of the item's children as well (the icon and the text)
    // Note: the lighten values decrement as the index increases
    const lighten = 1 - (optionsLength - index) / optionsLength;
    // Note: I really love the Color library :) It's super useful for manipulating colors (https://www.npmjs.com/package/color)
    const collapsedBackgroundColor = Color('#1B1B1B').lighten(lighten).hex();
    const expandedBackgroundColor = '#1B1B1B';

    const rItemStyle = useAnimatedStyle(() => {
      // Calculating the bottom position of the item based on its index
      // That's useful in order to make the items stack on top of each other (when the dropdown is collapsed)
      // and to make them spread out (when the dropdown is expanded)
      const bottom = interpolate(
        progress.value,
        [0, 1],
        [index * 15, maxDropDownHeight / 2 - index * (itemHeight + 10)],
      );

      // Calculating the scale of the item based on its index (note that this will only be applied when the dropdown is collapsed)
      const scale = interpolate(progress.value, [0, 1], [1 - index * 0.05, 1]);

      // if progress.value < 0.5, the dropdown is collapsed, so we use the collapsedBackgroundColor
      // otherwise, the dropdown is expanded, so we use the expandedBackgroundColor (which is the same as the main color)
      const backgroundColor =
        progress.value < 0.5
          ? collapsedBackgroundColor
          : expandedBackgroundColor;

      return {
        bottom: bottom,
        backgroundColor: backgroundColor,
        zIndex: optionsLength - index,
        transform: [
          {
            scale: scale,
          },
        ],
      };
    }, [index, optionsLength, progress]);

    const rContentStyle = useAnimatedStyle(() => {
      const opacity = interpolate(
        progress.value,
        [0, 1],
        [isHeader ? 1 : 0, 1],
      );
      return {
        opacity: opacity,
      };
    }, []);

    const rArrowContainerStyle = useAnimatedStyle(() => {
      const rotation = interpolate(
        progress.value,
        [0, 1],
        [0, Math.PI / 2],
        Extrapolation.CLAMP,
      );
      const rotateRad = `${rotation}rad`;

      return {
        transform: [
          {
            rotate: isHeader ? rotateRad : '0deg',
          },
        ],
      };
    }, []);

    return (
      <PressableScale
        onPress={onPressWrapper}
        style={[styles.item, { height: itemHeight }, rItemStyle]}>
        <Animated.View style={[styles.content, rContentStyle]}>
          <View style={styles.iconBox}>
            <AntDesign name={iconName} color={'white'} size={20} />
          </View>
          <Text style={styles.title}>{label}</Text>
          <View
            style={{
              flex: 1,
            }}
          />
          <View style={styles.arrowBox}>
            <Animated.View style={rArrowContainerStyle}>
              <MaterialIcons
                name={isHeader ? 'arrow-forward-ios' : 'arrow-forward'}
                size={20}
                color={
                  isHeader ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)'
                }
              />
            </Animated.View>
          </View>
        </Animated.View>
      </PressableScale>
    );
  },
);

const styles = StyleSheet.create({
  arrowBox: {
    alignItems: 'center',
    height: '80%',
    justifyContent: 'center',
    marginRight: 5,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  iconBox: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#0C0C0C',
    borderCurve: 'continuous',
    borderRadius: 10,
    height: '80%',
    justifyContent: 'center',
    marginRight: 12,
  },
  item: {
    borderCurve: 'continuous',
    borderRadius: 10,
    padding: 15,
    position: 'absolute',
    width: '80%',
  },
  title: {
    color: 'white',
    fontSize: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export { DropdownItem };
export type { DropdownOptionType };
