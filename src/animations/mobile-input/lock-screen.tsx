import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useCallback, useRef } from 'react';

import Animated, {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas } from 'react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedFace } from './components/AnimatedFace';
import { ButtonsGrid } from './components/ButtonsGrid';
import { CircleStroke } from './components/CircleStroke';
import { PinArea } from './components/PinArea';
import { useAnimatedShake } from './hooks/use-animated-shake';

import type { AnimatedFaceRefType } from './components/AnimatedFace';
import type { FC } from 'react';

type LockScreenProps = {
  correctPin: string;
  onClear?: () => void;
  onCompleted?: () => void;
  onError?: (wrongPin: string) => void;
};

const LockScreen: FC<LockScreenProps> = ({
  correctPin,
  onClear,
  onCompleted,
  onError,
}) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const animatedFaceRef = useRef<AnimatedFaceRefType>(null);
  const { shake, rShakeStyle: rPinContainerStyle } = useAnimatedShake();

  const pin = useSharedValue<number[]>([]);
  const activeDots = useDerivedValue(() => {
    return pin.get().length;
  }, []);

  const correct = useCallback(() => {
    animatedFaceRef.current?.happy();
    onCompleted?.();
  }, [onCompleted]);

  const wrong = useCallback(() => {
    shake();
    onError?.(pin.get().join(''));
    animatedFaceRef.current?.sad();
  }, [onError, pin.get(), shake]);

  const activate = useCallback(() => {
    animatedFaceRef.current?.openEyes();
  }, []);

  const reset = useCallback(() => {
    pin.set([]);
    animatedFaceRef.current?.reset();
    onClear?.();
  }, [onClear, pin]);

  useAnimatedReaction(
    () => {
      return pin.get();
    },
    currentPin => {
      const active = currentPin.length > 0;

      if (currentPin.length > correctPin.length) {
        return;
      }

      if (currentPin.join('') === correctPin) {
        scheduleOnRN(correct);
        return;
      }

      if (currentPin.length === correctPin.length) {
        scheduleOnRN(wrong);
        return;
      }
      if (active) {
        scheduleOnRN(activate);
        return;
      }
    },
    [activate, reset, wrong, correct],
  );

  return (
    <View style={styles.container}>
      {/* Same height as the old 200%-wide square canvas, but only as wide as
          the screen: its right half was off-screen, and the surface under the
          animated BlurMask is halved. Skia coordinates are unchanged. */}
      <Canvas
        style={{
          width: '100%',
          position: 'absolute',
          height: windowWidth * 2,
        }}>
        <CircleStroke />
        <AnimatedFace ref={animatedFaceRef} />
      </Canvas>
      <View
        style={[
          styles.fill,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}>
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1C274D',
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});

export { LockScreen };
