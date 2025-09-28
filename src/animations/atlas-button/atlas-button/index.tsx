import type { DataSourceParam } from '@shopify/react-native-skia';
import {
  Canvas,
  fitbox,
  Group,
  ImageSVG,
  rect,
  useSVG,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedSquares } from './animated-squares';

type AtlasButtonProps = {
  width: number;
  height: number;
  onPress?: () => void;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  svgIcon: DataSourceParam;
  iconSize?: number;
  colors: Array<Float32Array>;
  horizontalSquaresAmount?: number;
};

export const AtlasButton: React.FC<AtlasButtonProps> = ({
  width,
  height,
  onPress,
  svgIcon,
  label,
  iconSize: _iconSize,
  colors,
  horizontalSquaresAmount = 50,
}) => {
  const iconSize = width * 0.2;

  const isActive = useSharedValue(false);
  const tapGesture = Gesture.Tap()
    .maxDuration(10000)
    .onTouchesDown(() => {
      isActive.value = true;
    })
    .onTouchesUp(() => {
      if (onPress) {
        scheduleOnRN(onPress);
      }
    })
    .onFinalize(() => {
      isActive.value = false;
    });

  const progress = useDerivedValue<number>(() => {
    return withTiming(isActive.value ? 1 : 0, {
      duration: 1000,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  });

  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.95]),
        },
      ],
    };
  }, []);

  const imageSvg = useSVG(svgIcon);

  const textStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value * 3,
      top: interpolate(
        progress.value * 3,
        [0, 1],
        [50, 25],
        Extrapolation.CLAMP,
      ),
    };
  }, []);

  const iconStyle = useAnimatedStyle(() => {
    return {
      top: interpolate(
        progress.value * 3,
        [0, 1],
        [0, -25],
        Extrapolation.CLAMP,
      ),
    };
  }, []);

  const iconCanvasSize = useMemo(() => {
    return {
      width: iconSize,
      height: iconSize,
    };
  }, [iconSize]);

  const iconTransform = useMemo(() => {
    if (!imageSvg) return fitbox('contain', rect(0, 0, 0, 0), rect(0, 0, 0, 0));
    return fitbox(
      'contain',
      rect(0, 0, imageSvg.width(), imageSvg.height()),
      rect(0, 0, iconSize, iconSize),
    );
  }, [iconSize, imageSvg]);

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[rStyle, styles.center]}>
        <Canvas
          style={{
            width,
            height,
          }}>
          <AnimatedSquares
            progress={progress}
            width={width}
            height={height}
            colors={colors}
            horizontalSquaresAmount={horizontalSquaresAmount}
          />
        </Canvas>
        <Animated.View style={styles.content}>
          {imageSvg && (
            <Animated.View style={iconStyle}>
              <Canvas style={iconCanvasSize}>
                <Group transform={iconTransform}>
                  <ImageSVG svg={imageSvg} style={'fill'} />
                </Group>
              </Canvas>
            </Animated.View>
          )}
          <Animated.Text style={[styles.label, { width }, textStyle]}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    position: 'absolute',
  },
});
