import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useRef, useState } from 'react';

import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, CanvasRef } from 'react-native-webgpu';

import { SURFACE_HEX } from './constants';
import { useWebGPURenderer, RendererState } from './hooks/use-webgpu-renderer';

export const GitHubTerrain = () => {
  const { width, height } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const canvasRef = useRef<CanvasRef>(null);
  const layoutRef = useRef({ width, height });

  // Renderer state - using ref to avoid re-renders on animation updates
  const stateRef = useRef<RendererState>({
    isFlat: true,
    useRealData: true,
  });

  // Track switch UI state separately for controlled component
  const [switchValue, setSwitchValue] = useState(true);

  // e2e outcome probe: terrain flat/raised and data source live in a ref to
  // avoid re-renders, so they are invisible to the view tree. Mirror them into
  // state purely for assertion. Visually negligible (alpha ~0.01).
  const [isFlat, setIsFlat] = useState(true);

  // Initialize WebGPU renderer
  useWebGPURenderer(canvasRef, stateRef, layoutRef);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !stateRef.current.isFlat;
    stateRef.current.isFlat = next;
    setIsFlat(next);
  }, []);

  const handleDataToggle = useCallback((value: boolean) => {
    setSwitchValue(value);
    stateRef.current.useRealData = value;
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) {
      layoutRef.current = { width: w, height: h };
    }
  }, []);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Text testID="github-terrain-status" style={styles.statusProbe}>
        {`${isFlat ? 'flat' : 'raised'}-${switchValue ? 'real' : 'demo'}`}
      </Text>
      <Pressable
        testID="github-terrain-canvas"
        style={StyleSheet.absoluteFill}
        onPress={handlePress}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      </Pressable>

      <View
        pointerEvents="box-none"
        style={[styles.switchContainer, { bottom: safeBottom + 14 }]}>
        <Switch
          testID="github-terrain-switch"
          accessibilityLabel="Toggle real GitHub contribution data"
          trackColor={{ false: '#C8CCC9', true: '#34D399' }}
          ios_backgroundColor="#C8CCC9"
          onValueChange={handleDataToggle}
          value={switchValue}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: SURFACE_HEX,
    flex: 1,
  },
  switchContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: SURFACE_HEX,
    opacity: 0.012,
    zIndex: 20,
  },
});
