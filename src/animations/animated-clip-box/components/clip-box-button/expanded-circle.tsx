import { StyleSheet } from 'react-native';

import { AntDesign } from '@expo/vector-icons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type ExpandedCircleProps = {
  initialR: number;
  maxRadius: number;
  circleMargin: number;
  r: SharedValue<number>;
  primaryColor: string;
  highlightColor: string;
};

const ExpandedCircle: React.FC<ExpandedCircleProps> = ({
  initialR,
  maxRadius,
  r,
  circleMargin,
  primaryColor,
  highlightColor,
}) => {
  const circleCenter = circleMargin + initialR / 2;

  const iconSize = 40;

  const rMainCircleStyle = useAnimatedStyle(() => {
    return {
      height: r.value * 2,
      left: circleCenter - r.value / 2 - circleMargin / 2,
      top: circleCenter - r.value / 2 - circleMargin / 2,
    };
  }, []);

  const rSecondaryCircleStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        r.value,
        [initialR, maxRadius],
        [primaryColor, highlightColor],
      ),
    };
  }, []);

  return (
    <>
      <Animated.View
        style={[
          styles.circle,
          {
            backgroundColor: primaryColor,
          },
          rMainCircleStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.circle,
          {
            height: initialR * 2,
            left: circleCenter - initialR / 2 - circleMargin / 2,
            top: circleCenter - initialR / 2 - circleMargin / 2,
            justifyContent: 'center',
            alignItems: 'center',
          },
          rSecondaryCircleStyle,
        ]}>
        <AntDesign name="twitter" size={iconSize} color="white" />
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  circle: {
    aspectRatio: 1,
    borderCurve: 'continuous',
    borderRadius: 200,
    position: 'absolute',
  },
});

export { ExpandedCircle };
