// Import necessary modules and types
import { useWindowDimensions } from 'react-native';

import { type FC, memo } from 'react';

import {
  BackdropBlur,
  BlurMask,
  rect,
  RoundedRect,
  rrect,
  Skia,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

import type { SharedValue } from 'react-native-reanimated';

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
};

// Define the BottomSheet component
const BottomSheet: FC<BottomSheetProps> = memo(
  ({
    size,
    blur = DEFAULT_BLUR,
    cardRadius = DEFAULT_CARD_RADIUS,
    cardInitialOffset = DEFAULT_CARD_INITIAL_OFFSET,
    color = DEFAULT_CARD_COLOR,
  }) => {
    // Set up animated translateY value with default value of 0
    const translateY = useSharedValue(0);

    // Get the device height using useWindowDimensions
    const { height } = useWindowDimensions();

    // Set up a clamped translateY value that is bound by the minimum and maximum values
    const clampedTranslateY = useDerivedValue(() => {
      return Math.max(
        translateY.value,
        -(size.value.height - cardInitialOffset),
      );
    }, [translateY, size]);

    // Create a rounded rectangle path with the current clampedTranslateY value
    // This path will be assigned to:
    // 1. The backdrop blur's clip path: This will ensure that the blur is only applied to the bottom sheet
    // 2. The touchable path's path: This will ensure that just this area is touchable
    const roundedRectPath = useDerivedValue(() => {
      const path = Skia.Path.Make();
      path.addRRect(
        rrect(
          rect(
            0,
            size.value.height - cardInitialOffset + clampedTranslateY.value,
            size.value.width,
            size.value.height,
          ),
          cardRadius,
          cardRadius,
        ),
      );
      return path;
    }, [size, clampedTranslateY]);

    const context = useSharedValue({
      y: 0,
    });

    // Set up a pan gesture handler
    const panGesture = useGestureHandler({
      // Set the initial context value of y to the current clampedTranslateY
      onStart: _ => {
        'worklet';
        context.value.y = clampedTranslateY.value;
      },
      // Update the translateY value based on the gesture's translation
      onActive: event => {
        'worklet';
        translateY.value = event.translationY + context.value.y;
      },
      // Determine if the sheet should snap to open or closed based on its current position
      onEnd: () => {
        'worklet';
        // Here we need to consider the initial offset of the card
        const currentTranslation =
          Math.abs(translateY.value) + cardInitialOffset;

        // Feel free to choose your own thresholds
        const snapThreshold = height / 3;
        const openedCard = -height / 2;
        const closedCard = 0;

        if (currentTranslation > snapThreshold) {
          translateY.value = withSpring(openedCard);
          return;
        }
        translateY.value = withSpring(closedCard);
      },
    });

    // Calculate the y position of the "sheet handle"
    const y = useDerivedValue(() => {
      return (
        size.value.height - cardInitialOffset + clampedTranslateY.value + 10 // some padding
      );
    }, [size, clampedTranslateY]);

    const x = useDerivedValue(() => {
      return size.value.width / 2 - SHEET_HANDLE_WIDTH / 2;
    }, [size]);

    return (
      <>
        <BackdropBlur clip={roundedRectPath} blur={blur} />
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
