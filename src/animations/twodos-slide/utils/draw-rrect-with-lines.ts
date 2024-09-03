import { Skia } from '@shopify/react-native-skia';

type DrawRRectWithLinesParams = {
  size: number;
  innerBorderRadius: number;
  internalSquarePathPadding: number;
};

// This function seems very hard, but honestly it's really easy.
// Basically, we're building from scratch a rounded rectangle line by line.
// We want to do that in order to decide where the lines start and end.

// P.S: We're not even using this function, since at the end I decided to go for the "draw squircle" approach

export const drawRRectWithLines = ({
  size,
  innerBorderRadius,
  internalSquarePathPadding,
}: DrawRRectWithLinesParams) => {
  const recreatedRoundedRectWithLines = Skia.Path.Make();
  recreatedRoundedRectWithLines.moveTo(size / 2, internalSquarePathPadding);
  recreatedRoundedRectWithLines.lineTo(
    size - internalSquarePathPadding - innerBorderRadius,
    internalSquarePathPadding,
  );
  recreatedRoundedRectWithLines.rArcTo(
    innerBorderRadius,
    innerBorderRadius,
    90,
    true,
    false,
    innerBorderRadius,
    innerBorderRadius,
  );
  recreatedRoundedRectWithLines.lineTo(
    size - internalSquarePathPadding,
    size - internalSquarePathPadding - innerBorderRadius,
  );
  recreatedRoundedRectWithLines.rArcTo(
    innerBorderRadius,
    innerBorderRadius,
    90,
    true,
    false,
    -innerBorderRadius,
    innerBorderRadius,
  );
  recreatedRoundedRectWithLines.lineTo(
    internalSquarePathPadding + innerBorderRadius,
    size - internalSquarePathPadding,
  );
  recreatedRoundedRectWithLines.rArcTo(
    innerBorderRadius,
    innerBorderRadius,
    90,
    true,
    false,
    -innerBorderRadius,
    -innerBorderRadius,
  );
  recreatedRoundedRectWithLines.lineTo(
    internalSquarePathPadding,
    internalSquarePathPadding + innerBorderRadius,
  );
  recreatedRoundedRectWithLines.rArcTo(
    innerBorderRadius,
    innerBorderRadius,
    90,
    true,
    false,
    innerBorderRadius,
    -innerBorderRadius,
  );
  recreatedRoundedRectWithLines.close();
  return recreatedRoundedRectWithLines;
};
