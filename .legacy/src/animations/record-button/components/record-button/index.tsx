import { StyleSheet, View } from 'react-native';

import { type FC, useMemo } from 'react';

import { PressableScale } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Path, RoundedRect, Skia } from 'react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';

import { getRightLinePath } from './create-skia-line';
import { hapticFeedback } from '../../utils/haptics';

import type { StyleProp, ViewStyle } from 'react-native';

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

export const RecordButton: FC<RecordButtonProps> = ({
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
    const builder = Skia.PathBuilder.Make();
    builder.addPath(rightLinePath);
    builder.transform(Skia.Matrix().translate(width, 0).scale(-1, 1));
    return builder.build();
  }, [rightLinePath, width]);

  const activated = useDerivedValue(() => {
    return progress.get() > 0.98;
  }, [progress]);

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(!activated.get() ? 1 : 1.1),
        },
      ],
    };
  }, []);

  useAnimatedReaction(
    () => activated.get(),
    (currentlyActivated, prevActivated) => {
      if (currentlyActivated && !prevActivated) {
        scheduleOnRN(hapticFeedback);
      }
    },
  );

  const internalRoundedRectOpacity = useDerivedValue(() => {
    return withTiming(activated.get() ? 1 : 0);
  }, []);

  // Opacity changes every scroll frame; color/fontWeight only when
  // `activated` flips. Kept apart so text props aren't re-sent (and the text
  // re-measured) on every frame. fontSize is already in the static style.
  const rTextOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.get(),
    };
  }, []);

  const rTextStyle = useAnimatedStyle(() => {
    return {
      color: activated.get() ? 'white' : color,
      fontWeight: activated.get() ? '600' : '500',
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
              rTextOpacityStyle,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    alignItems: 'baseline',
    alignSelf: 'center',
    flex: 1,
    position: 'absolute',
  },
});
