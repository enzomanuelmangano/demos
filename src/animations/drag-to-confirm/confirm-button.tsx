import {
  CanvasProps,
  clamp,
  CornerPathEffect,
  Group,
  Path,
  runSpring,
  runTiming,
  SkFont,
  useCanvas,
  useComputedValue,
  useFont,
  useValue,
  vec,
} from '@shopify/react-native-skia';
import Touchable from 'react-native-skia-gesture';
import React from 'react';
import { BlurClipPath } from './components/blur-clip-path';
import { DestinationSquare } from './components/destination-square';
import { useSquarePathGesture } from './hooks/use-square-gesture';
import { AnimatedCenteredText } from './components/animated-text';
import { ConfirmButtonState } from './typings';
import { useStateProgress } from './hooks/use-state-progress';
import { ArrowIcon } from './components/arrow-icon';

const CORNER_PATH_EFFECT_RADIUS = 7;

const squareSize = 40;
const minTranslateX = 15;
const arrowSize = 14;

type ConfirmContentButtonProps = Partial<{
  backgroundColor: string;
  textColor: string;
  onDragComplete: () => void;
  fontSize?: number;
}> & {
  font: SkFont | null;
};

const ConfirmButtonContent: React.FC<ConfirmContentButtonProps> = React.memo(
  ({ backgroundColor = '#000', textColor = 'white', onDragComplete, font }) => {
    const { size } = useCanvas();

    const fontSize = useComputedValue(() => {
      return font?.getSize() ?? 0;
    }, [font]);

    const width = useComputedValue(() => size.current.width, [size]);
    const height = useComputedValue(() => size.current.height, [size]);

    const state = useValue(ConfirmButtonState.Idle);
    const { idleProgress, confirmingProgress, confirmedProgress } =
      useStateProgress(state);

    const translateX = useValue(minTranslateX);

    useComputedValue(() => {
      if (state.current === ConfirmButtonState.Confirming) {
        translateX.current = minTranslateX;
      }
    }, [state]);

    const squareY = useComputedValue(
      () => height.current / 2 - squareSize / 2,
      [height]
    );
    const maxTranslateX = useComputedValue(
      () => width.current - minTranslateX - squareSize,
      [width]
    );

    const {
      path: squarePath,
      gesture: squareGesture,
      offsetRight,
    } = useSquarePathGesture({
      squareY,
      maxTranslateX,
      squareSize,
      minTranslateX,
      translateX,
      onComplete: () => {
        state.current = ConfirmButtonState.Confirmed;
        onDragComplete?.();
      },
    });

    const scale = useValue(1);

    const transformOrigin = useComputedValue(() => {
      return vec(width.current / 2, height.current / 2);
    }, [width, height]);

    const transformedScale = useComputedValue(() => {
      return [{ scale: scale.current }];
    }, [scale]);

    const transformArrow = useComputedValue(() => {
      const clampedTranslateX = clamp(
        translateX.current,
        minTranslateX,
        maxTranslateX.current
      );

      return [
        { translateX: clampedTranslateX + squareSize / 2 - arrowSize / 2 },
        {
          translateY: height.current / 2 - arrowSize / 2,
        },
      ];
    }, [translateX, maxTranslateX, minTranslateX, height]);

    return (
      <Group>
        <BlurClipPath blur={5} path={squarePath}>
          <Group origin={transformOrigin} transform={transformedScale}>
            <Touchable.RoundedRect
              x={0}
              y={0}
              width={width}
              height={height}
              r={8}
              color={backgroundColor}
              onStart={() => {
                if (state.current !== ConfirmButtonState.Idle) {
                  return;
                }
                runSpring(scale, { to: 0.94 });
              }}
              onEnd={() => {
                if (state.current !== ConfirmButtonState.Idle) {
                  return;
                }
                runTiming(scale, { to: 1 }, { duration: 150 }, (isFinished) => {
                  if (isFinished) {
                    state.current = ConfirmButtonState.Confirming;
                  }
                });
              }}
            />
            <Group opacity={confirmingProgress}>
              <DestinationSquare
                maxTranslateX={maxTranslateX}
                squareSize={squareSize}
                squareY={squareY}
                cornerRadius={CORNER_PATH_EFFECT_RADIUS}
                offsetRight={offsetRight}
              />
            </Group>
          </Group>
          {font && (
            <Group>
              <AnimatedCenteredText
                font={font}
                fontSize={fontSize}
                text={'Confirm'}
                color={textColor}
                progress={confirmingProgress}
              />
              <AnimatedCenteredText
                font={font}
                fontSize={fontSize}
                text={'Done'}
                color={'white'}
                progress={confirmedProgress}
              />
              <AnimatedCenteredText
                font={font}
                fontSize={fontSize}
                text={'Buy Now'}
                color={'white'}
                progress={idleProgress}
              />
            </Group>
          )}
        </BlurClipPath>
        <Group transform={transformArrow} opacity={confirmingProgress}>
          <ArrowIcon color={textColor} size={arrowSize} />
        </Group>
        <Group opacity={confirmingProgress}>
          <Touchable.Path
            start={0}
            end={1}
            {...squareGesture}
            path={squarePath}
            color={'rgba(255,255,255,0.15)'}
          >
            <CornerPathEffect r={CORNER_PATH_EFFECT_RADIUS} />
          </Touchable.Path>
        </Group>
        <Group opacity={confirmingProgress}>
          <Path
            path={squarePath}
            style={'stroke'}
            color={textColor}
            strokeWidth={1.8}
          >
            <CornerPathEffect r={CORNER_PATH_EFFECT_RADIUS} />
          </Path>
        </Group>
      </Group>
    );
  }
);

type ConfirmButtonProps = Omit<CanvasProps, 'children'> &
  ConfirmContentButtonProps;

const ConfirmButton: React.FC<ConfirmButtonProps> = React.memo(
  ({ textColor, font, backgroundColor, onDragComplete, ...props }) => {
    return (
      <Touchable.Canvas {...props}>
        <ConfirmButtonContent
          textColor={textColor}
          backgroundColor={backgroundColor}
          onDragComplete={onDragComplete}
          font={font}
        />
      </Touchable.Canvas>
    );
  }
);

export { ConfirmButton };
