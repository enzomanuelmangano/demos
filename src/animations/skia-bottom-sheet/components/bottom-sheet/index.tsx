// Import necessary modules and types
import type { SkiaValue } from '@shopify/react-native-skia';
import {
  rect,
  rrect,
  BackdropBlur,
  BlurMask,
  RoundedRect,
  Selector,
  Skia,
  runSpring,
  useComputedValue,
  useValue,
} from '@shopify/react-native-skia';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

// Set default values for bottom sheet props
const DEFAULT_CARD_RADIUS = 30;
const DEFAULT_CARD_INITIAL_OFFSET = 150;
const DEFAULT_BLUR = 10;
const DEFAULT_CARD_COLOR = 'rgba(0,0,0,0.2)';

const SHEET_HANDLE_WIDTH = 100;

// Define the BottomSheetProps type
type BottomSheetProps = {
  window: SkiaValue<{
    width: number;
    height: number;
  }>;
  blur?: number;
  cardRadius?: number;
  cardInitialOffset?: number;
  color?: string;
};

// Define the BottomSheet component
const BottomSheet: React.FC<BottomSheetProps> = React.memo(
  ({
    window,
    blur = DEFAULT_BLUR,
    cardRadius = DEFAULT_CARD_RADIUS,
    cardInitialOffset = DEFAULT_CARD_INITIAL_OFFSET,
    color = DEFAULT_CARD_COLOR,
  }) => {
    // Set up animated translateY value with default value of 0
    const translateY = useValue(0);

    // Get the device height using useWindowDimensions
    const { height } = useWindowDimensions();

    // Set up a clamped translateY value that is bound by the minimum and maximum values
    const clampedTranslateY = useComputedValue(() => {
      return Math.max(
        translateY.current,
        -(window.current.height - cardInitialOffset),
      );
    }, [translateY, window]);

    // Create a rounded rectangle path with the current clampedTranslateY value
    // This path will be assigned to:
    // 1. The backdrop blur's clip path: This will ensure that the blur is only applied to the bottom sheet
    // 2. The touchable path's path: This will ensure that just this area is touchable
    const roundedRectPath = useComputedValue(() => {
      const path = Skia.Path.Make();
      path.addRRect(
        rrect(
          rect(
            0,
            window.current.height -
              cardInitialOffset +
              clampedTranslateY.current,
            window.current.width,
            window.current.height,
          ),
          cardRadius,
          cardRadius,
        ),
      );
      return path;
    }, [window, clampedTranslateY]);

    // Set up a pan gesture handler
    const panGesture = useGestureHandler<{
      y: number;
    }>({
      // Set the initial context value of y to the current clampedTranslateY
      onStart: (_, context) => {
        context.y = clampedTranslateY.current;
      },
      // Update the translateY value based on the gesture's translation
      onActive: (event, context) => {
        translateY.current = event.translationY + context.y;
      },
      // Determine if the sheet should snap to open or closed based on its current position
      onEnd: () => {
        // Here we need to consider the initial offset of the card
        const currentTranslation =
          Math.abs(translateY.current) + cardInitialOffset;

        // Feel free to choose your own thresholds
        const snapThreshold = height / 3;
        const openedCard = -height / 2;
        const closedCard = 0;

        if (currentTranslation > snapThreshold) {
          runSpring(translateY, {
            to: openedCard,
          });
          return;
        }
        runSpring(translateY, {
          to: closedCard,
        });
      },
    });

    // Calculate the y position of the "sheet handle"
    const y = useComputedValue(() => {
      return (
        window.current.height -
        cardInitialOffset +
        clampedTranslateY.current +
        10 // some padding
      );
    }, [window, clampedTranslateY]);

    return (
      <>
        <BackdropBlur clip={roundedRectPath} blur={blur} />
        <RoundedRect
          x={Selector(window, w => w.width / 2 - SHEET_HANDLE_WIDTH / 2)}
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
