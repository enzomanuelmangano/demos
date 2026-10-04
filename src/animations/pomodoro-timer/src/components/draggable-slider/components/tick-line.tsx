import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type TickLineProps = {
  height: number;
  radius: number;
  index: number;
  lineWidth: number;
  color: string;
  linesAmount: number;
  disabled: SharedValue<boolean>;
};

// The tick sits at its p=0 place on the ring; the parent rotates the whole ring
// with the progress, so the per-frame drag work is one transform, not one per tick.
export const TickLine: React.FC<TickLineProps> = ({
  height,
  radius,
  index,
  lineWidth,
  color,
  linesAmount,
  disabled,
}) => {
  const angle = ((2 * Math.PI) / linesAmount) * index;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  const rotation = -Math.atan2(x, y);

  // Depends only on `disabled`, so dragging never re-runs it (and never
  // restarts the color timing).
  const rStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(
        disabled.get() ? 'rgba(222, 208, 208, 0.525)' : color,
      ),
    };
  }, []);

  return (
    <Animated.View
      style={[
        rStyle,
        {
          position: 'absolute',
          height: height,
          width: lineWidth,
          transform: [
            {
              translateX: x - lineWidth / 2,
            },
            {
              translateY: y - height / 2,
            },
            {
              rotate: `${rotation}rad`,
            },
          ],
        },
      ]}
    />
  );
};
