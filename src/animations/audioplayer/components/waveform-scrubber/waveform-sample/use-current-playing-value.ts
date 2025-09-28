import { useEffect } from 'react';

import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DURATION } from '../../../constants';

// This hook is responsible for the animation of
// the waveform scrubber.

// The value of the waveform scrubber
// is given by two different situations:
// - The user is dragging the scrubber
// - The waveform is playing

// Note: while using withTiming inside this hook,
// I've always forced Easing.linear as easing function! (That's not the default one)
const useCurrentPlayingValue = ({
  waveformContentWidth,
}: {
  waveformContentWidth: number;
}) => {
  // These two values are used to determine
  // if the user is dragging the scrubber
  // and to determine the value of the scrubber (x-axis)
  const touchedX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // This one, by default, is the value of
  // the automatic animation (when the waveform is playing)
  // But when the user is dragging the scrubber,
  // this value is set to the touchedX value
  const currentX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(event => {
      touchedX.value = event.x;
      isDragging.value = true;
    })
    .onUpdate(event => {
      touchedX.value = event.x;
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  // At the beginning, the animation is runned.
  useEffect(() => {
    currentX.value = withTiming(waveformContentWidth, {
      duration: DURATION * 1000,
      easing: Easing.linear,
    });
  }, [currentX, waveformContentWidth]);

  useAnimatedReaction(
    () => {
      return touchedX.value;
    },
    // eslint-disable-next-line @typescript-eslint/no-shadow
    (touchedX, prevTouchedX) => {
      if (touchedX === prevTouchedX || !isDragging.value) {
        return;
      }
      // If we interact with the waveform scrubber,
      // we want to cancel the animation
      // started in the useEffect above
      cancelAnimation(currentX);
      currentX.value = touchedX;
    },
  );

  useAnimatedReaction(
    () => {
      return isDragging.value;
    },
    (isTouching, prevIsTouching) => {
      if (isTouching === prevIsTouching) {
        return;
      }
      // If we stop interacting with the waveform scrubber,
      // we want to restart the animation.
      if (!isTouching) {
        // Of course, we want to restart the animation
        // from the current value of the scrubber (not from 0)
        // So we need to calculate the remaining seconds
        const remainingSeconds =
          DURATION * (1 - currentX.value / waveformContentWidth);

        currentX.value = withTiming(waveformContentWidth, {
          duration: remainingSeconds * 1000,
          easing: Easing.linear,
        });
      }
    },
    [waveformContentWidth],
  );

  return {
    panGesture,
    currentX,
    isDragging,
  };
};

export { useCurrentPlayingValue };
