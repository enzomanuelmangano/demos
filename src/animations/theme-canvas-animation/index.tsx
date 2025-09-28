import { useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

import { Group, Rect, Skia, Text, useFont } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';

import { SelectableSquareContainer } from './selectable-square';

import type { SharedValue } from 'react-native-reanimated';

const SQUARE_SIZE = 35;

const APP_TEXT = 'THEME';
const colors = [
  { background: '#F7FFF7', text: '#373737' },
  { background: '#4ECDC4', text: '#2C2C2C' },
  { background: '#1A535C', text: '#E8E8E8' },
  { background: '#EE6C4D', text: '#D4D2D2' },
  { background: '#F38D68', text: '#2C2C2C' },
  { background: '#902D41', text: '#DEDEDE' },
];

const ThemeScreen = () => {
  const { height: canvasHeight, width: canvasWidth } = useWindowDimensions();

  const coordinates = useDerivedValue(() => {
    const squares = [
      { offsetX: -1, offsetY: 0 },
      { offsetX: 0, offsetY: 0 },
      { offsetX: 1, offsetY: 0 },
      { offsetX: 0, offsetY: 1 },
      { offsetX: -1, offsetY: 1 },
      { offsetX: 1, offsetY: 1 },
    ];
    return squares.map(({ offsetX, offsetY }) => ({
      cx: canvasWidth / 2 - SQUARE_SIZE / 2 + offsetX * SQUARE_SIZE * 2,
      cy: canvasHeight / 2 - SQUARE_SIZE / 2 + offsetY * SQUARE_SIZE * 2,
    }));
  }, [canvasWidth, canvasHeight]);

  const selectedIndex = useSharedValue(0);
  const previousSelectedIndex = useSharedValue(0);

  const selectedBackgroundColor = useDerivedValue(() => {
    return colors[selectedIndex.value]?.background || 'black';
  }, [colors, selectedIndex]);

  const previousSelectedBackgroundColor = useDerivedValue(() => {
    return colors[previousSelectedIndex.value]?.background || 'black';
  }, [colors, previousSelectedIndex]);

  const radius = useSharedValue(0);

  const clipPath = useDerivedValue(() => {
    const path = Skia.Path.Make();

    const x = coordinates.value[selectedIndex.value]?.cx ?? 0;
    const y = coordinates.value[selectedIndex.value]?.cy ?? 0;
    path.addCircle(x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2, radius.value);
    return path;
  }, [selectedIndex, coordinates, radius]);

  const onSelectSquare = useCallback(
    (index: number) => {
      if (index === selectedIndex.value) return;

      radius.value = 0;

      radius.value = withTiming(
        canvasHeight,
        {
          duration: 500,
        },
        isFinished => {
          if (isFinished) {
            previousSelectedIndex.value = index;
            radius.value = 0;
          }
        },
      );

      previousSelectedIndex.value = selectedIndex.value;
      selectedIndex.value = index;
    },
    [selectedIndex, previousSelectedIndex, canvasHeight, radius],
  );

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const font = useFont(require('../../../assets/fonts/outfit.ttf'), 40);

  const textY = useDerivedValue(() => {
    return canvasHeight / 2 - 65;
  }, [canvasHeight]);

  const textX = useDerivedValue(() => {
    return canvasWidth / 2 - (font?.measureText(APP_TEXT).width || 0) / 2;
  }, [canvasWidth, font]);

  const selectedTextColor = useDerivedValue(() => {
    return colors[selectedIndex.value]?.text || 'black';
  }, [colors, selectedIndex]);

  const previousSelectedTextColor = useDerivedValue(() => {
    return colors[previousSelectedIndex.value]?.text || 'black';
  }, [colors, previousSelectedIndex]);

  const BackgroundComponent = useCallback(
    ({
      backgroundColor,
      textColor,
    }: {
      backgroundColor: SharedValue<string>;
      textColor: SharedValue<string>;
    }) => {
      return (
        <>
          <Rect
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            color={backgroundColor}
          />
          {font && (
            <Text
              font={font}
              text={APP_TEXT}
              color={textColor}
              x={textX}
              y={textY}
            />
          )}
        </>
      );
    },
    [canvasHeight, canvasWidth, font, textX, textY],
  );

  return (
    <Group>
      {BackgroundComponent({
        backgroundColor: previousSelectedBackgroundColor,
        textColor: previousSelectedTextColor,
      })}
      <Group clip={clipPath}>
        {BackgroundComponent({
          backgroundColor: selectedBackgroundColor,
          textColor: selectedTextColor,
        })}
      </Group>
      {coordinates.value.map((_, index) => (
        <SelectableSquareContainer
          color={colors[index]?.background || 'black'}
          key={index}
          size={SQUARE_SIZE}
          coordinates={coordinates}
          selectedIndex={selectedIndex}
          borderColor={colors[index]?.text || 'white'}
          index={index}
          onSelect={() => {
            onSelectSquare(index);
          }}
        />
      ))}
    </Group>
  );
};

export const ThemeCanvasAnimation = () => {
  return (
    <Touchable.Canvas style={{ flex: 1 }}>
      <ThemeScreen />
    </Touchable.Canvas>
  );
};
