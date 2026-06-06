import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import React, { useCallback, useRef, useState } from 'react';

import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-webgpu';

import { CONTAINER_BG, DEFAULT_QR_CONTENT } from './constants';
import { useWebGPU } from './hooks';

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
      keyboardHeight.value = e.height;
    },
  });

  const canvasWrapperStyle = useAnimatedStyle(() => ({
    marginBottom: keyboardHeight.value,
  }));

  // Lift the input above the keyboard from the same shared value. This used
  // to be a KeyboardStickyView, but its translation no longer applies on the
  // new architecture (kirillzyusko/react-native-keyboard-controller#1411) —
  // the input stayed hidden behind the keyboard.
  const inputContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value }],
  }));

  // Initialize WebGPU rendering
  useWebGPU({
    canvasRef,
    canvasWidth,
    canvasHeight,
    qrContent,
    isFlat,
  });

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
    inputRef.current?.focus();
  }, []);

  const handleInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.canvasWrapper, canvasWrapperStyle]}>
        <Pressable
          accessibilityLabel="Cherry blossom tree QR code"
          onPress={handlePress}
          style={{ width: canvasWidth, height: canvasHeight }}>
          <Canvas ref={canvasRef} style={styles.canvas} />
        </Pressable>
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
