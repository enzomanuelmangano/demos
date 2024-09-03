// Importing necessary modules and types
import { Skia, rect, rrect } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

// Importing constant for screen width
import { ScreenWidth } from '../constants';

// Function to determine if a line is a big line
const isBigLine = (i: number, bigLineEach: number = 10) => {
  'worklet';
  return i % bigLineEach === 0;
};

// Function to generate path for lines based on parameters
export const getLinesPath = (params: {
  linesAmount: number;
  spacePerLine: number;
  maxLineHeight: number;
  minLineHeight: number;
  type: 'all' | 'bigLines' | 'smallLines';
  bigLineEach?: number;
  lineWidth?: number;
  scrollOffset: SharedValue<number>;
}) => {
  'worklet';

  // Destructuring parameters
  const {
    linesAmount,
    spacePerLine,
    maxLineHeight,
    minLineHeight,
    type,
    bigLineEach = 10,
    lineWidth = 1.5,
    scrollOffset,
  } = params;

  // Creating a new Skia path
  const skPath = Skia.Path.Make();

  // Looping through linesAmount + 1 times to generate paths for lines
  for (let i = 0; i < linesAmount + 1; i++) {
    // Skipping iteration if it's not required based on type
    if (type === 'bigLines' && !isBigLine(i)) {
      continue;
    }
    if (type === 'smallLines' && isBigLine(i)) {
      continue;
    }

    // Determining line height and offset based on iteration
    const lineHeight = i % bigLineEach === 0 ? maxLineHeight : minLineHeight;
    const offsetY = (maxLineHeight - lineHeight) / 2;
    const offsetX = i * spacePerLine;

    // Determining the base scroll view position
    const baseScrollView = -scrollOffset.value + ScreenWidth / 2;

    // Skipping iteration if line is outside the visible area
    if (
      baseScrollView < offsetX - ScreenWidth / 2 ||
      baseScrollView > offsetX + ScreenWidth / 2
    ) {
      continue;
    }

    // Calculating the scroll offset for current line
    const scrollOffsetX = offsetX + scrollOffset.value;

    // Creating a rounded rectangle representing the line
    const roundedRect = rrect(
      rect(scrollOffsetX, offsetY, lineWidth, lineHeight),
      10,
      10,
    );

    // Adding the rounded rectangle to the Skia path
    skPath.addRRect(roundedRect);
  }

  // Returning the generated Skia path
  return skPath;
};
