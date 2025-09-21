import { Skia } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AnimatedBlurView } from './components/animated-blur-view';
import { AnimatedSquare } from './components/animated-square';
import { BezierOutline } from './components/bezier-outline';
import { useAnimateThroughPath } from './hooks/useAnimateThroughPath';

const App = () => {
  const outlineMode = useSharedValue(false);
  const blurIntensity = useSharedValue(0);
  const outlineModeProgress = useDerivedValue(() => {
    return withSpring(outlineMode.value ? 1 : 0);
  }, []);

  const rBezierOutlineStyle = useAnimatedStyle(() => {
    return {
      opacity: outlineModeProgress.value,
      pointerEvents: outlineModeProgress.value > 0 ? 'auto' : 'none',
    };
  });

  const rMainContentStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - outlineModeProgress.value,
      pointerEvents: outlineModeProgress.value > 0 ? 'none' : 'auto',
    };
  });

  const rLabelColorStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        outlineModeProgress.value,
        [0, 1],
        ['#202020', 'white'],
      ),
    };
  });

  const animatedBlurIntensity = useDerivedValue<number | undefined>(() => {
    return withSpring(blurIntensity.value);
  }, []);

  const skiaPath = useSharedValue(Skia.Path.Make());

  const { progress, startAnimation, cx, cy, reverseAnimation } =
    useAnimateThroughPath({
      pathReference: skiaPath,
    });

  const squareSize = useDerivedValue(() => {
    return interpolate(progress.value, [0, 1], [64, 180]);
  }, [progress]);

  const onPress = () => {
    if (progress.value === 0) {
      startAnimation();
    } else {
      reverseAnimation();
    }
  };

  const rSquareStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: cx.value - squareSize.value / 2 },
        { translateY: cy.value - squareSize.value / 2 },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        style={{
          ...StyleSheet.absoluteFillObject,
          zIndex: 100,
          pointerEvents: 'none',
        }}
        intensity={animatedBlurIntensity}
        tint={'systemUltraThinMaterialLight'}
      />
      <Animated.View style={[StyleSheet.absoluteFill, rBezierOutlineStyle]}>
        <BezierOutline
          onPathUpdate={path => {
            'worklet';
            skiaPath.value = Skia.Path.MakeFromSVGString(path.toSVGString()!)!;
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#efefef',
          },
          rMainContentStyle,
        ]}>
        <Animated.View style={rSquareStyle}>
          <AnimatedSquare
            progress={progress}
            onPress={onPress}
            width={squareSize}
            height={squareSize}
          />
        </Animated.View>
      </Animated.View>
      <PressableScale
        style={styles.button}
        onPressIn={() => {
          blurIntensity.value = 65;
        }}
        onPressOut={() => {
          blurIntensity.value = 0;
        }}
        onPress={() => {
          outlineMode.value = !outlineMode.value;
        }}>
        <Animated.Text style={[styles.text, rLabelColorStyle]}>
          Outline Mode
        </Animated.Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  button: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    zIndex: 2000,
  },
  text: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
});

export { App };
