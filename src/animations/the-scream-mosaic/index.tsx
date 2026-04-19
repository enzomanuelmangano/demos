import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { memo, useEffect, useMemo, useRef } from 'react';

import { Canvas, Fill } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MosaicRenderer } from './components/mosaic-renderer';
import { SPRING_CONFIG, ZOOM_LEVELS } from './constants';
import { useMosaicMapping } from './hooks/use-mosaic-mapping';
import { usePaintingAnalysis } from './hooks/use-painting-analysis';
import { usePhotoAtlas } from './hooks/use-photo-atlas';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Import the painting asset - just change this to test different paintings!
const painting = require('./assets/hopper.jpg');

// Detailed loading phases
type DetailedPhase =
  | 'idle'
  | 'analyzing-painting'
  | 'loading-manifest'
  | 'matching-colors'
  | 'loading-atlas'
  | 'complete';

// Loading indicator component with detailed phases
const LoadingOverlay = memo(({ phase }: { phase: DetailedPhase }) => {
  const messages: Record<DetailedPhase, string> = {
    idle: '',
    'analyzing-painting': '1/4 Analyzing painting...',
    'loading-manifest': '2/4 Loading photo colors...',
    'matching-colors': '3/4 Matching colors (k-d tree)...',
    'loading-atlas': '4/4 Decoding atlas image...',
    complete: '',
  };

  if (phase === 'idle' || phase === 'complete') {
    return null;
  }

  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.loadingText}>{messages[phase]}</Text>
    </View>
  );
});

