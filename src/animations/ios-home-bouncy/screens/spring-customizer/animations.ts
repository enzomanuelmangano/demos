import { Easing, Keyframe } from 'react-native-reanimated';

const Offset = 20;
const Duration = 500;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EasingFunction = Easing.bezier(0.25, 0.46, 0.45, 0.94).factory() as any;

export const OpeningEnteringKeyframe = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateX: -Offset }],
    easing: EasingFunction,
  },
  15: {
    opacity: 0,
    easing: EasingFunction,
  },
  100: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: EasingFunction,
  },
}).duration(Duration);

export const OpeningExitingKeyframe = new Keyframe({
  0: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: EasingFunction,
  },
  70: {
    opacity: 0,
    easing: EasingFunction,
  },
  100: {
    opacity: 0,
    transform: [{ translateX: Offset }],
    easing: EasingFunction,
  },
}).duration(Duration);

export const ClosingEnteringKeyframe = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateX: Offset }],
    easing: EasingFunction,
  },
  15: {
    opacity: 0,
    easing: EasingFunction,
  },
  100: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: EasingFunction,
  },
}).duration(Duration);

export const ClosingExitingKeyframe = new Keyframe({
  0: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: EasingFunction,
  },
  70: {
    opacity: 0,
    easing: EasingFunction,
  },
  100: {
    opacity: 0,
    transform: [{ translateX: -Offset }],
    easing: EasingFunction,
  },
}).duration(Duration);
