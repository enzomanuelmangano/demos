import { PixelRatio } from 'react-native';

import { useEffect, useMemo, useState } from 'react';

import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Blur,
  Circle,
  drawAsImage,
  Group,
  Image,
  Paint,
  Shadow,
  Skia,
  Text,
  rect,
  rrect,
} from 'react-native-skia';
import Touchable from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import { BackgroundDots } from './background-dots';
import { Donut } from './donut';
import { Picker } from './picker';

import type { ReactElement } from 'react';
import type { SkFont, SkImage } from 'react-native-skia';

// Rasterizes a static layer once at device pixel density. The blur masks
// below are expensive and the canvas redraws on every drag frame; drawing a
// pre-rendered image instead gives the same pixels. Until the image is ready
// the live layer is drawn, so the first frames look the same too.
const useStaticLayer = (
  element: ReactElement,
  width: number,
  height: number,
) => {
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    let cancelled = false;
    const pd = PixelRatio.get();
    drawAsImage(<Group transform={[{ scale: pd }]}>{element}</Group>, {
      width: Math.ceil(width * pd),
      height: Math.ceil(height * pd),
    }).then(img => {
      if (!cancelled) setImage(img);
    });
    return () => {
      cancelled = true;
    };
    // `element` is rebuilt every render; its content only depends on size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  if (!image) return element;
  return (
    <Image
      image={image}
      x={0}
      y={0}
      width={Math.ceil(width * PixelRatio.get()) / PixelRatio.get()}
      height={Math.ceil(height * PixelRatio.get()) / PixelRatio.get()}
      fit="fill"
    />
  );
};

// Layer paint that blurs its content (a GPU image filter)
const BlurPaint = ({ blur }: { blur: number }) => (
  <Paint>
    <Blur blur={blur} />
  </Paint>
);

const circleRRect = (cx: number, cy: number, r: number) =>
  rrect(rect(cx - r, cy - r, r * 2, r * 2), r, r);

type CircularSliderProps = {
  width: number;
  height: number;
  strokeWidth?: number;
  font: SkFont;
  minVal?: number;
  maxVal?: number;
  onValueChange?: (value: number) => void;
};

