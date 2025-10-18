import { StyleSheet } from 'react-native';

import { Canvas, FitBox, Path, rect, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

type SliderProps = {
  pickerSize?: number;
  sliderWidth?: number;
  sliderHeight?: number;
  minValue?: number;
  maxValue?: number;
  color?: string;
};

const PRIMARY_COLOR = '#6141B9';

const BalloonPath = Skia.Path.MakeFromSVGString(
  'M250.035 633.212C191.503 601.79 -40.8238 460.104 6.50042 212.662C60.5479 -69.9336 480.586 -71.6198 536.5 212.662C584.398 456.188 349.649 596.016 281.356 631.103L323.681 686.551C329.675 694.404 325.058 705.72 315.247 706.885C300.617 708.622 281.362 710.5 266.5 710.5C251.638 710.5 232.383 708.622 217.753 706.885C207.942 705.72 203.325 694.404 209.319 686.551L250.035 633.212Z',
)!;

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

const Slider: React.FC<SliderProps> = ({
  pickerSize = 50,
  sliderHeight = 4,
  sliderWidth = 300,
  minValue = 0,
  maxValue = 100,
  color = PRIMARY_COLOR,
}) => {
  const defaultPickerBorderRadius = pickerSize / 2.5;
  const defaultPickerBorderWidth = Math.floor(pickerSize / 3);
  const defaultScale = 0.7;

  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const scale = useSharedValue(defaultScale);
  const pickerBorderRadius = useSharedValue(defaultPickerBorderRadius);
  const pickerBorderWidth = useSharedValue(defaultPickerBorderWidth);

  const clampedTranslateX = useDerivedValue(() => {
    return clamp(translateX.value, 0, sliderWidth);
  }, []);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      pickerBorderRadius.value = withTiming(pickerSize / 2);
      pickerBorderWidth.value = withTiming(4);
      scale.value = withTiming(1);
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      translateX.value = contextX.value + event.translationX;
    })
    .onFinalize(() => {
      scale.value = withTiming(defaultScale);
      pickerBorderRadius.value = withTiming(defaultPickerBorderRadius);
      pickerBorderWidth.value = withTiming(defaultPickerBorderWidth);
    });

  const rPickerStyle = useAnimatedStyle(() => {
    return {
      borderWidth: pickerBorderWidth.value,
      borderRadius: pickerBorderRadius.value,
      transform: [
        { translateX: clampedTranslateX.value - pickerSize / 2 },
        {
          scale: scale.value,
        },
      ],
    };
  }, []);

  const rProgressBarStyle = useAnimatedStyle(() => {
    return {
      width: clampedTranslateX.value,
    };
  }, []);

  const balloonSliderX = useDerivedValue(() => {
    return withSpring(clampedTranslateX.value);
  }, []);

  const balloonWidth = pickerSize + 15;
  const balloonHeight = balloonWidth * 1.4;
  const balloonBottom = pickerSize * 0.8;

  const balloonSliderRotate = useDerivedValue(() => {
    return (
      -Math.PI / 2 +
      Math.atan2(
        balloonHeight + balloonBottom, // balloon top height
        balloonSliderX.value - clampedTranslateX.value,
      )
    );
  }, []);

  const rBalloonProgressStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: balloonSliderX.value,
        },
        { rotate: `${-balloonSliderRotate.value}rad` },
      ],
    };
  }, []);

  const rBalloonText = useDerivedValue(() => {
    const interpolatedValue = interpolate(
      clampedTranslateX.value,
      [0, sliderWidth],
      [minValue, maxValue],
      Extrapolation.CLAMP,
    );
    return `${Math.floor(interpolatedValue)}`;
  }, []);

  return (
    <Animated.View
      style={{
        height: sliderHeight,
        width: sliderWidth,
        borderRadius: 5,
        backgroundColor: '#E5E5E5',
        borderCurve: 'continuous',
      }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            height: balloonHeight,
            bottom: balloonBottom,
            width: balloonWidth,
            left: -balloonWidth / 2,
          },
          rBalloonProgressStyle,
        ]}>
        <Canvas style={{ ...StyleSheet.absoluteFillObject }}>
          <FitBox
            src={rect(0, 0, 543, 711)}
            dst={rect(0, 0, balloonWidth, balloonHeight)}>
            <Path color={color} path={BalloonPath} />
          </FitBox>
        </Canvas>
        <ReText text={rBalloonText} style={styles.balloonText} />
      </Animated.View>
      <Animated.View
        style={[
          {
            backgroundColor: color,
          },
          styles.progressBar,
          rProgressBarStyle,
        ]}
      />
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              height: pickerSize,
              borderColor: color,
              top: -pickerSize / 2 + sliderHeight / 2,
            },
            styles.picker,
            rPickerStyle,
          ]}
        />
      </GestureDetector>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  balloonText: {
    ...StyleSheet.absoluteFillObject,
    bottom: 10,
    color: 'white',
    fontSize: 20,
    fontStyle: 'normal',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  picker: {
    aspectRatio: 1,
    backgroundColor: 'white',
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  progressBar: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
});

export { Slider };
