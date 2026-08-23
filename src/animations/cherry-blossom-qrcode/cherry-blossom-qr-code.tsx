import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import * as Haptics from 'expo-haptics';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-webgpu';

import {
  CONTAINER_BG,
  CREEPER_FUSE_DURATION,
  CREEPER_WALK_DURATION,
  DEFAULT_QR_CONTENT,
} from './constants';
import { useWebGPU } from './hooks';

// The long press is the only way to find the creeper, and nothing on screen
// suggests it exists. The hint waits a beat so it does not compete with the
// scene appearing, then retires itself once the gesture has been used.
const HINT_DELAY_MS = 2000;
const HINT_TEXT = 'Long press to spawn a creeper';

export const CherryBlossomQRCode = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const canvasWidth = windowWidth;
  const canvasHeight = windowHeight * 0.6;

  const [qrContent, setQrContent] = useState(DEFAULT_QR_CONTENT);
  const inputRef = useRef<TextInput>(null);
  const canvasRef = useRef<CanvasRef>(null);
  const isFlat = useRef(false);

  // Keyboard handling
  const keyboardHeight = useSharedValue(0);

  useKeyboardHandler({
    onMove: e => {
      'worklet';
      keyboardHeight.set(e.height);
    },
  });

  const canvasWrapperStyle = useAnimatedStyle(() => ({
    marginBottom: keyboardHeight.get(),
  }));

  // Lift the input above the keyboard from the same shared value. This used
  // to be a KeyboardStickyView, but its translation no longer applies on the
  // new architecture (kirillzyusko/react-native-keyboard-controller#1411) —
  // the input stayed hidden behind the keyboard.
  const inputContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.get() }],
  }));

  // Haptic fuse: ticks that accelerate as the creeper primes, then a heavy
  // thump on the blast. Timers are owned here so an unmount mid-fuse cannot
  // leave the phone buzzing on another screen.
  const fuseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearFuse = useCallback(() => {
    fuseTimers.current.forEach(clearTimeout);
    fuseTimers.current = [];
  }, []);

  const hintOpacity = useSharedValue(0);
  useEffect(() => {
    hintOpacity.set(
      withDelay(
        HINT_DELAY_MS,
        withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [hintOpacity]);
  const hintStyle = useAnimatedStyle(() => ({
    // Settles below full strength so it sits under the scene rather than
    // competing with it - a chosen level, not washed-out ink.
    opacity: hintOpacity.get() * 0.72,
  }));

  const onDetonate = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  // Initialize WebGPU rendering
  const { detonate } = useWebGPU({
    canvasRef,
    canvasWidth,
    canvasHeight,
    qrContent,
    isFlat,
    onDetonate,
    onSequenceEnd: clearFuse,
  });

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
    inputRef.current?.focus();
  }, []);

  // Long-press spawns the creeper. It walks in for CREEPER_WALK_DURATION,
  // hisses through the fuse, and takes the tree with it — then the tree
  // reassembles so the QR is scannable again.
  const handleLongPress = useCallback(() => {
    if (!detonate()) return;
    // Its job is done the moment the gesture is discovered.
    hintOpacity.set(withTiming(0, { duration: 260 }));
    clearFuse();
    const ticks = 9;
    for (let i = 0; i < ticks; i++) {
      // Ticks bunch up towards the blast: t = fuseStart + fuse * (i/n)^1.7.
      const at =
        CREEPER_WALK_DURATION +
        CREEPER_FUSE_DURATION * Math.pow(i / ticks, 1.7);
      fuseTimers.current.push(
        setTimeout(() => {
          Haptics.impactAsync(
            i > ticks - 3
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );
        }, at * 1000),
      );
    }
  }, [detonate, clearFuse, hintOpacity]);

  // Keep the keyboard up while the demo is on screen — but only then: an
  // unconditional refocus runs after the unmount blur too, leaking the
  // keyboard onto whatever screen comes next.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearFuse();
      Keyboard.dismiss();
    };
  }, [clearFuse]);

  const handleInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      inputRef.current?.focus();
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.canvasWrapper, canvasWrapperStyle]}>
        <Pressable
          accessibilityLabel="Cherry blossom tree QR code"
          accessibilityHint="Tap to flatten for scanning. Long press to spawn a creeper."
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={320}
          style={{ width: canvasWidth, height: canvasHeight }}>
          <Canvas ref={canvasRef} style={styles.canvas} />
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.hint, hintStyle]}>
          <Text style={styles.hintText}>{HINT_TEXT}</Text>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.inputContainer, inputContainerStyle]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={qrContent}
          onChangeText={setQrContent}
          onBlur={handleInputBlur}
          placeholder="https://enzo.fyi"
          placeholderTextColor="#999"
          selectionColor="#4a7c4e"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          inputMode="url"
          keyboardAppearance="light"
          showSoftInputOnFocus={true}
          autoFocus
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  canvasWrapper: {
    flex: 1,
    paddingTop: '10%',
  },
  container: {
    backgroundColor: CONTAINER_BG,
    flex: 1,
  },
  hint: {
    alignItems: 'center',
    bottom: 8,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  hintText: {
    // The app's house face - SF-Pro-Rounded-Bold is what the rest of the
    // demos are set in, and this was falling back to the system default.
    color: '#1a1a1a',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: '#fff',
    borderCurve: 'continuous',
    borderRadius: 14,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.03)',
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.2,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  inputContainer: {
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
});
