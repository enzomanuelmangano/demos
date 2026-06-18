import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import React, { useCallback, useMemo, useRef, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, CanvasRef } from 'react-native-webgpu';

import { BG_HEX } from './constants';
import { STEP_COUNT } from './fold/engine';
import { RendererState, useWebGPURenderer } from './hooks/use-webgpu-renderer';

const STEP_LABELS = [
  'Flat sheet',
  'Spread the wings',
  'Raise the neck',
  'Lift the tail',
  'Fold the head',
];

export const OrigamiPlane = () => {
  const { width, height } = useWindowDimensions();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();

  const canvasRef = useRef<CanvasRef>(null);
  const layoutRef = useRef({ width, height });
  const stateRef = useRef<RendererState>({ targetStep: 0 });

  const [step, setStep] = useState(0);

  useWebGPURenderer(canvasRef, stateRef, layoutRef);

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(STEP_COUNT, next));
    stateRef.current.targetStep = clamped;
    setStep(clamped);
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) {
      layoutRef.current = { width: w, height: h };
    }
  }, []);

  const dots = useMemo(
    () => Array.from({ length: STEP_COUNT + 1 }, (_, i) => i),
    [],
  );

  const atStart = step === 0;
  const atEnd = step === STEP_COUNT;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.canvasWrap}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </View>

      <View style={[styles.header, { top: safeTop + 8 }]} pointerEvents="none">
        <Text style={styles.title}>Origami Crane</Text>
        <Text style={styles.subtitle}>{STEP_LABELS[step]}</Text>
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.controls, { bottom: safeBottom + 24 }]}>
        <View style={styles.dots}>
          {dots.map(i => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.buttonRow}>
          <PressableScale
            disabled={atStart}
            style={[styles.button, atStart && styles.buttonDisabled]}
            onPress={() => goTo(step - 1)}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.buttonText}>Prev</Text>
          </PressableScale>

          <PressableScale
            disabled={atEnd}
            style={[styles.button, atEnd && styles.buttonDisabled]}
            onPress={() => goTo(step + 1)}>
            <Text style={styles.buttonText}>Next</Text>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </PressableScale>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderCurve: 'continuous',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  canvas: {
    flex: 1,
  },
  canvasWrap: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    backgroundColor: BG_HEX,
    flex: 1,
  },
  controls: {
    alignItems: 'center',
    gap: 18,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dot: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 22,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  header: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    marginTop: 4,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
