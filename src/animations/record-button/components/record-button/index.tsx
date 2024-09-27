import { Canvas, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from 'pressto';

import { hapticFeedback } from '../../utils/haptics';

import { getRightLinePath } from './create-skia-line';

// Type definition for the RecordButton's props
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

// RecordButton component
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
  // Create the right half of the button's path using Skia
  const rightLinePath = useMemo(() => {
    return getRightLinePath({
      strokeWidth,
      borderRadius,
      width,
      height,
    });
  }, [borderRadius, height, strokeWidth, width]);

  // Create the left half of the button's path by mirroring the right half :)
  const leftLinePath = useMemo(() => {
    const skPath = Skia.Path.Make();
    skPath.addPath(rightLinePath);
    // Don't be scared, this matrix multiplication is just a simple mirroring operation
    // Basically, scaleX = -1, scaleY = 1, and translate by the width of the path
    skPath.transform(Skia.Matrix().translate(width, 0).scale(-1, 1));
    return skPath;
  }, [rightLinePath, width]);

  // Derived value to check if the button is activated based on progress
  const activated = useDerivedValue(() => {
    // This is just an experimental value, you can adjust it to your needs (e.g: progress.value === 1)
    return progress.value > 0.98;
  }, [progress]);

  // Animated style for the container with scaling effect
  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(!activated.value ? 1 : 1.1, {
            mass: 0.5,
          }),
        },
      ],
    };
  }, []);

  // Reaction to the activation state to trigger haptic feedback
  useAnimatedReaction(
    () => activated.value,
    (currentlyActivated, prevActivated) => {
      if (currentlyActivated && !prevActivated) {
        runOnJS(hapticFeedback)();
      }
    },
  );

  // Derived value for the opacity of the internal rounded rectangle
  const internalRoundedRectOpacity = useDerivedValue(() => {
    return withTiming(activated.value ? 1 : 0);
  }, []);

  // Animated style for the text inside the button
  const rTextStyle = useAnimatedStyle(() => {
    return {
      fontSize,
      color: activated.value ? 'white' : color,
      opacity: progress.value,
      fontWeight: activated.value ? '600' : '500',
    };
  }, [color]);

  // Memoized base path properties for reuse
  const basePathProps = useMemo(() => {
    return {
      color: color,
      style: 'stroke',
      strokeWidth: strokeWidth,
      strokeCap: 'round',
    } as const;
  }, [color, strokeWidth]);

  return (
    // Pressable component that scales on press
    <PressableScale onPress={onPress} style={style}>
      <Animated.View style={rContainerStyle}>
        {/* Skia Canvas for drawing paths and shapes */}
        <Canvas
          style={{
            height: height,
            width: width,
            position: 'absolute',
          }}>
          {/* Drawing the left and right paths */}
          <Path path={leftLinePath} {...basePathProps} end={progress} />
          <Path path={rightLinePath} {...basePathProps} end={progress} />
          {/* Drawing the internal (red) rounded rectangle with an animated opacity */}
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
        {/* Container for the text */}
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

// Styles for the container and label
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
