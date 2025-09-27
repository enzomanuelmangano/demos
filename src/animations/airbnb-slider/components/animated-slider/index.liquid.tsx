import { Host, Slider } from '@expo/ui/swift-ui';
import { useMemo, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { Extrapolation, interpolate } from 'react-native-reanimated';
import { Palette } from '../../constants';

type SliderProps = {
  pickerSize?: number;
  sliderHeight?: number;
  minValue?: number;
  maxValue?: number;
  color?: string;
  style: StyleProp<
    Omit<ViewStyle, 'width' | 'height'> & { width: number; height?: number }
  >;
  onUpdate?: (progress: number) => void;
  initialProgress?: number;
};

const AnimatedSlider: React.FC<SliderProps> = ({
  minValue = 0,
  maxValue = 1,
  color = Palette.primary,
  style,
  onUpdate,
  initialProgress = 0,
}) => {
  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(style);
  }, [style]);

  const sliderWidth = flattenedStyle.width;

  const [value, setValue] = useState(initialProgress);

  return (
    <Host
      style={{
        borderRadius: 5,
        // backgroundColor: Palette.secondary,
        ...flattenedStyle,
        height: 60,
        width: sliderWidth,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Slider
        value={value}
        color={color}
        onValueChange={v => {
          setValue(v);
          if (onUpdate) {
            const progress = interpolate(
              v,
              [0, 1],
              [minValue, maxValue],
              Extrapolation.CLAMP,
            );
            onUpdate(progress);
          }
        }}
      />
    </Host>
  );
};

export { AnimatedSlider };
