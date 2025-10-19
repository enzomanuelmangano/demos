import { type FC, memo, useMemo } from 'react';

import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Mask,
  RoundedRect,
  useFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TextCode } from './text-code';

type SlideToRevealProps = {
  code: number;
  width: number;
  height: number;
  fontSize?: number;
};

const Font = require('../../../../assets/fonts/SF-Compact-Rounded-Medium.otf');

const SlideToReveal: FC<SlideToRevealProps> = memo(
  ({ code, width, height, fontSize = 34 }) => {
    const font = useFont(Font, fontSize);

    const text = code.toString().split('').join('  ');

    const textY = fontSize / 2 + height / 2;

    const x = useSharedValue(0);
    const y = useSharedValue(0);
    const isMaskActive = useSharedValue(false);

    const gesture = Gesture.Pan()
      .onBegin(event => {
        isMaskActive.value = true;
        x.value = event.x;
        y.value = event.y;
      })
      .onUpdate(event => {
        x.value = event.x;
        y.value = event.y;
      })
      .onFinalize(() => {
        isMaskActive.value = false;
      });

    const maskOpacity = useDerivedValue(() => {
      return withTiming(isMaskActive.value ? 1 : 0);
    }, []);

    const highlightedPoint = useDerivedValue(() => {
      // Return null if the mask is not active
      if (!isMaskActive.value) return null;
      return {
        x: x.value,
        y: y.value,
      };
    });

    const rContentOpacity = useDerivedValue(() => {
      return withTiming(font === null ? 0 : 1);
    }, [font]);

    const blurredContentMask = useMemo(() => {
      return (
        <Group>
          <Circle cx={width / 2} cy={height / 2} r={width} color={'white'} />
          <Circle cx={x} cy={y} r={60} color={'black'} opacity={maskOpacity}>
            <BlurMask blur={20} />
          </Circle>
          <Group />
        </Group>
      );
    }, [height, maskOpacity, width, x, y]);

    const defaultContentMask = useMemo(() => {
      return (
        <Circle cx={x} cy={y} r={60} color={'white'} opacity={maskOpacity}>
          <BlurMask blur={15} />
        </Circle>
      );
    }, [maskOpacity, x, y]);

    // Render the component
    return (
      <GestureDetector gesture={gesture}>
        <Canvas
          style={[
            {
              width,
              height,
            },
          ]}>
          {/* Background rounded rectangle */}
          <RoundedRect
            x={0}
            y={0}
            width={width}
            height={height}
            color={'#0F0F0F'}
            r={20}
          />
          {/* HERE: Uncomment the next few lines to reveal the magic 🪄 */}
          {/* Start by uncommenting this one: */}
          {/* {defaultContentMask} */}
          {/* Uncomment this one separately: */}
          {/* {blurredContentMask} */}
          {/* That's beautiful, isn't it? 🥹 */}

          {/* Group containing masked elements */}
          <Group opacity={rContentOpacity}>
            {/* Alpha mask with two blurred circles */}
            <Mask mode="alpha" mask={blurredContentMask}>
              {/* Display the code text with a blur effect */}
              <TextCode
                code={text}
                textY={textY - 5}
                containerWidth={width}
                font={font}
                highlightedPoint={highlightedPoint}>
                <BlurMask blur={7} />
              </TextCode>
            </Mask>

            {/* Luminance mask with a blurred circle */}
            <Mask mode="luminance" mask={defaultContentMask}>
              {/* Display the code text without a blur effect */}
              <TextCode
                containerWidth={width}
                code={text}
                textY={textY - 5}
                font={font}
                highlightedPoint={highlightedPoint}
              />
            </Mask>
          </Group>
        </Canvas>
      </GestureDetector>
    );
  },
);

// Export the SlideToReveal component
export { SlideToReveal };
