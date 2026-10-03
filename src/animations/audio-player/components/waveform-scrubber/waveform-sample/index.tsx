import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '../../../constants';

type WaveformScrubberSampleProps = {
  position: number;
  currentX: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  value: number;
};

// The value of scaleY is calculated based on the following conditions:
// 1. If the user is not dragging, the scaleY is 1.
// 2. If the user is dragging, the sample is active and the finger is near the currentX, the scaleY is 1.4.
// 3. If the user is dragging and the sample is active, the scaleY is 0.9.
// 4. If the user is not dragging and the sample is not active, the scaleY is 0.7.

// Note: the sample is active if the currentX is greater than the sample's position.
//       (means the sample has been played)
const getNextScaleY = ({
  isDragging,
  isActive,
  isNearCurrentX,
}: {
  isDragging: boolean;
  isActive: boolean;
  isNearCurrentX: boolean;
}) => {
  'worklet';
  if (!isDragging) {
    return 1;
  }
  if (isNearCurrentX && isActive) {
    return 1.4;
  }
  if (isActive) {
    return 0.9;
  }
  return 0.7;
};

const WaveformScrubberSample: FC<WaveformScrubberSampleProps> = memo(
  ({ position, currentX, isDragging, value }) => {
    const opacity = useSharedValue(0.6);
    const scaleY = useSharedValue(1);

    // currentX moves on every frame for the whole playback, but the targets
    // only flip a few times: start the timing/spring when a target changes
    // instead of allocating two new animations per sample per frame.
    // (The first run applies the target directly, like an animated style's
    // initial value.)
    useAnimatedReaction(
      () => (currentX.get() > position ? 1 : 0.6),
      (target, previous) => {
        if (previous === null) opacity.set(target);
        else if (target !== previous) opacity.set(withTiming(target));
      },
      [position],
    );

    useAnimatedReaction(
      () =>
        getNextScaleY({
          isDragging: isDragging.get(),
          isActive: currentX.get() > position,
          isNearCurrentX: Math.abs(currentX.get() - position) < 20,
        }),
      (target, previous) => {
        if (previous === null) scaleY.set(target);
        else if (target !== previous) scaleY.set(withSpring(target));
      },
      [position],
    );

    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: opacity.get(),
        transform: [
          {
            scaleY: scaleY.get(),
          },
        ],
      };
    }, []);

    return (
      <View style={styles.sampleContainer}>
        <Animated.View
          style={[
            styles.sample,
            {
              // The height of the sample is calculated
              // based on the value of the sample.
              // If the value is 0, just for design purposes,
              // I've forced the height to be 0.1.
              height: 45 * Math.max(value, 0.1),
            },
            rStyle,
          ]}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  sample: {
    backgroundColor: Palette.body,
    borderRadius: 15,
    width: 3,
  },
  sampleContainer: {
    alignItems: 'center',
    flex: 1,
    height: 80,
    justifyContent: 'center',
  },
});

export { WaveformScrubberSample };
