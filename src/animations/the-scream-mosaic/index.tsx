import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Image as ExpoImage } from 'expo-image';

import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { ReText } from 'react-native-redash';

import { Canvas, Fill } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MosaicRenderer } from './components/mosaic-renderer';
import { useMosaicMapping } from './hooks/use-mosaic-mapping';
import { usePaintingAnalysis } from './hooks/use-painting-analysis';
import { usePhotoAtlas } from './hooks/use-photo-atlas';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MIN_SCALE = 1;
const SPRING_CONFIG = { dampingRatio: 1, duration: 350 };
const SNAP_SPRING = { dampingRatio: 0.9, duration: 300 }; // Snappier for grid nav

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

  // Analysis hooks
  const {
    gridCells,
    gridDimensions,
    isAnalyzing: isAnalyzingPainting,
  } = usePaintingAnalysis(painting);

  const { cols, rows, aspectRatio } = gridDimensions;

  // Canvas dimensions
  const canvasWidth = SCREEN_WIDTH * 0.95;
  const canvasHeight = aspectRatio > 0 ? canvasWidth / aspectRatio : canvasWidth;

  // Cell dimensions
  const cellWidth = cols > 0 ? canvasWidth / cols : 0;
  const cellHeight = rows > 0 ? canvasHeight / rows : 0;

  // Load atlas and photo info
  const { atlas, photoInfoMap } = usePhotoAtlas();
  const { mapping, isMatching } = useMosaicMapping(gridCells, photoInfoMap);


  // Loading phase
  const loadingPhase: DetailedPhase = useMemo(() => {
    if (isAnalyzingPainting) return 'analyzing-painting';
    if (photoInfoMap.size === 0) return 'loading-manifest';
    if (isMatching) return 'matching-colors';
    if (mapping.size > 0 && !atlas) return 'loading-atlas';
    if (mapping.size > 0 && atlas) return 'complete';
    return 'idle';
  }, [isAnalyzingPainting, photoInfoMap.size, isMatching, mapping.size, atlas]);

  useEffect(() => {
    const elapsed = Date.now() - startTime.current;
    console.log(`[${elapsed}ms] Phase: ${loadingPhase}`);
  }, [loadingPhase]);

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

  // Zoom and pan state
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Grid mode state (shared values for UI thread performance)
  const currentRow = useSharedValue(-1); // -1 means no cell selected
  const currentCol = useSharedValue(-1);

  // React state mirror for triggering re-renders (for expo-image overlay)
  const [gridPosition, setGridPosition] = useState({ row: -1, col: -1 });

  // Sync shared values to React state
  useAnimatedReaction(
    () => ({ row: currentRow.value, col: currentCol.value }),
    (current, previous) => {
      if (current.row !== previous?.row || current.col !== previous?.col) {
        runOnJS(setGridPosition)(current);
      }
    },
  );

  // Derived: whether we're in grid mode
  const isInGridMode = useDerivedValue(() => {
    if (cellWidth === 0) return false;
    const cellScreenWidth = cellWidth * scale.value;
    return cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;
  });

  // Ideal scale for grid mode: cell fills 70% of screen width
  const idealGridScale = cellWidth > 0 ? (GRID_MODE_TARGET * SCREEN_WIDTH) / cellWidth : 1;

  // Snap to a specific cell at ideal scale (runs on UI thread)
  const snapToCell = (row: number, col: number) => {
    'worklet';
    // Snap scale to ideal grid scale
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

  // Image opacity
  const imageOpacity = useDerivedValue(() => 1);

  // Back button visibility
  const backButtonOpacity = useDerivedValue(() => {
    return interpolate(scale.value, [1, 1.5], [0, 1], 'clamp');
  });

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(event => {
      // Allow scaling up to 1.2x beyond ideal for rubberbanding feel
      const maxScale = idealGridScale * 1.2;
      const newScale = clamp(savedScale.value * event.scale, MIN_SCALE, maxScale);
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      // Snap to 1 if close to minimum
      if (scale.value < 1.2) {
        scale.value = withSpring(1, SPRING_CONFIG);
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        currentRow.value = -1;
        currentCol.value = -1;
      } else {
        // Check if we're entering grid mode - auto-snap to nearest cell
        const cellScreenWidth = cellWidth * scale.value;
        const inGridMode = cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;

        if (inGridMode && cols > 0 && rows > 0) {
          // Calculate which cell is centered and snap to it
          const canvasCenterX = canvasWidth / 2 - translateX.value / scale.value;
          const canvasCenterY = canvasHeight / 2 - translateY.value / scale.value;
          const col = Math.round(canvasCenterX / cellWidth - 0.5);
          const row = Math.round(canvasCenterY / cellHeight - 0.5);
          const clampedCol = Math.max(0, Math.min(cols - 1, col));
          const clampedRow = Math.max(0, Math.min(rows - 1, row));

          // snapToCell will set scale to idealGridScale
          snapToCell(clampedRow, clampedCol);
        }
      }
    });

  // Pan gesture - free pan or grid navigation depending on zoom level
  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(event => {
      if (scale.value <= 1) return;

      const maxX = Math.max(0, (canvasWidth * scale.value - SCREEN_WIDTH) / 2);
      const maxY = Math.max(0, (canvasHeight * scale.value - SCREEN_HEIGHT) / 2);

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
      if (scale.value <= 1) return;

      const cellScreenWidth = cellWidth * scale.value;
      const inGridMode = cellScreenWidth >= SCREEN_WIDTH * GRID_MODE_THRESHOLD;

      if (inGridMode && cols > 0 && rows > 0) {
        // Grid navigation: snap to nearest cell based on swipe direction
        const velocity = Math.max(Math.abs(event.velocityX), Math.abs(event.velocityY));
        const swipeThreshold = 300;

        // Calculate current centered cell
        const canvasCenterX = canvasWidth / 2 - translateX.value / scale.value;
        const canvasCenterY = canvasHeight / 2 - translateY.value / scale.value;
        let col = Math.round(canvasCenterX / cellWidth - 0.5);
        let row = Math.round(canvasCenterY / cellHeight - 0.5);

        // Apply swipe direction
        if (velocity > swipeThreshold) {
          if (Math.abs(event.velocityX) > Math.abs(event.velocityY)) {
            // Horizontal swipe
            col += event.velocityX > 0 ? -1 : 1;
          } else {
            // Vertical swipe
            row += event.velocityY > 0 ? -1 : 1;
          }
        }

        // Clamp to grid bounds and snap
        const clampedCol = Math.max(0, Math.min(cols - 1, col));
        const clampedRow = Math.max(0, Math.min(rows - 1, row));
        snapToCell(clampedRow, clampedCol);
      } else {
        // Free pan with momentum
        const maxX = Math.max(0, (canvasWidth * scale.value - SCREEN_WIDTH) / 2);
        const maxY = Math.max(0, (canvasHeight * scale.value - SCREEN_HEIGHT) / 2);

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

        translateX.value = withSpring(targetX, { ...SPRING_CONFIG, velocity: event.velocityX });
        translateY.value = withSpring(targetY, { ...SPRING_CONFIG, velocity: event.velocityY });

        // Clear grid cell selection when in free pan mode
        currentRow.value = -1;
        currentCol.value = -1;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const backButtonStyle = useAnimatedStyle(() => ({
    opacity: backButtonOpacity.value,
    pointerEvents: backButtonOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  // Cell indicator visibility
  const cellIndicatorStyle = useAnimatedStyle(() => ({
    opacity: isInGridMode.value && currentRow.value >= 0 ? 1 : 0,
    pointerEvents: isInGridMode.value && currentRow.value >= 0 ? 'auto' : 'none',
  }));

  // Cell indicator text
  const cellText = useDerivedValue(() => {
    if (currentRow.value < 0 || currentCol.value < 0) return '';
    return `${currentRow.value + 1} × ${currentCol.value + 1}`;
  });


  // Build visible cells list for high-res overlay (when in grid mode)
  const visibleHighResCells = useMemo(() => {
    const { row, col } = gridPosition;

    if (row < 0 || col < 0 || cols === 0 || rows === 0) return [];

    const result: { cellIndex: number; photoId: number; row: number; col: number }[] = [];

    // Get 3x3 grid around current cell
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const cellIndex = r * cols + c;
          const photoId = mapping.get(cellIndex);
          if (photoId !== undefined) {
            result.push({ cellIndex, photoId, row: r, col: c });
          }
        }
      }
    }

    return result;
  }, [gridPosition, cols, rows, mapping]);

  // Calculate screen size for a cell in grid mode
  const cellScreenSize = GRID_MODE_TARGET * SCREEN_WIDTH;

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

      {/* High-res overlay using expo-image (renders at full screen resolution) */}
      {gridPosition.row >= 0 && visibleHighResCells.length > 0 && (
        <View style={styles.highResOverlay} pointerEvents="none">
          {visibleHighResCells.map(({ cellIndex, photoId, row, col }) => {
            // Calculate position relative to center cell
            const offsetRow = row - gridPosition.row;
            const offsetCol = col - gridPosition.col;

            // Screen position (center of screen + offset)
            const screenX = (SCREEN_WIDTH - cellScreenSize) / 2 + offsetCol * cellScreenSize;
            const screenY = (SCREEN_HEIGHT - cellScreenSize) / 2 + offsetRow * cellScreenSize;

            const url = `https://picsum.photos/seed/mosaic-${photoId}/1000/1000`;

            return (
              <ExpoImage
                key={cellIndex}
                source={{ uri: url }}
                style={{
                  position: 'absolute',
                  left: screenX,
                  top: screenY,
                  width: cellScreenSize,
                  height: cellScreenSize,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            );
          })}
        </View>
      )}

      {/* Cell indicator */}
      <Animated.View style={[styles.cellIndicator, cellIndicatorStyle]}>
        <ReText text={cellText} style={styles.cellIndicatorText} />
      </Animated.View>

      {/* Back button */}
      <Animated.View style={[styles.backButton, backButtonStyle]}>
        <Pressable onPress={resetZoom} style={styles.backButtonPressable}>
          <Text style={styles.backButtonText}>← Back to painting</Text>
        </Pressable>
      </Animated.View>

      <LoadingOverlay phase={loadingPhase} />
    </View>
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
  highResOverlay: {
    ...StyleSheet.absoluteFillObject,
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
