import { Canvas } from '@shopify/react-native-skia';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AnimatedFaceRefType } from './components/AnimatedFace';
import { AnimatedFace } from './components/AnimatedFace';
import { ButtonsGrid } from './components/ButtonsGrid';
import { CircleStroke } from './components/CircleStroke';
import { PinArea } from './components/PinArea';
import { useAnimatedShake } from './hooks/use-animated-shake';

type LockScreenProps = {
  correctPin: string;
  onClear?: () => void;
  onCompleted?: () => void;
  onError?: (wrongPin: string) => void;
};

const LockScreen: React.FC<LockScreenProps> = ({
  correctPin,
  onClear,
  onCompleted,
  onError,
}) => {
  const animatedFaceRef = useRef<AnimatedFaceRefType>(null);
  const { shake, rShakeStyle: rPinContainerStyle } = useAnimatedShake();

  const pin = useSharedValue<number[]>([]);
  const activeDots = useDerivedValue(() => {
    return pin.value.length;
  }, []);

  const correct = useCallback(() => {
    animatedFaceRef.current?.happy();
    onCompleted?.();
  }, [onCompleted]);

  const wrong = useCallback(() => {
    shake();
    onError?.(pin.value.join(''));
    animatedFaceRef.current?.sad();
  }, [onError, pin.value, shake]);

  const activate = useCallback(() => {
    animatedFaceRef.current?.openEyes();
  }, []);

  const reset = useCallback(() => {
    pin.value = [];
    animatedFaceRef.current?.reset();
    onClear?.();
  }, [onClear, pin]);

  useAnimatedReaction(
    () => {
      return pin.value;
    },
    currentPin => {
      const active = currentPin.length > 0;

      if (currentPin.length > correctPin.length) {
        return;
      }

      if (currentPin.join('') === correctPin) {
        runOnJS(correct)();
        return;
      }

      if (currentPin.length === correctPin.length) {
        runOnJS(wrong)();
        return;
      }
      if (active) {
        runOnJS(activate)();
        return;
      }
    },
    [activate, reset, wrong, correct],
  );

  return (
    <View style={styles.container}>
      <Canvas style={{ width: '200%', position: 'absolute', aspectRatio: 1 }}>
        <CircleStroke />
        <AnimatedFace ref={animatedFaceRef} />
      </Canvas>
      <SafeAreaView style={styles.fill}>
        <View style={styles.fill} />
        <View style={{ height: '60%' }}>
          <Animated.View style={rPinContainerStyle}>
            <PinArea
              activeDots={activeDots}
              dotsAmount={correctPin.length}
              style={{
                marginTop: 20,
                marginBottom: 15,
              }}
            />
          </Animated.View>
          <ButtonsGrid pin={pin} onReset={reset} />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C274D',
  },
  fill: {
    flex: 1,
  },
});

export { LockScreen };
