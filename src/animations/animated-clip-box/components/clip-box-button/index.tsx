import type { FC } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ExpandedCircle } from './expanded-circle';

type ClipBoxButtonProps = {
  style: StyleProp<ViewStyle>;
  initialRadius?: number;
  primaryColor?: string;
  highlightColor?: string;
  description: string;
  actionTitle: string;
  onPress?: () => void;
};

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

const ClipBoxButton: FC<ClipBoxButtonProps> = ({
  style,
  initialRadius = 35,
  primaryColor = '#4BA2E4',
  highlightColor = '#83C5F1',
  actionTitle,
  description,
  onPress,
}) => {
  const boxWidth = StyleSheet.flatten(style ?? {}).width as number;
  const circleMargin = boxWidth * 0.12;
  const canvasAreaHeight = circleMargin * 2 + initialRadius;
  const r = useSharedValue(initialRadius);

  const progress = useDerivedValue(() => {
    return clamp(r.value / (boxWidth / 3), 0, 1);
  }, []);

  const rStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], ['black', 'white']);
    return {
      color: color,
    };
  }, []);

  return (
    <View style={style}>
      <View
        onTouchStart={() => {
          r.value = withSpring(boxWidth, {
            damping: 20,
            mass: 1,
            stiffness: 80,
          });
        }}
        onTouchEnd={() => {
          r.value = withSpring(30, {
            damping: 25,
            mass: 1.2,
            stiffness: 120,
          });
        }}
        style={{
          overflow: 'hidden',
          ...StyleSheet.absoluteFillObject,
        }}>
        <ExpandedCircle
          r={r}
          initialR={initialRadius}
          circleMargin={circleMargin}
          primaryColor={primaryColor}
          highlightColor={highlightColor}
          // That's not the effective max radius,
          // but the max radius that the animation will interpolate to
          maxRadius={boxWidth / 2}
        />
      </View>
      <>
        <View
          style={{
            flex: 1,
            marginHorizontal: circleMargin / 2,
            marginTop: canvasAreaHeight,
          }}
          pointerEvents={'none'}>
          <Animated.Text style={[{ fontSize: 15 }, rStyle]}>
            {description}
          </Animated.Text>
        </View>
        <TouchableOpacity
          style={{
            margin: circleMargin / 2,
          }}
          onPress={onPress}>
          <Animated.Text
            style={[{ paddingVertical: 5, fontWeight: 'bold' }, rStyle]}>
            {actionTitle}
          </Animated.Text>
        </TouchableOpacity>
      </>
    </View>
  );
};

export { ClipBoxButton };
