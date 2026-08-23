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

import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { Presets, Settings, usePatternComposer } from 'react-native-pulsar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-webgpu';

import { CONTAINER_BG, DEFAULT_QR_CONTENT } from './constants';
import { CREEPER_BLAST_PATTERN } from './haptics';
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

  // The fuse and the blast are one composed pattern, fired when the fuse
  // starts. It replaces a chain of setTimeouts that had to be tracked and
  // cancelled by hand, and whose ticks drifted against the sequence clock
  // because each one was scheduled from JS rather than by the haptic engine.
  const blastHaptic = usePatternComposer(CREEPER_BLAST_PATTERN);
  const onFuseStart = useCallback(() => {
    blastHaptic.play();
  }, [blastHaptic]);

  // Initialize WebGPU rendering
  const { detonate } = useWebGPU({
    canvasRef,
    canvasWidth,
    canvasHeight,
    qrContent,
    isFlat,
    onFuseStart,
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
    // A light tap as the mob materialises: the spawn is a beat of its own,
    // three seconds before the fuse pattern starts, and without it the long
    // press gives no feedback that anything took.
    Presets.System.impactLight();
    // The hint's job is done the moment the gesture is discovered.
    hintOpacity.set(withTiming(0, { duration: 260 }));
  }, [detonate, hintOpacity]);

  // Keep the keyboard up while the demo is on screen — but only then: an
  // unconditional refocus runs after the unmount blur too, leaking the
  // keyboard onto whatever screen comes next.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A pattern mid-play would otherwise keep buzzing on the next screen -
      // the same leak the timer chain had to guard against.
      Settings.stopHaptics();
      Keyboard.dismiss();
    };
  }, []);

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
