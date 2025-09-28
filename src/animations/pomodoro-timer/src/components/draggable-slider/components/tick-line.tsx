import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type TickLineProps = {
  height: number;
  radius: number;
  progressRadiants: SharedValue<number>;
  index: number;
  lineWidth: number;
  color: string;
  linesAmount: number;
  disabled: SharedValue<boolean>;
};

export const TickLine: React.FC<TickLineProps> = ({
  height,
  radius,
  progressRadiants,
  index,
  lineWidth,
  color,
  linesAmount,
  disabled,
}) => {
  const rStyle = useAnimatedStyle(() => {
    const angle =
      ((2 * Math.PI) / linesAmount) * index - progressRadiants.value;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const rotation = -Math.atan2(x, y);

    return {
      backgroundColor: withTiming(
        disabled.value ? 'rgba(222, 208, 208, 0.525)' : color,
      ),
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
        },
      ]}
    />
  );
};
