import { Canvas, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { hapticFeedback } from '../../utils/haptics';

import { getRightLinePath } from './create-skia-line';

export type RecordButtonProps = {
  width: number;
  height: number;
  progress: SharedValue<number>;
  strokeWidth?: number;
  borderRadius?: number;
  color: string;
  onPress?: () => void;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
};

export const RecordButton: React.FC<RecordButtonProps> = ({
  width,
  height,
  progress,
  strokeWidth = 0,
  borderRadius = 0,
  onPress,
  color,
  fontSize = 16,
  style,
}) => {
  const rightLinePath = useMemo(() => {
    return getRightLinePath({
      strokeWidth,
      borderRadius,
      width,
      height,
    });
  }, [borderRadius, height, strokeWidth, width]);

  const leftLinePath = useMemo(() => {
    const skPath = Skia.Path.Make();
    skPath.addPath(rightLinePath);
    skPath.transform(Skia.Matrix().translate(width, 0).scale(-1, 1));
    return skPath;
  }, [rightLinePath, width]);

  const activated = useDerivedValue(() => {
    return progress.value > 0.98;
  }, [progress]);

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(!activated.value ? 1 : 1.1),
        },
      ],
    };
  }, []);

  useAnimatedReaction(
    () => activated.value,
    (currentlyActivated, prevActivated) => {
      if (currentlyActivated && !prevActivated) {
        runOnJS(hapticFeedback)();
      }
    },
  );

  const internalRoundedRectOpacity = useDerivedValue(() => {
    return withTiming(activated.value ? 1 : 0);
  }, []);

  const rTextStyle = useAnimatedStyle(() => {
    return {
      fontSize,
      color: activated.value ? 'white' : color,
      opacity: progress.value,
      fontWeight: activated.value ? '600' : '500',
    };
  }, [color]);

  const basePathProps = useMemo(() => {
    return {
      color: color,
      style: 'stroke',
      strokeWidth: strokeWidth,
      strokeCap: 'round',
    } as const;
  }, [color, strokeWidth]);

  return (
    <PressableScale onPress={onPress} style={style}>
      <Animated.View style={rContainerStyle}>
        <Canvas
          style={{
            height: height,
            width: width,
            position: 'absolute',
          }}>
          <Path path={leftLinePath} {...basePathProps} end={progress} />
          <Path path={rightLinePath} {...basePathProps} end={progress} />
          <RoundedRect
            opacity={internalRoundedRectOpacity}
            x={0}
            y={0}
            width={width}
            height={height}
            r={borderRadius}
            strokeWidth={strokeWidth}
            color={color}
          />
        </Canvas>
        <View
          style={[
            {
              height,
              width,
            },
            styles.container,
          ]}>
          {/* 
              Animated text inside the button, 
              I could have used Skia, but I preferred to use a simple Animated.Text
           */}
          <Animated.Text
            style={[
              {
                fontSize,
              },
              styles.label,
              rTextStyle,
            ]}>
            Record
          </Animated.Text>
        </View>
      </Animated.View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'baseline',
    flex: 1,
  },
});
