import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { memo, useMemo } from 'react';

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

import type { LoadingPhase } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Import the painting asset - just change this to test different paintings!
const painting = require('./assets/hopper4.jpg');

// Loading indicator component
const LoadingOverlay = memo(
  ({
    phase,
    paintingProgress,
    photoProgress,
    matchingProgress,
  }: {
    phase: LoadingPhase;
    paintingProgress: number;
    photoProgress: number;
    matchingProgress: number;
  }) => {
    let message = '';
    let progress = 0;

    switch (phase) {
      case 'analyzing-painting':
        message = 'Analyzing painting...';
        progress = paintingProgress;
        break;
      case 'loading-photos':
        message = 'Loading atlas...';
        progress = photoProgress;
        break;
      case 'matching':
        message = 'Matching colors...';
        progress = matchingProgress;
        break;
      default:
        return null;
    }

    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>{message}</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>
    );
  },
);

export function TheScreamMosaic() {
  // Analysis hooks - gridDimensions is calculated from the painting image
  const {
    gridCells,
    gridDimensions,
    isAnalyzing: isAnalyzingPainting,
    progress: paintingProgress,
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
  const {
    atlas,
    photoInfoMap,
    isLoading: isLoadingAtlas,
    progress: photoProgress,
  } = usePhotoAtlas();

  const {
    mapping,
    isMatching,
    progress: matchingProgress,
  } = useMosaicMapping(gridCells, photoInfoMap);

  // Determine current loading phase
  const loadingPhase: LoadingPhase = useMemo(() => {
    if (isAnalyzingPainting) {
      return 'analyzing-painting';
    }
    if (isLoadingAtlas) {
      return 'loading-photos';
    }
    if (isMatching) {
      return 'matching';
    }
    if (mapping.size > 0 && atlas) {
      return 'complete';
    }
    return 'idle';
  }, [isAnalyzingPainting, isLoadingAtlas, isMatching, mapping.size, atlas]);

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
      // Reset to overview
      zoomLevel.set(0);
      translateX.set(withSpring(0, SPRING_CONFIG));
      translateY.set(withSpring(0, SPRING_CONFIG));
    } else {
      // Move to next zoom level
      zoomLevel.set(currentZoom + 1);

      // When zooming to cell level, center on middle of canvas
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
        // Add velocity for natural feeling
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

      {loadingPhase !== 'complete' && loadingPhase !== 'idle' && (
        <LoadingOverlay
          phase={loadingPhase}
          paintingProgress={paintingProgress}
          photoProgress={photoProgress}
          matchingProgress={matchingProgress}
        />
      )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
  progressBar: {
    backgroundColor: '#4CAF50',
    height: '100%',
  },
  progressBarContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    height: 8,
    marginTop: 12,
    overflow: 'hidden',
    width: '100%',
  },
  progressText: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
  },
});
