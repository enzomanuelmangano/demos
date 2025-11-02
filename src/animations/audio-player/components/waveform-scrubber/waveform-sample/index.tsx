import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
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
    const rStyle = useAnimatedStyle(() => {
      const isActive = currentX.value > position;
      const isNearCurrentX = Math.abs(currentX.value - position) < 20;

      const scaleY = getNextScaleY({
        isDragging: isDragging.value,
        isActive,
        isNearCurrentX,
      });

      return {
        opacity: withTiming(isActive ? 1 : 0.6),
        transform: [
          {
            scaleY: withSpring(scaleY),
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
