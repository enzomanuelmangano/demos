import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { Host, Slider } from '@expo/ui/swift-ui';
import { GlassView } from 'expo-glass-effect';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

import { BackgroundGradient } from '../dot-sheet/src/components/background-gradient';

const AnimatedSlider = Animated.createAnimatedComponent(Slider);

const bodyColor = '#202020';

export function Playground() {
  const progress = useSharedValue(0);

  const onUpdate = useCallback(
    (value: number) => {
      progress.set(value);
    },
    [progress],
  );

  const animatedProps = useAnimatedProps(() => {
    return {
      value: progress.value,
    };
  }, []);

  const animatedText = useDerivedValue(() => {
    return Math.ceil(progress.value * 100).toString();
  }, []);

  return (
    <View style={styles.container}>
      <BackgroundGradient style={styles.backgroundGradient} />
      <GlassView
        style={styles.glassView}
        glassEffectStyle="clear"
        isInteractive
        tintColor="rgba(255,255,255,0.1)">
        <ReText text={animatedText} style={styles.title} />
      </GlassView>
      <Host style={styles.host}>
        <AnimatedSlider
          animatedProps={animatedProps}
          color={bodyColor}
          onValueChange={onUpdate}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundGradient: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  glassView: {
    alignItems: 'center',
    borderRadius: 100,
    height: 100,
    justifyContent: 'center',
    width: 200,
  },
  host: {
    height: 100,
    marginTop: 32,
    width: '80%',
  },
  title: {
    color: bodyColor,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '100%',
  },
});
