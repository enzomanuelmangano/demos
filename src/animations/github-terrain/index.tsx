import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useRef, useState } from 'react';

import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, CanvasRef } from 'react-native-wgpu';

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

  // Initialize WebGPU renderer
  useWebGPURenderer(canvasRef, stateRef, layoutRef);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stateRef.current.isFlat = !stateRef.current.isFlat;
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
      <Pressable style={StyleSheet.absoluteFill} onPress={handlePress}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      </Pressable>

      <View
        pointerEvents="box-none"
        style={[styles.switchContainer, { bottom: safeBottom + 14 }]}>
        <Switch
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
});
