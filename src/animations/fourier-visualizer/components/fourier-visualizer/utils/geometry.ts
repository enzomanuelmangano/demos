import { fitbox, processTransform2d, Skia, vec } from 'react-native-skia';

import type {
  SkContourMeasure,
  SkPath,
  SkRect,
  Vector,
} from 'react-native-skia';

export const fitRect = (src: SkRect, dst: SkRect) =>
  processTransform2d(fitbox('contain', src, dst));

export const getPointAtLength = (length: number, from: Vector, to: Vector) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const x = from.x + length * Math.cos(angle);
  const y = from.y + length * Math.sin(angle);
  return vec(x, y);
};

export class PathGeometry {
  private totalLength = 0;
  private contour: SkContourMeasure | null;

  constructor(path: SkPath, resScale = 1) {
    const it = Skia.ContourMeasureIter(path, false, resScale);
    // Skia skips zero-length contours, so a tap-sized stroke has none
    const contour = it.next();
    this.totalLength = contour?.length() ?? 0;
    this.contour = contour;
  }

  getTotalLength() {
    return this.totalLength;
  }

  getPointAtLength(length: number) {
    if (!this.contour) {
      return vec(0, 0);
    }
    const [pos] = this.contour.getPosTan(length);
    return pos;
  }
}
