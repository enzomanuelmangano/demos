import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { memo, useEffect, useMemo, useRef } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';
import { Canvas, CanvasRef } from 'react-native-wgpu';

import { useMosaicMapping } from './hooks/use-mosaic-mapping';
import { usePaintingAnalysis } from './hooks/use-painting-analysis';
import { usePhotoAtlas } from './hooks/use-photo-atlas';
import { useWebGPUMosaic } from './hooks/use-webgpu-mosaic';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MIN_SCALE = 1;
const SPRING_CONFIG = { dampingRatio: 1, duration: 350 };
const SNAP_SPRING = { dampingRatio: 0.9, duration: 300 };

// Grid mode: when a cell fills this fraction of screen width
const GRID_MODE_THRESHOLD = 0.5;
// Ideal grid scale: cell fills 70% of screen width
const GRID_MODE_TARGET = 0.7;

// Import the painting asset
const painting = require('./assets/starry.jpg');

// Detailed loading phases
type DetailedPhase =
  | 'idle'
  | 'analyzing-painting'
  | 'loading-manifest'
  | 'matching-colors'
  | 'loading-atlas'
  | 'complete';

// Loading indicator component
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
  const canvasRef = useRef<CanvasRef>(null);

  // Analysis hooks
  const {
    gridCells,
    gridDimensions,
    isAnalyzing: isAnalyzingPainting,
  } = usePaintingAnalysis(painting);

  const { cols, rows, aspectRatio } = gridDimensions;

  // Canvas dimensions
  const canvasWidth = SCREEN_WIDTH * 0.95;
  const canvasHeight =
    aspectRatio > 0 ? canvasWidth / aspectRatio : canvasWidth;

  // Cell dimensions
  const cellWidth = cols > 0 ? canvasWidth / cols : 0;
  const cellHeight = rows > 0 ? canvasHeight / rows : 0;

  // Load atlas and photo info
  const { photoInfoMap } = usePhotoAtlas();
  const { mapping, isMatching } = useMosaicMapping(gridCells, photoInfoMap);

  // Generate cells
  const cells = useMemo(() => {
    return gridCells.map(cell => ({
      index: cell.index,
      x: cell.col * cellWidth,
      y: cell.row * cellHeight,
      photoId: mapping.get(cell.index) ?? null,
      placeholderColor: cell.targetColor,
    }));
  }, [gridCells, mapping, cellWidth, cellHeight]);

  // Loading phase
  const loadingPhase: DetailedPhase = useMemo(() => {
    if (isAnalyzingPainting) return 'analyzing-painting';
    if (photoInfoMap.size === 0) return 'loading-manifest';
    if (isMatching) return 'matching-colors';
    if (mapping.size > 0 && cells.length === 0) return 'loading-atlas';
    if (mapping.size > 0 && cells.length > 0) return 'complete';
    return 'idle';
  }, [
    isAnalyzingPainting,
    photoInfoMap.size,
    isMatching,
    mapping.size,
    cells.length,
  ]);

  useEffect(() => {
    const elapsed = Date.now() - startTime.current;
    console.log(`[${elapsed}ms] Phase: ${loadingPhase}`);
  }, [loadingPhase]);

  // Zoom and pan state (all on UI thread via SharedValues)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Grid mode state (UI thread only - no React state sync)
  const currentRow = useSharedValue(-1);
  const currentCol = useSharedValue(-1);

  // Initialize WebGPU renderer
  useWebGPUMosaic(canvasRef, {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    paintingWidth: canvasWidth,
    paintingHeight: canvasHeight,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    scale,
    translateX,
    translateY,
  });

  // Derived: whether we're in grid mode
  const isInGridMode = useDerivedValue(() => {
    if (cellWidth === 0) return false;
    const cellScreenWidth = cellWidth * scale.value;
    return cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;
  });

  // Ideal scale for grid mode: cell fills 70% of screen width
  const idealGridScale =
    cellWidth > 0 ? (GRID_MODE_TARGET * SCREEN_WIDTH) / cellWidth : 1;

  // Snap to a specific cell at ideal scale (runs on UI thread)
  const snapToCell = (row: number, col: number) => {
    'worklet';
    scale.value = withSpring(idealGridScale, SNAP_SPRING);

    const cellCenterX = (col + 0.5) * cellWidth;
    const cellCenterY = (row + 0.5) * cellHeight;
    const targetTx = -(cellCenterX - canvasWidth / 2) * idealGridScale;
    const targetTy = -(cellCenterY - canvasHeight / 2) * idealGridScale;

    translateX.value = withSpring(targetTx, SNAP_SPRING);
    translateY.value = withSpring(targetTy, SNAP_SPRING);

    currentRow.value = row;
    currentCol.value = col;
  };

  // Reset zoom
  const resetZoom = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    currentRow.value = -1;
    currentCol.value = -1;
  };

  // Back button visibility
  const backButtonOpacity = useDerivedValue(() => {
    return interpolate(scale.value, [1, 1.5], [0, 1], 'clamp');
  });

  // Track if we're actively pinching
  const isPinching = useSharedValue(false);

  // Pinch gesture with focal point zooming
  const focalScreenX = useSharedValue(0);
  const focalScreenY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(event => {
      isPinching.value = true;
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      focalScreenX.value = event.focalX - SCREEN_WIDTH / 2;
      focalScreenY.value = event.focalY - SCREEN_HEIGHT / 2;
    })
    .onUpdate(event => {
      const maxScale = idealGridScale * 1.2;
      const newScale = clamp(
        savedScale.value * event.scale,
        MIN_SCALE,
        maxScale,
      );

      const scaleRatio = newScale / savedScale.value;
      const newTranslateX =
        focalScreenX.value * (1 - scaleRatio) +
        savedTranslateX.value * scaleRatio;
      const newTranslateY =
        focalScreenY.value * (1 - scaleRatio) +
        savedTranslateY.value * scaleRatio;

      scale.value = newScale;
      translateX.value = newTranslateX;
      translateY.value = newTranslateY;
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value < 1.2) {
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        currentRow.value = -1;
        currentCol.value = -1;
      } else {
        const cellScreenWidth = cellWidth * scale.value;
        const inGridMode =
          cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;

        if (inGridMode && cols > 0 && rows > 0) {
          const canvasCenterX =
            canvasWidth / 2 - translateX.value / scale.value;
          const canvasCenterY =
            canvasHeight / 2 - translateY.value / scale.value;
          const col = Math.round(canvasCenterX / cellWidth - 0.5);
          const row = Math.round(canvasCenterY / cellHeight - 0.5);
          const clampedCol = Math.max(0, Math.min(cols - 1, col));
          const clampedRow = Math.max(0, Math.min(rows - 1, row));

          snapToCell(clampedRow, clampedCol);
        }
      }
    })
    .onFinalize(() => {
      isPinching.value = false;
    });

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (isPinching.value) return;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(event => {
      if (isPinching.value) return;
      if (scale.value <= 1) return;

      const maxX = Math.max(0, (canvasWidth * scale.value - SCREEN_WIDTH) / 2);
      const maxY = Math.max(
        0,
        (canvasHeight * scale.value - SCREEN_HEIGHT) / 2,
      );

      translateX.value = clamp(
        savedTranslateX.value + event.translationX,
        -maxX,
        maxX,
      );
      translateY.value = clamp(
        savedTranslateY.value + event.translationY,
        -maxY,
        maxY,
      );
    })
    .onEnd(event => {
      if (isPinching.value) return;
      if (scale.value <= 1) return;

      const cellScreenWidth = cellWidth * scale.value;
      const inGridMode = cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;

      if (inGridMode && cols > 0 && rows > 0) {
        const velocity = Math.max(
          Math.abs(event.velocityX),
          Math.abs(event.velocityY),
        );
        const swipeThreshold = 300;

        const canvasCenterX = canvasWidth / 2 - translateX.value / scale.value;
        const canvasCenterY = canvasHeight / 2 - translateY.value / scale.value;
        let col = Math.round(canvasCenterX / cellWidth - 0.5);
        let row = Math.round(canvasCenterY / cellHeight - 0.5);

        if (velocity > swipeThreshold) {
          if (Math.abs(event.velocityX) > Math.abs(event.velocityY)) {
            col += event.velocityX > 0 ? -1 : 1;
          } else {
            row += event.velocityY > 0 ? -1 : 1;
          }
        }

        const clampedCol = Math.max(0, Math.min(cols - 1, col));
        const clampedRow = Math.max(0, Math.min(rows - 1, row));
        snapToCell(clampedRow, clampedCol);
      } else {
        const maxX = Math.max(
          0,
          (canvasWidth * scale.value - SCREEN_WIDTH) / 2,
        );
        const maxY = Math.max(
          0,
          (canvasHeight * scale.value - SCREEN_HEIGHT) / 2,
        );

        const targetX = clamp(
          translateX.value + event.velocityX * 0.1,
          -maxX,
          maxX,
        );
        const targetY = clamp(
          translateY.value + event.velocityY * 0.1,
          -maxY,
          maxY,
        );

        translateX.value = withSpring(targetX, {
          ...SPRING_CONFIG,
          velocity: event.velocityX,
        });
        translateY.value = withSpring(targetY, {
          ...SPRING_CONFIG,
          velocity: event.velocityY,
        });

        currentRow.value = -1;
        currentCol.value = -1;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const backButtonStyle = useAnimatedStyle(() => ({
    opacity: backButtonOpacity.value,
    pointerEvents: backButtonOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  const cellIndicatorStyle = useAnimatedStyle(() => ({
    opacity: isInGridMode.value && currentRow.value >= 0 ? 1 : 0,
    pointerEvents:
      isInGridMode.value && currentRow.value >= 0 ? 'auto' : 'none',
  }));

  const cellText = useDerivedValue(() => {
    if (currentRow.value < 0 || currentCol.value < 0) return '';
    return `${currentRow.value + 1} × ${currentCol.value + 1}`;
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.container}>
        <Canvas
          ref={canvasRef}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        />

        <Animated.View style={[styles.cellIndicator, cellIndicatorStyle]}>
          <ReText text={cellText} style={styles.cellIndicatorText} />
        </Animated.View>

        <Animated.View style={[styles.backButton, backButtonStyle]}>
          <Pressable onPress={resetZoom} style={styles.backButtonPressable}>
            <Text style={styles.backButtonText}>← Back to painting</Text>
          </Pressable>
        </Animated.View>

        <LoadingOverlay phase={loadingPhase} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  backButton: {
    left: 20,
    position: 'absolute',
    top: 60,
  },
  backButtonPressable: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderCurve: 'continuous',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cellIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderCurve: 'continuous',
    borderRadius: 12,
    bottom: 100,
    left: '50%',
    marginLeft: -40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'absolute',
  },
  cellIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
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
