import type { SkContourMeasure, SkPath } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';

export class PathGeometry {
  private totalLength = 0;
  private contour: SkContourMeasure;

  constructor(path: SkPath, resScale = 1) {
    const it = Skia.ContourMeasureIter(path, false, resScale);
    const contour: SkContourMeasure = it.next()!;
    this.totalLength = contour.length();
    this.contour = contour;
  }

  getTotalLength() {
    return this.totalLength;
  }

  getPointAtLength(length: number) {
    const [pos] = this.contour.getPosTan(length);
    return pos;
  }
}
