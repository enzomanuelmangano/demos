import type { ImageProps } from '@shopify/react-native-skia';
import { rect, Image } from '@shopify/react-native-skia';
import React, { useImperativeHandle, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Touchable from 'react-native-skia-gesture';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Grid } from './grid';

type ImageCropperProps = {
  image: ImageProps['image'];
  width: number;
  style?: StyleProp<ViewStyle>;
};

type ImageCropperRef = {
  expand: () => void;
  collapse: () => void;
  getGridRect: () => ReturnType<typeof rect>;
};

const AnimationDuration = 250; // ms
const TimingConfig = {
  duration: AnimationDuration,
};

// The main point was to build a generic component that could be used to crop any image.
// I've done my best to make it as generic as possible, but of course, there is room for improvement :)
const ImageCropper = React.forwardRef<ImageCropperRef, ImageCropperProps>(
  ({ image, style, width }, ref) => {
    const imageRatio = useMemo(() => {
      return (image?.height() ?? 0) / (image?.width() ?? 1);
    }, [image]);

    const height = width * imageRatio;

    const imageRect = useDerivedValue(() => {
      return rect(0, 0, width, height);
    }, [width]);

    const minWidth = width / 3;
    const minHeight = height / 3;

    const x = useSharedValue(0);
    const y = useSharedValue(0);
    const gridWidth = useSharedValue(minWidth);
    const gridHeight = useSharedValue(minHeight);

    // I really use a lot the useImperativeHandle hook.
    // It's a great way to expose a component's API to its parent.
    // In this case, I'm exposing the expand, collapse and getGridRect methods.
    // The getGridRect method is used to get the grid's rect when the user
    // that's super useful to build the image cropped component.
    useImperativeHandle(ref, () => ({
      expand: () => {
        'worklet';
        x.value = withTiming(0, TimingConfig);
        y.value = withTiming(0, TimingConfig);
        gridWidth.value = withTiming(width, TimingConfig);
        gridHeight.value = withTiming(height, TimingConfig);
      },
      collapse: () => {
        'worklet';
        gridWidth.value = withTiming(minWidth, TimingConfig);
        gridHeight.value = withTiming(minHeight, TimingConfig);
      },
      getGridRect: () => {
        return rect(x.value, y.value, gridWidth.value, gridHeight.value);
      },
    }));

    return (
      <Touchable.Canvas
        style={[
          { backgroundColor: 'black' },
          style,
          {
            width,
            height,
          },
        ]}>
        {image && <Image image={image} rect={imageRect} fit={'contain'} />}
        <Grid
          x={x}
          y={y}
          width={gridWidth}
          height={gridHeight}
          maxHeight={height}
          maxWidth={width}
          minWidth={minWidth}
          minHeight={minHeight}
        />
      </Touchable.Canvas>
    );
  },
);

export type { ImageCropperRef };
export { ImageCropper };
