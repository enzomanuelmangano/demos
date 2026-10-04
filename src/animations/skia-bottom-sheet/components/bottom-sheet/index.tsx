// Import necessary modules and types
import { PixelRatio, useWindowDimensions } from 'react-native';

import { type FC, memo, useEffect, useState } from 'react';

import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  BackdropBlur,
  Blur,
  BlurMask,
  drawAsImage,
  Group,
  Image,
  rect,
  RoundedRect,
  rrect,
  Skia,
} from 'react-native-skia';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from 'react-native-skia';

// Set default values for bottom sheet props
const DEFAULT_CARD_RADIUS = 30;
const DEFAULT_CARD_INITIAL_OFFSET = 150;
const DEFAULT_BLUR = 10;
const DEFAULT_CARD_COLOR = 'rgba(0,0,0,0.2)';

const SHEET_HANDLE_WIDTH = 100;

// Define the BottomSheetProps type
type BottomSheetProps = {
  size: SharedValue<{
    width: number;
    height: number;
  }>;
  blur?: number;
  cardRadius?: number;
  cardInitialOffset?: number;
  color?: string;
  // The (static) image drawn behind the sheet. When provided, it is blurred
  // once offscreen instead of blurring the backdrop on every frame.
  backdropImage?: SkImage | null;
};

type Size = { width: number; height: number };

// Renders `image` (fit cover, like the background) with the same clamp blur
// BackdropBlur applies, at device pixel size so it maps 1:1 on screen.
const useBlurredImage = (
  image: SkImage | null | undefined,
  size: SharedValue<Size>,
  blur: number,
) => {
  const [canvasSize, setCanvasSize] = useState<Size | null>(null);
  const [blurred, setBlurred] = useState<SkImage | null>(null);

  useAnimatedReaction(
    () => size.get(),
    ({ width, height }) => {
      if (width > 0 && height > 0) {
        scheduleOnRN(setCanvasSize, { width, height });
      }
    },
  );

  useEffect(() => {
    if (!image || !canvasSize) return;
    let cancelled = false;
    const pd = PixelRatio.get();
    const { width, height } = canvasSize;
    drawAsImage(
      <Group transform={[{ scale: pd }]}>
        <Image
          x={0}
          y={0}
          width={width}
          height={height}
          fit="cover"
          image={image}>
          <Blur blur={blur} mode="clamp" />
        </Image>
      </Group>,
      { width: Math.round(width * pd), height: Math.round(height * pd) },
    ).then(result => {
      if (!cancelled) setBlurred(result);
    });
    return () => {
      cancelled = true;
    };
  }, [image, canvasSize, blur]);

  return { blurred, canvasSize };
};

// Define the BottomSheet component
const BottomSheet: FC<BottomSheetProps> = memo(
  ({
    size,
    blur = DEFAULT_BLUR,
    cardRadius = DEFAULT_CARD_RADIUS,
    cardInitialOffset = DEFAULT_CARD_INITIAL_OFFSET,
    color = DEFAULT_CARD_COLOR,
    backdropImage,
  }) => {
    const { blurred, canvasSize } = useBlurredImage(backdropImage, size, blur);

    // Set up animated translateY value with default value of 0
    const translateY = useSharedValue(0);

    // Get the device height using useWindowDimensions
    const { height } = useWindowDimensions();

    // Set up a clamped translateY value that is bound by the minimum and maximum values
    const clampedTranslateY = useDerivedValue(() => {
      return Math.max(
        translateY.get(),
        -(size.get().height - cardInitialOffset),
      );
    }, [translateY, size]);

    // Create a rounded rectangle path with the current clampedTranslateY value
    // This path will be assigned to:
    // 1. The backdrop blur's clip path: This will ensure that the blur is only applied to the bottom sheet
    // 2. The touchable path's path: This will ensure that just this area is touchable
    const roundedRectPath = useDerivedValue(() => {
      const builder = Skia.PathBuilder.Make();
      builder.addRRect(
        rrect(
          rect(
            0,
            size.get().height - cardInitialOffset + clampedTranslateY.get(),
            size.get().width,
            size.get().height,
          ),
          cardRadius,
          cardRadius,
        ),
      );
      return builder.build();
    }, [size, clampedTranslateY]);

    const context = useSharedValue({
      y: 0,
    });

    // Set up a pan gesture handler
    const panGesture = useGestureHandler({
      // Set the initial context value of y to the current clampedTranslateY
      onStart: _ => {
        'worklet';
        context.get().y = clampedTranslateY.get();
      },
      // Update the translateY value based on the gesture's translation
      onActive: event => {
        'worklet';
        translateY.set(event.translationY + context.get().y);
      },
      // Determine if the sheet should snap to open or closed based on its current position
      onEnd: () => {
        'worklet';
        // Here we need to consider the initial offset of the card
        const currentTranslation =
          Math.abs(translateY.get()) + cardInitialOffset;

        // Feel free to choose your own thresholds
        const snapThreshold = height / 3;
        const openedCard = -height / 2;
        const closedCard = 0;

        if (currentTranslation > snapThreshold) {
          translateY.set(withSpring(openedCard));
          return;
        }
        translateY.set(withSpring(closedCard));
      },
    });

    // Calculate the y position of the "sheet handle"
    const y = useDerivedValue(() => {
      return (
        size.get().height - cardInitialOffset + clampedTranslateY.get() + 10 // some padding
      );
    }, [size, clampedTranslateY]);

    const x = useDerivedValue(() => {
      return size.get().width / 2 - SHEET_HANDLE_WIDTH / 2;
    }, [size]);

    return (
      <>
        {blurred && canvasSize ? (
          <Group clip={roundedRectPath}>
            <Image
              x={0}
              y={0}
              width={canvasSize.width}
              height={canvasSize.height}
              fit="fill"
              image={blurred}
            />
          </Group>
        ) : (
          <BackdropBlur clip={roundedRectPath} blur={blur} />
        )}
        <RoundedRect
          x={x}
          y={y}
          r={5}
          width={SHEET_HANDLE_WIDTH}
          height={5}
          color={'white'}
        />
        <Touchable.Path
          {...panGesture}
          start={0}
          end={1}
          path={roundedRectPath}
          color={color}>
          <BlurMask blur={5} style={'inner'} />
        </Touchable.Path>
      </>
    );
  },
);

export { BottomSheet };
