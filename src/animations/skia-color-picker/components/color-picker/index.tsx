import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  Shader,
  Shadow,
  Skia,
  SweepGradient,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { radialGradientShader } from './shader';
import { clampToCircle } from './utils/clamp-to-circle';
import { getHueFromPosition } from './utils/get-hue-from-position';
import { getSaturationFromPosition } from './utils/get-saturation-from-position';
import { hsvToRgb } from './utils/hsv-to-rgb';

import type { Point } from './types';
import type { SkPath } from '@shopify/react-native-skia';
import type { FC } from 'react';

type ColorPickerProps = {
  canvasSize: number;
  blur?: number;
  pickerShape?: SkPath;
  onColorUpdate?: (color: string) => void;
};

// ColorPicker component
const ColorPicker: FC<ColorPickerProps> = ({
  canvasSize,
  blur,
  // Set default shape for the color picker if none provided
  pickerShape = Skia.Path.MakeFromSVGString(
    'M22 .889C9.943.889.167 10.664.167 22.723C.167 37.127 22 59.111 22 59.111S43.833 37.43 43.833 22.723C43.833 10.664 34.057.889 22 .889z',
  )!,
  onColorUpdate,
}) => {
  // Calculate the bounds for the picker
  const pickerBounds = pickerShape.getBounds();

  // Calculate the center of the canvas
  const center = {
    x: canvasSize / 2,
    y: canvasSize / 2,
  };

  // Initial position for the color picker
  const pickerX = useSharedValue(center.x);
  const pickerY = useSharedValue(center.y);

  // Define the max size for the color picker based on canvas size and picker bounds
  const maxColorPickerSize =
    canvasSize - Math.max(pickerBounds.height, pickerBounds.width) * 2;

  // Calculate the transform for the picker based on its position
  const pickerTransform = useDerivedValue(() => {
    return [
      {
        translateX: pickerX.value - pickerBounds.width / 2,
      },
      {
        translateY: pickerY.value - pickerBounds.height,
      },
    ];
  }, [pickerBounds]);

  // Function to move the picker
  const onMove = ({ x: locationX, y: locationY }: Point) => {
    'worklet';
    const clamped = clampToCircle({
      point: { x: locationX, y: locationY },
      centerX: center.x,
      centerY: center.y,
      radius: maxColorPickerSize / 2,
    });
    pickerX.value = clamped.x;
    pickerY.value = clamped.y;
  };

  const gesture = Gesture.Pan()
    .onBegin(({ x, y }) => {
      onMove({ x, y });
    })
    .onUpdate(({ x, y }) => {
      onMove({ x, y });
    });

  // The ❤️ of the implementation.
  // Compute the RGBA color value based on the picker's current position on the canvas
  const rgba = useDerivedValue(() => {
    // Calculate the horizontal distance (dx) between the current picker position and the center of the canvas.
    const dx = pickerX.value - center.x;

    // Calculate the vertical distance (dy) between the current picker position and the center of the canvas.
    const dy = pickerY.value - center.y;

    // Determine the hue (color shade) based on the picker's position relative to the canvas's center.
    // This function likely converts the picker's polar coordinates to a hue value.
    const hue = getHueFromPosition(dx, dy);

    // Determine the saturation (color intensity) based on the picker's distance from the center and the
    // maximum possible distance (which is half of the maximum size the color picker can be).
    // The farther the picker from the center, the more saturated the color.
    const saturation = getSaturationFromPosition(
      dx,
      dy,
      maxColorPickerSize / 2,
    );

    // Convert the hue, saturation, and a fixed value of 100 for brightness into RGB values.
    // The `hsvToRgb` function likely takes in hue, saturation, and value (brightness) and returns
    // the corresponding Red, Green, and Blue values.
    const [r, g, b] = hsvToRgb(hue, saturation, 100);

    // Return the RGBA string using the computed RGB values and a fixed alpha (opacity) value of 1 (fully opaque).
    return `rgba(${r}, ${g}, ${b}, 1)`;

    // The computation is re-run whenever the pickerX or pickerY values change, ensuring the color
    // is updated in response to picker movement.
  }, [pickerX, pickerY]);

  // Effect to update the color value
  useAnimatedReaction(
    () => rgba.value,
    color => {
      if (onColorUpdate) {
        scheduleOnRN(onColorUpdate, color);
      }
    },
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View>
        <Canvas
          style={{
            width: canvasSize,
            height: canvasSize,
          }}>
          <Group
            transform={[
              {
                translateX: pickerBounds.height,
              },
              {
                translateY: pickerBounds.height,
              },
              {
                scale: maxColorPickerSize / canvasSize,
              },
            ]}>
            {blur && (
              <>
                <Circle c={center} r={canvasSize / 2}>
                  <SweepGradient
                    c={center}
                    colors={['cyan', 'magenta', 'yellow', 'cyan']}
                  />
                </Circle>
                <BlurMask blur={blur} style={'solid'} />
              </>
            )}
            <Circle c={center} r={canvasSize / 2}>
              <Shader
                source={radialGradientShader}
                uniforms={{
                  size: canvasSize,
                }}
              />
            </Circle>
          </Group>

          <Group transform={pickerTransform}>
            <Path
              path={pickerShape}
              color={'white'}
              style={'stroke'}
              strokeWidth={5}>
              <Shadow dx={0} dy={0} blur={20} color="rgba(0,0,0,1)" />
            </Path>

            <Path
              path={pickerShape}
              color={rgba}
              style={'fill'}
              strokeWidth={5}
            />
          </Group>
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
};

export { ColorPicker };
