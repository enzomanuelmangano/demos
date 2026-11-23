// What the demo's modules import from native packages, for running them outside the app:
// react-native's Dimensions (the window setup.ts names), React's hooks (unused at the call),
// expo-haptics (unused), and react-native-skia's Skia as a recorder: every value createPicture
// hands Skia (the JS doubles, before the JSI turns them into floats) is pushed to `ops`, the
// paint colours as the hsl() strings Skia.Color parses.
export const Dimensions = { get: () => (globalThis as any).__WINDOW };
export const Platform = { OS: 'ios' };
export const useEffect = () => {};
export const useRef = (v: unknown) => ({ current: v });
export const useState = (v: unknown) => [v, () => {}];
export const impactAsync = () => {};
export const selectionAsync = () => {};
export const notificationAsync = () => {};
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' };
export const NotificationFeedbackType = { Success: 'success' };
export const ClipOp = { Difference: 0, Intersect: 1 };

export const ops: (number | string)[] = [];
class Paint {
  color: string = '';
  alpha = 1;
  setColor(c: string) {
    this.color = c;
  }
  setAlphaf(a: number) {
    this.alpha = a;
  }
}
const canvas = {
  drawRRect(rr: any, p: Paint) {
    const r = rr.rect;
    ops.push(1, r.x, r.y, r.width, r.height, rr.rx, rr.ry, p.color, p.alpha);
  },
  save() {
    ops.push(2);
  },
  clipRRect(rr: any, op: number, aa: boolean) {
    const r = rr.rect;
    ops.push(3, r.x, r.y, r.width, r.height, rr.rx, rr.ry, op, aa ? 1 : 0);
  },
  drawImageRect(_img: unknown, s: any, d: any, p: Paint) {
    ops.push(4, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height, p.alpha);
  },
  restore() {
    ops.push(5);
  },
};
export const Skia = {
  Paint: () => new Paint(),
  Color: (c: string) => c,
  XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
  PictureRecorder: () => ({
    beginRecording: () => canvas,
    finishRecordingAsPicture: () => null,
  }),
};