// The CircularSlider component creates an interactive, circular slider using Skia.
// It combines various sub-components to create a visually appealing and functional
// circular slider with a donut-shaped progress indicator, background dots,
// and a picker for user interaction.
export const CircularSlider: React.FC<CircularSliderProps> = ({
  width,
  height,
  strokeWidth = 70,
  font,
  onValueChange,
  maxVal = 100,
  minVal = 0,
}) => {
  const internalOffset = 20;
  const initialAngleRad = Math.PI / 2;
  const cx = width / 2;
  const cy = height / 2;
  const radius = (width - internalOffset - strokeWidth) / 2;

  const translateX = useSharedValue(cx);
  const translateY = useSharedValue(0);

  const progress = useDerivedValue(() => {
    const x = translateX.get() - cx;
    const y = translateY.get() - cy;
    let theta = Math.atan2(y, x) + initialAngleRad;
    if (theta < 0) theta += 2 * Math.PI;
    return theta / (2 * Math.PI);
  }, [cx, cy]);

  const circlePath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    builder.addCircle(cx, cy, radius + strokeWidth / 2);
    return builder.build();
  }, [cx, cy, radius, strokeWidth]);

  const animatedValue = useDerivedValue(() => {
    return Math.min(Math.round(progress.get() * maxVal) + minVal, maxVal);
  }, [maxVal, minVal]);

  const currentTextValue = useDerivedValue(() => {
    return animatedValue.get().toString();
  }, []);

  const textPositionX = useDerivedValue(() => {
    return cx - font.measureText(currentTextValue.get()).width / 2 - 2;
  }, [font, cx]);

  useAnimatedReaction(
    () => animatedValue.get(),
    (curr, prev) => {
      if (prev == null) return;
      if (onValueChange) scheduleOnRN(onValueChange, curr);
    },
  );

  // The BlurMask filters these layers used are computed on the CPU (a mask
  // blurred in software for every new geometry). Each one is rebuilt from a
  // GPU blur instead, with the same result:
  // - style 'inner' (blurred coverage × shape) = blurred shape clipped to it
  // - style 'solid' (shape ∪ blurred shape) = blurred shape, shape on top
  const outerCircle = circleRRect(cx, cy, radius + strokeWidth / 2);
  const outerRimCircle = circleRRect(cx, cy, radius + strokeWidth / 2 + 2);

  const backgroundLayer = useStaticLayer(
    <Group>
      <Group>
        {/* BlurMask blur={30} style={'inner'} */}
        <Group clip={outerCircle}>
          <Group layer={<BlurPaint blur={30} />}>
            <Circle
              cx={cx}
              cy={cy}
              r={radius + strokeWidth / 2}
              color={'#ebebeb'}
            />
          </Group>
        </Group>
        <Group
          layer={
            <Paint>
              <Shadow dx={0} dy={20} blur={10} color="#e9e9e9" inner />
            </Paint>
          }>
          {/* BlurMask blur={10} style={'inner'} */}
          <Group clip={outerRimCircle}>
            <Group layer={<BlurPaint blur={10} />}>
              <Circle
                cx={cx}
                cy={cy}
                r={radius + strokeWidth / 2 + 2}
                color={'#f7f7f7'}
              />
            </Group>
          </Group>
        </Group>
      </Group>

      <BackgroundDots
        cx={cx}
        cy={cy}
        radius={radius}
        initialAngleRad={initialAngleRad}
      />
    </Group>,
    width,
    height,
  );

  const innerDiscLayer = useStaticLayer(
    <Group>
      {/* BlurMask blur={20} style={'solid'}, with the 0.5 opacity applied
          to the union as the paint did */}
      <Group layer={<Paint opacity={0.5} />}>
        <Group layer={<BlurPaint blur={20} />}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius - strokeWidth / 2}
            color={'#222222'}
          />
        </Group>
        <Circle
          cx={cx}
          cy={cy}
          r={radius - strokeWidth / 2}
          color={'#222222'}
        />
      </Group>
      <Circle cx={cx} cy={cy} r={radius - strokeWidth / 2} color={'#FFFFFF'} />
    </Group>,
    width,
    height,
  );

  return (
    <Touchable.Canvas style={{ width, height }}>
      {backgroundLayer}

      <Donut
        cx={cx}
        cy={cy}
        radius={radius}
        strokeWidth={strokeWidth}
        progress={progress}
        initialAngleRad={initialAngleRad}
      />

      {/* The glow: BlurMask blur={100} style={'solid'} on the arc. As a mask
          filter it re-blurred a huge software mask on every drag frame (the
          main cost of this demo); a blurred layer plus the arc on top is the
          same union, done on the GPU. */}
      <Group clip={circlePath}>
        <Donut
          cx={cx}
          cy={cy}
          radius={radius}
          strokeWidth={strokeWidth}
          progress={progress}
          initialAngleRad={initialAngleRad}
          layer={<BlurPaint blur={100} />}
        />
        <Donut
          cx={cx}
          cy={cy}
          radius={radius}
          strokeWidth={strokeWidth}
          progress={progress}
          initialAngleRad={initialAngleRad}
        />
      </Group>

      <Group clip={circlePath}>
        <Picker
          cx={cx}
          cy={cy}
          radius={radius}
          strokeWidth={strokeWidth}
          translateX={translateX}
          translateY={translateY}
        />
      </Group>

      {innerDiscLayer}

      <Text
        text={currentTextValue}
        color={'#111'}
        x={textPositionX}
        y={cy + font.getSize() / 3}
        font={font}
      />
    </Touchable.Canvas>
  );
};
