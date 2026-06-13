import { StyleSheet, View } from 'react-native';

import { Skia } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import Animated, {
  useAnimatedProps,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedBlurView } from './components/animated-blur-view';
import { AnimatedSquare } from './components/animated-square';
import { BezierOutline } from './components/bezier-outline';
import { useAnimateThroughPath } from './hooks/useAnimateThroughPath';

const App = () => {
  const outlineMode = useSharedValue(false);
  const blurIntensity = useSharedValue(0);
  const outlineModeProgress = useDerivedValue(() => {
    return withSpring(outlineMode.get() ? 1 : 0);
  }, []);

  const rBezierOutlineStyle = useAnimatedStyle(() => {
    return {
      opacity: outlineModeProgress.get(),
      pointerEvents: outlineModeProgress.get() > 0 ? 'auto' : 'none',
    };
  });

  const rMainContentStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - outlineModeProgress.get(),
      pointerEvents: outlineModeProgress.get() > 0 ? 'none' : 'auto',
    };
  });

  const rLabelColorStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        outlineModeProgress.get(),
        [0, 1],
        ['#202020', 'white'],
      ),
    };
  });

  // Animated intensity must go through useAnimatedProps: a shared value passed
  // directly as the prop only forwards its value on the FIRST render
  // (reanimated's PropsFilter) — re-renders drop the prop and the React commit
  // clobbers UI-thread updates with the component default.
  const blurAnimatedProps = useAnimatedProps(
    () => ({
      intensity: withTiming(blurIntensity.get(), {
        duration: 300,
        easing: Easing.linear,
      }),
    }),
    [],
  );

  const skiaPath = useSharedValue(Skia.Path.Make());

  const { progress, startAnimation, cx, cy, reverseAnimation } =
    useAnimateThroughPath({
      pathReference: skiaPath,
    });

  const squareSize = useDerivedValue(() => {
    return interpolate(progress.get(), [0, 1], [64, 180]);
  }, [progress]);

  const onPress = () => {
    if (progress.get() === 0) {
      startAnimation();
    } else {
      reverseAnimation();
    }
  };

  const rSquareStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: cx.get() - squareSize.get() / 2 },
        { translateY: cy.get() - squareSize.get() / 2 },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        style={{
          ...StyleSheet.absoluteFill,
          zIndex: 100,
          pointerEvents: 'none',
        }}
        animatedProps={blurAnimatedProps}
        tint={'systemUltraThinMaterialLight'}
      />
      <Animated.View style={[StyleSheet.absoluteFill, rBezierOutlineStyle]}>
        <BezierOutline
          onPathUpdate={path => {
            'worklet';
            skiaPath.set(Skia.Path.MakeFromSVGString(path.toSVGString()!)!);
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
        testID="bezier-curve-outline-toggle"
        style={styles.button}
        onPressIn={() => {
          blurIntensity.set(65);
        }}
        onPressOut={() => {
          blurIntensity.set(0);
        }}
        onPress={() => {
          outlineMode.set(!outlineMode.get());
        }}>
        <Animated.Text style={[styles.text, rLabelColorStyle]}>
          Outline Mode
        </Animated.Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    bottom: 48,
    position: 'absolute',
    zIndex: 2000,
  },
  container: {
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
});

export { App };