export function TheScreamMosaic() {
  const startTime = useRef(Date.now());

  // Analysis hooks - gridDimensions is calculated from the painting image
  const {
    gridCells,
    gridDimensions,
    isAnalyzing: isAnalyzingPainting,
  } = usePaintingAnalysis(painting);

  const { cols, rows, aspectRatio } = gridDimensions;

  // Canvas dimensions - calculated from painting aspect ratio
  const canvasWidth = SCREEN_WIDTH * 0.95;
  const canvasHeight =
    aspectRatio > 0 ? canvasWidth / aspectRatio : canvasWidth;

  // Cell dimensions
  const cellWidth = cols > 0 ? canvasWidth / cols : 0;
  const cellHeight = rows > 0 ? canvasHeight / rows : 0;

  // Load atlas and photo info
  const { atlas, photoInfoMap } = usePhotoAtlas();

  const { mapping, isMatching } = useMosaicMapping(gridCells, photoInfoMap);

  // Determine detailed loading phase
  const loadingPhase: DetailedPhase = useMemo(() => {
    if (isAnalyzingPainting) {
      return 'analyzing-painting';
    }
    if (photoInfoMap.size === 0) {
      return 'loading-manifest';
    }
    if (isMatching) {
      return 'matching-colors';
    }
    if (mapping.size > 0 && !atlas) {
      return 'loading-atlas';
    }
    if (mapping.size > 0 && atlas) {
      return 'complete';
    }
    return 'idle';
  }, [isAnalyzingPainting, photoInfoMap.size, isMatching, mapping.size, atlas]);

  // Log timing
  useEffect(() => {
    const elapsed = Date.now() - startTime.current;
    console.log(`[${elapsed}ms] Phase: ${loadingPhase}`);
  }, [loadingPhase]);

  // Generate cells with their photo mappings
  const cells = useMemo(() => {
    return gridCells.map(cell => ({
      index: cell.index,
      x: cell.col * cellWidth,
      y: cell.row * cellHeight,
      photoId: mapping.get(cell.index) ?? null,
      placeholderColor: cell.targetColor,
    }));
  }, [gridCells, mapping, cellWidth, cellHeight]);

  // Zoom state: 0 = overview, 1 = grid zoom, 2 = cell zoom (scrollable)
  const zoomLevel = useSharedValue(0);

  // Translation for panning when zoomed in
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panContext = useSharedValue({ x: 0, y: 0 });

  // Derived scale value with spring animation
  const scale = useDerivedValue((): number => {
    const targetScale =
      zoomLevel.get() === 0
        ? ZOOM_LEVELS.overview
        : zoomLevel.get() === 1
          ? ZOOM_LEVELS.grid
          : ZOOM_LEVELS.cell;

    return withSpring(targetScale, SPRING_CONFIG);
  });

  // Image opacity based on zoom level - fades in images when zooming
  const imageOpacity = useDerivedValue(() => {
    const currentScale = scale.get();
    const startFade = ZOOM_LEVELS.grid;
    const endFade = ZOOM_LEVELS.cell;

    if (currentScale <= startFade) {
      return 0;
    }
    if (currentScale >= endFade) {
      return 1;
    }
    return (currentScale - startFade) / (endFade - startFade);
  });

  // Calculate bounds for panning
  const getMaxTranslation = (currentScale: number) => {
    'worklet';
    const scaledWidth = canvasWidth * currentScale;
    const scaledHeight = canvasHeight * currentScale;
    const maxX = Math.max(0, (scaledWidth - SCREEN_WIDTH) / 2);
    const maxY = Math.max(0, (scaledHeight - SCREEN_HEIGHT) / 2);
    return { maxX, maxY };
  };

  // Tap gesture to cycle zoom levels
  const tapGesture = Gesture.Tap().onEnd(() => {
    const currentZoom = zoomLevel.get();
    if (currentZoom === 2) {
      zoomLevel.set(0);
      translateX.set(withSpring(0, SPRING_CONFIG));
      translateY.set(withSpring(0, SPRING_CONFIG));
    } else {
      zoomLevel.set(currentZoom + 1);
      if (currentZoom + 1 === 2) {
        translateX.set(withSpring(0, SPRING_CONFIG));
        translateY.set(withSpring(0, SPRING_CONFIG));
      }
    }
  });

  // Pan gesture for scrolling when at cell zoom level
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      panContext.set({ x: translateX.get(), y: translateY.get() });
    })
    .onUpdate(event => {
      if (zoomLevel.get() === 2) {
        const { maxX, maxY } = getMaxTranslation(ZOOM_LEVELS.cell);
        translateX.set(
          clamp(panContext.get().x + event.translationX, -maxX, maxX),
        );
        translateY.set(
          clamp(panContext.get().y + event.translationY, -maxY, maxY),
        );
      }
    })
    .onFinalize(event => {
      if (zoomLevel.get() === 2) {
        const { maxX, maxY } = getMaxTranslation(ZOOM_LEVELS.cell);
        const targetX = clamp(
          translateX.get() + event.velocityX * 0.1,
          -maxX,
          maxX,
        );
        const targetY = clamp(
          translateY.get() + event.velocityY * 0.1,
          -maxY,
          maxY,
        );
        translateX.set(
          withSpring(targetX, { ...SPRING_CONFIG, velocity: event.velocityX }),
        );
        translateY.set(
          withSpring(targetY, { ...SPRING_CONFIG, velocity: event.velocityY }),
        );
      }
    });

  const composedGesture = Gesture.Race(tapGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { scale: scale.get() },
    ],
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={animatedStyle}>
          <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
            {photoInfoMap.size > 0 ? (
              <MosaicRenderer
                atlas={atlas}
                cells={cells}
                photoInfoMap={photoInfoMap}
                cellWidth={cellWidth}
                cellHeight={cellHeight}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                imageOpacity={imageOpacity}
              />
            ) : (
              <Fill color="blue" />
            )}
          </Canvas>
        </Animated.View>
      </GestureDetector>

      <LoadingOverlay phase={loadingPhase} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    flex: 1,
    justifyContent: 'center',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderCurve: 'continuous',
    borderRadius: 16,
    bottom: 40,
    left: 20,
    padding: 20,
    position: 'absolute',
    right: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
});
