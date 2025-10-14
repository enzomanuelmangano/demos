import { Skia } from '@shopify/react-native-skia';

import type { SkPath } from '@shopify/react-native-skia';

// Just to be clear, I have no idea how this code works
// I just copied it from it: https://github.com/samuel-rl/react-native-squircle/blob/main/src/utils/functions.ts

// You can really ignore all this stuff, it's all about creating a Square with rounded corners
// You can visualize here the difference https://github.com/samuel-rl/react-native-squircle/blob/main/assets/explanation.png

// I'm using it because I wanted the internal square to be with a perfect corner smoothing.
// I'm pretty sure that nobody cares about the rounded smoothness of the internal square
// So in a real use case maybe you can avoid all of this complexity and just use a simple RoundedRect from Skia

export interface SquircleParams {
  borderSmoothing: number;
  borderRadius: number;
  width: number;
  height: number;
}

export interface SquirclePathParams extends SquircleParams {
  a: number;
  b: number;
  c: number;
  d: number;
  p: number;
  circularSectionLength: number;
}

export interface DrawSquirclePathParams extends SquirclePathParams {
  path: SkPath;
  borderRadius: number;
}

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

export const getPathParamsForBorder = ({
  borderSmoothing,
  borderRadius,
  width,
  height,
}: SquircleParams): SquirclePathParams => {
  const maxRadius = Math.min(width, height) / 2;
  borderRadius = Math.min(borderRadius, maxRadius);

  const p = Math.min((1 + borderSmoothing) * borderRadius, maxRadius);

  let angleAlpha: number, angleBeta: number;

  if (borderRadius <= maxRadius / 2) {
    angleBeta = 90 * (1 - borderSmoothing);
    angleAlpha = 45 * borderSmoothing;
  } else {
    const diffRatio = (borderRadius - maxRadius / 2) / (maxRadius / 2);

    angleBeta = 90 * (1 - borderSmoothing * (1 - diffRatio));
    angleAlpha = 45 * borderSmoothing * (1 - diffRatio);
  }

  const angleTheta = (90 - angleBeta) / 2;
  const p3ToP4Distance =
    borderRadius * Math.tan(degreesToRadians(angleTheta / 2));

  const circularSectionLength =
    Math.sin(degreesToRadians(angleBeta / 2)) * borderRadius * Math.sqrt(2);

  const c = p3ToP4Distance * Math.cos(degreesToRadians(angleAlpha));
  const d = c * Math.tan(degreesToRadians(angleAlpha));
  const b = (p - circularSectionLength - c - d) / 3;
  const a = 2 * b;

  return {
    a,
    b,
    c,
    d,
    p,
    circularSectionLength,
    width,
    height,
    borderRadius,
    borderSmoothing,
    borderCurve: 'continuous',
  };
};

const drawTopRightBorderPath = ({
  path,
  width,
  height,
  borderRadius,
  a,
  b,
  c,
  d,
  p,
  circularSectionLength,
}: DrawSquirclePathParams) => {
  path.moveTo(Math.max(width / 2, width - p), 0);
  path.cubicTo(
    width - (p - a),
    0,
    width - (p - a - b),
    0,
    width - (p - a - b - c),
    d,
  );
  path.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    false,
    circularSectionLength,
    circularSectionLength,
  );
  path.cubicTo(width, p - a - b, width, p - a, width, Math.min(height / 2, p));
};

const drawBottomRightBorderPath = ({
  path,
  width,
  height,
  borderRadius,
  a,
  b,
  c,
  d,
  p,
  circularSectionLength,
}: DrawSquirclePathParams) => {
  path.lineTo(width, Math.max(height / 2, height - p));
  path.cubicTo(
    width,
    height - (p - a),
    width,
    height - (p - a - b),
    width - d,
    height - (p - a - b - c),
  );
  path.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    false,
    -circularSectionLength,
    circularSectionLength,
  );
  path.cubicTo(
    width - (p - a - b),
    height,
    width - (p - a),
    height,
    Math.max(width / 2, width - p),
    height,
  );
};

const drawBottomLeftBorderPath = ({
  path,
  width,
  height,
  borderRadius,
  a,
  b,
  c,
  d,
  p,
  circularSectionLength,
}: DrawSquirclePathParams) => {
  path.lineTo(Math.min(width / 2, p), height);
  path.cubicTo(p - a, height, p - a - b, height, p - a - b - c, height - d);
  path.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    false,
    -circularSectionLength,
    -circularSectionLength,
  );
  path.cubicTo(
    0,
    height - (p - a - b),
    0,
    height - (p - a),
    0,
    Math.max(height / 2, height - p),
  );
};

const drawTopLeftBorderPath = ({
  path,
  width,
  height,
  borderRadius,
  a,
  b,
  c,
  d,
  p,
  circularSectionLength,
}: DrawSquirclePathParams) => {
  path.lineTo(0, Math.min(height / 2, p));
  path.cubicTo(0, p - a, 0, p - a - b, d, p - a - b - c);
  path.rArcTo(
    borderRadius,
    borderRadius,
    0,
    true,
    false,
    circularSectionLength,
    -circularSectionLength,
  );
  path.cubicTo(p - a - b, 0, p - a, 0, Math.min(width / 2, p), 0);
};

export const drawSquirclePath = ({
  borderSmoothing,
  borderRadius,
  width,
  height,
}: SquircleParams) => {
  const path = Skia.Path.Make();
  const defaultPathParams = getPathParamsForBorder({
    borderSmoothing,
    borderRadius,
    width,
    height,
    borderCurve: 'continuous',
  });
  drawTopRightBorderPath({
    path,
    ...defaultPathParams,
  });
  drawBottomRightBorderPath({
    path,
    ...defaultPathParams,
  });
  drawBottomLeftBorderPath({
    path,
    ...defaultPathParams,
  });
  drawTopLeftBorderPath({
    path,
    ...defaultPathParams,
  });

  return path;
};
