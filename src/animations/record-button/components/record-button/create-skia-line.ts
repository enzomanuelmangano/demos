import { Skia } from '@shopify/react-native-skia';

// My suggestion is to try to recreate this function alone without the borderRadius and internalPadding;
// then, try to add these two parameters to the function and see how the path changes.
// It's a bit tricky, but this is really helpful to play with custom paths in Skia.
export const getRightLinePath = ({
  strokeWidth,
  borderRadius,
  width,
  height,
}: {
  strokeWidth: number;
  borderRadius: number;
  width: number;
  height: number;
}) => {
  const internalPadding = strokeWidth / 2;
  const realWidth = width - internalPadding * 2;
  const realHeight = height - internalPadding * 2;

  const skPath = Skia.Path.Make();
  skPath.moveTo(realWidth / 2, realHeight);
  skPath.lineTo(realWidth - borderRadius, realHeight);
  skPath.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    true,
    borderRadius,
    -borderRadius,
  );
  skPath.lineTo(realWidth, borderRadius + internalPadding);
  skPath.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    true,
    -borderRadius,
    -borderRadius,
  );
  skPath.lineTo(realWidth / 2, internalPadding);

  return skPath;
};
