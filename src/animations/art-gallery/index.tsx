import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, CanvasRef } from 'react-native-wgpu';
import { scheduleOnRN } from 'react-native-worklets';
import * as DropdownMenu from 'zeego/dropdown-menu';

import { ZoomOutButton } from './components/zoom-out-button';
import {
  clearMosaicMappingCache,
  useMosaicMapping,
} from './hooks/use-mosaic-mapping';
import {
  EMPTY_ANALYSIS,
  loadAndAnalyzePainting,
} from './hooks/use-painting-analysis';
import { usePhotoAtlas } from './hooks/use-photo-atlas';
import { useWebGPUMosaic } from './hooks/use-webgpu-mosaic';
import { ART_MOVEMENTS, PAINTINGS } from './paintings';
import {
  useAnalysis,
  useIsAtlasMode,
  useSelectedPaintingId,
  useSetAnalysis,
  useSetSelectedPaintingId,
} from './state';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const playTransitionHaptics = async () => {
  // Rapid light taps during the shuffle animation
  for (let i = 0; i < 8; i++) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // Settle with a medium tap
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

const SPRING_CONFIG = { dampingRatio: 1, duration: 350 };

// Canvas takes 95% of screen width
const CANVAS_WIDTH_RATIO = 0.95;
// Grid mode: when a cell fills this fraction of screen width
const GRID_MODE_THRESHOLD = 0.5;
// Ideal grid scale: cell fills 70% of screen width
const GRID_MODE_TARGET = 0.7;
// Scale threshold for snapping back to default zoom
const SNAP_BACK_THRESHOLD = 1.2;
// Minimum scale with rubber band effect during pinch
const MIN_SCALE_RUBBER_BAND = 0.5;

// Header right button component - subscribes only to selectedPaintingId
const HeaderRight = memo(
  ({ onPaintingChange }: { onPaintingChange: (id: string | null) => void }) => {
    const selectedPaintingId = useSelectedPaintingId();

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Pressable style={styles.headerButton} hitSlop={12}>
            <Ionicons
              name="ellipsis-horizontal-circle"
              size={28}
              color="#fff"
            />
          </Pressable>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.CheckboxItem
            key="default"
            value={selectedPaintingId === null ? 'on' : 'off'}
            onValueChange={() => onPaintingChange(null)}>
            <DropdownMenu.ItemTitle>Default</DropdownMenu.ItemTitle>
            <DropdownMenu.ItemIndicator />
          </DropdownMenu.CheckboxItem>
          {ART_MOVEMENTS.map(movement => (
            <DropdownMenu.Sub key={movement.id}>
              <DropdownMenu.SubTrigger key={`${movement.id}-trigger`}>
                <DropdownMenu.ItemTitle>{movement.name}</DropdownMenu.ItemTitle>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                {movement.painters.map(painter => (
                  <DropdownMenu.Sub key={painter.id}>
                    <DropdownMenu.SubTrigger key={`${painter.id}-trigger`}>
                      <DropdownMenu.ItemTitle>
                        {painter.name}
                      </DropdownMenu.ItemTitle>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {painter.paintings.map(painting => (
                        <DropdownMenu.CheckboxItem
                          key={painting.id}
                          value={
                            painting.id === selectedPaintingId ? 'on' : 'off'
                          }
                          onValueChange={() => onPaintingChange(painting.id)}>
                          <DropdownMenu.ItemTitle>
                            {painting.name}
                          </DropdownMenu.ItemTitle>
                          <DropdownMenu.ItemIndicator />
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  },
);

export function ArtGallery() {
  const navigation = useNavigation();
  const { top: safeTop } = useSafeAreaInsets();
  const canvasRef = useRef<CanvasRef>(null);

  // Painting selection via Jotai atoms (prevents full re-renders)
  // Only subscribe to what this component needs - setters and derived isAtlasMode
  const setSelectedPaintingId = useSetSelectedPaintingId();
  const analysis = useAnalysis();
  const setAnalysis = useSetAnalysis();
  const isAtlasMode = useIsAtlasMode();

  // Default grid for atlas view (100x100 = 10,000 photos)
  const DEFAULT_GRID_COLS = 100;
  const DEFAULT_GRID_ROWS = 100;

  // Use painting grid or default atlas grid
  const paintingGridCells = analysis.gridCells;
  const paintingGridDimensions = analysis.gridDimensions;

  // Use painting grid or default atlas grid
  const cols = isAtlasMode ? DEFAULT_GRID_COLS : paintingGridDimensions.cols;
  const rows = isAtlasMode ? DEFAULT_GRID_ROWS : paintingGridDimensions.rows;
  const aspectRatio = isAtlasMode ? 1 : paintingGridDimensions.aspectRatio;

  // Canvas dimensions
  const canvasWidth = SCREEN_WIDTH * CANVAS_WIDTH_RATIO;
  const canvasHeight =
    aspectRatio > 0 ? canvasWidth / aspectRatio : canvasWidth;

  // Cell dimensions
  const cellWidth = cols > 0 ? canvasWidth / cols : 0;
  const cellHeight = rows > 0 ? canvasHeight / rows : 0;

  // Load atlas and photo info
  const { photoInfoMap } = usePhotoAtlas();
  const { mapping } = useMosaicMapping(
    isAtlasMode ? [] : paintingGridCells,
    photoInfoMap,
  );

  // Generate cells with SCREEN-RELATIVE positions (centered)
  // This bakes the centering into the positions so the hook doesn't need paintingWidth/Height
  const cells = useMemo(() => {
    const halfW = canvasWidth / 2;
    const halfH = canvasHeight / 2;

    // Atlas mode: sequential grid with sequential photo IDs
    if (isAtlasMode) {
      if (photoInfoMap.size === 0) return [];

      const totalCells = cols * rows;
      const result = [];
      for (let i = 0; i < totalCells; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        result.push({
          index: i,
          x: col * cellWidth - halfW,
          y: row * cellHeight - halfH,
          photoId: i < photoInfoMap.size ? i : null,
          placeholderColor: { r: 128, g: 128, b: 128 },
        });
      }
      return result;
    }

    // Painting mode: use color-matched mapping (computed synchronously on UI thread)
    if (mapping.size === 0 || paintingGridCells.length === 0) {
      return [];
    }

    return paintingGridCells.map(cell => ({
      index: cell.index,
      x: cell.col * cellWidth - halfW,
      y: cell.row * cellHeight - halfH,
      photoId: mapping.get(cell.index) ?? null,
      placeholderColor: cell.targetColor,
    }));
  }, [
    isAtlasMode,
    paintingGridCells,
    mapping,
    cellWidth,
    cellHeight,
    canvasWidth,
    canvasHeight,
    photoInfoMap.size,
    cols,
    rows,
  ]);

  // Zoom and pan state (all on UI thread via SharedValues)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Animation progress for painting transitions (1 = old positions, 0 = new positions)
  const animProgress = useSharedValue(0);

  // Grid mode state (UI thread only - no React state sync)
  const currentRow = useSharedValue(-1);
  const currentCol = useSharedValue(-1);

  // Handle painting change - load & analyze immediately, then update state once
  const handlePaintingChange = useCallback(
    async (paintingId: string | null) => {
      // Reset zoom immediately
      scale.value = withSpring(1, SPRING_CONFIG);
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
      currentRow.value = -1;
      currentCol.value = -1;

      clearMosaicMappingCache();

      // Play haptics during transition
      playTransitionHaptics();

      if (paintingId === null) {
        // Atlas mode
        setSelectedPaintingId(null);
        setAnalysis(EMPTY_ANALYSIS);
        return;
      }

      // Find painting and load/analyze it
      const painting = PAINTINGS.find(p => p.id === paintingId);
      if (!painting) return;

      const result = await loadAndAnalyzePainting(painting.asset);

      // Update state once with both painting ID and analysis
      setSelectedPaintingId(paintingId);
      setAnalysis(result);
    },
    [
      scale,
      translateX,
      translateY,
      currentRow,
      currentCol,
      setSelectedPaintingId,
      setAnalysis,
    ],
  );

  // Configure native header - only depends on handlePaintingChange, not on selectedPaintingId
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: 'Gallery',
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: '600',
      },
      headerRight: () => (
        <HeaderRight onPaintingChange={handlePaintingChange} />
      ),
    });

    // Reset header when unmounting to prevent it persisting on other screens
    return () => {
      navigation.setOptions({
        headerShown: false,
        headerRight: undefined,
      });
    };
  }, [navigation, handlePaintingChange]);

  // Initialize WebGPU renderer
  useWebGPUMosaic(canvasRef, {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    cols,
    rows,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    scale,
    translateX,
    translateY,
    animProgress,
    currentRow,
    currentCol,
  });

  // Ideal scale for grid mode: cell fills 70% of screen width
  const idealGridScale =
    cellWidth > 0 ? (GRID_MODE_TARGET * SCREEN_WIDTH) / cellWidth : 1;

  // Haptic feedback helper
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Snap to a specific cell at ideal scale (runs on UI thread)
  const snapToCell = (
    row: number,
    col: number,
    springConfig: { dampingRatio: number; duration: number },
  ) => {
    'worklet';
    scheduleOnRN(triggerHaptic);
    scale.value = withSpring(idealGridScale, springConfig);

    const cellCenterX = (col + 0.5) * cellWidth;
    const cellCenterY = (row + 0.5) * cellHeight;
    let targetTx = -(cellCenterX - canvasWidth / 2) * idealGridScale;
    let targetTy = -(cellCenterY - canvasHeight / 2) * idealGridScale;

    // Clamp translation to allow centering any cell, but not beyond
    // The range needed to center any cell from 0 to cols-1:
    // col=0: targetTx = (canvasWidth/2 - 0.5*cellWidth) * scale
    // col=cols-1: targetTx = -(canvasWidth/2 - 0.5*cellWidth) * scale
    const maxTx = Math.max(
      0,
      (canvasWidth / 2 - cellWidth / 2) * idealGridScale,
    );
    const maxTy = Math.max(
      0,
      (canvasHeight / 2 - cellHeight / 2) * idealGridScale,
    );
    targetTx = clamp(targetTx, -maxTx, maxTx);
    targetTy = clamp(targetTy, -maxTy, maxTy);

    translateX.value = withSpring(targetTx, springConfig);
    translateY.value = withSpring(targetTy, springConfig);

    currentRow.value = row;
    currentCol.value = col;
  };

  // Reset zoom
  const resetZoom = () => {
    triggerHaptic();
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
      // Allow pinching below min scale for fidgeting (rubber band effect)
      const newScale = clamp(
        savedScale.value * event.scale,
        MIN_SCALE_RUBBER_BAND,
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

      if (scale.value < SNAP_BACK_THRESHOLD) {
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

          snapToCell(clampedRow, clampedCol, {
            dampingRatio: 1,
            duration: 350,
          });
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
      // Cancel any running snap animations
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(scale);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(event => {
      if (isPinching.value) return;
      if (scale.value <= 1) return;

      // Use cell-based bounds (same as snapToCell) to allow reaching edge cells
      const maxX = Math.max(0, (canvasWidth / 2 - cellWidth / 2) * scale.value);
      const maxY = Math.max(
        0,
        (canvasHeight / 2 - cellHeight / 2) * scale.value,
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
        snapToCell(clampedRow, clampedCol, { dampingRatio: 1, duration: 350 });
      } else {
        // Use cell-based bounds (same as snapToCell)
        const maxX = Math.max(
          0,
          (canvasWidth / 2 - cellWidth / 2) * scale.value,
        );
        const maxY = Math.max(
          0,
          (canvasHeight / 2 - cellHeight / 2) * scale.value,
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

  // Double tap gesture to zoom in/out (uses slower spring for cinematic feel)
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(event => {
      if (scale.value > SNAP_BACK_THRESHOLD) {
        // Zoomed in - zoom out
        scheduleOnRN(triggerHaptic);
        scale.value = withSpring(1, { dampingRatio: 1, duration: 350 });
        translateX.value = withSpring(0, { dampingRatio: 1, duration: 350 });
        translateY.value = withSpring(0, { dampingRatio: 1, duration: 350 });
        currentRow.value = -1;
        currentCol.value = -1;
      } else {
        // Zoomed out - zoom in to tapped cell
        if (cols > 0 && rows > 0 && cellWidth > 0 && cellHeight > 0) {
          // Convert tap position to canvas coordinates
          const tapX = event.x - SCREEN_WIDTH / 2;
          const tapY = event.y - SCREEN_HEIGHT / 2;

          // Account for current transform
          const canvasX =
            (tapX - translateX.value) / scale.value + canvasWidth / 2;
          const canvasY =
            (tapY - translateY.value) / scale.value + canvasHeight / 2;

          // Find which cell was tapped
          const col = Math.floor(canvasX / cellWidth);
          const row = Math.floor(canvasY / cellHeight);
          const clampedCol = Math.max(0, Math.min(cols - 1, col));
          const clampedRow = Math.max(0, Math.min(rows - 1, row));

          snapToCell(clampedRow, clampedCol, {
            dampingRatio: 1,
            duration: 350,
          });
        }
      }
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const backButtonStyle = useAnimatedStyle(() => ({
    opacity: backButtonOpacity.value,
    pointerEvents: backButtonOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.container}>
        <Canvas
          ref={canvasRef}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        />

        {/* Header gradient */}
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.4)', 'transparent']}
          style={[styles.headerGradient, { height: safeTop + 180 }]}
          pointerEvents="none"
        />

        <Animated.View style={[styles.fab, backButtonStyle]}>
          <ZoomOutButton onPress={resetZoom} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  fab: {
    bottom: 40,
    position: 'absolute',
    right: 20,
  },
  headerButton: {
    marginRight: 8,
    padding: 4,
  },
  headerGradient: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
