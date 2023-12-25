import React, { createContext, useContext, useMemo } from 'react';
import type { CanvasProps, SkiaValue } from '@shopify/react-native-skia';
import { Canvas as SkiaCanvas, useValue } from '@shopify/react-native-skia';
import type Animated from 'react-native-reanimated';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

type CanvasContextType = {
  size: Animated.SharedValue<{ width: number; height: number }>;
};

const CanvasContext = createContext<CanvasContextType>({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  size: { value: { width: 0, height: 0 } } as any,
});

const Canvas = (props: CanvasProps) => {
  const canvasSize = useSharedValue({ width: 0, height: 0 });

  const value = useMemo(() => {
    return {
      size: canvasSize,
    };
  }, [canvasSize]);

  return (
    <CanvasContext.Provider value={value}>
      <SkiaCanvas {...props} onSize={canvasSize} />
    </CanvasContext.Provider>
  );
};

const useCanvas = () => {
  return useContext(CanvasContext);
};

export { Canvas, useCanvas };
