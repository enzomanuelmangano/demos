import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import {
  Canvas,
  Group,
  Image,
  rect as skRect,
  rrect,
  Skia,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { PhotoInfo } from '../hooks/use-photo-atlas';
import type { SkImage } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_SIZE = SCREEN_WIDTH * 0.9;
const HIGHRES_SIZE = 800;

const SPRING_CONFIG = {
  damping: 25,
  stiffness: 300,
  mass: 0.8,
};

interface PhotoCarouselProps {
  atlas: SkImage;
  photoInfoMap: Map<number, PhotoInfo>;
  photoIds: number[];
  initialIndex: number;
  progress: SharedValue<number>;
  onClose: () => void;
}

// Single photo slide component with high-res loading
const PhotoSlide = ({
  atlas,
  photoInfo,
  index,
  translateX,
}: {
  atlas: SkImage;
  photoInfo: PhotoInfo;
  index: number;
  translateX: SharedValue<number>;
}) => {
  const [highResImage, setHighResImage] = useState<SkImage | null>(null);

  // Load high-res image on mount
  useEffect(() => {
    let cancelled = false;

    const loadHighRes = async () => {
      try {
        const url = `https://picsum.photos/seed/mosaic-${photoInfo.id}/${HIGHRES_SIZE}/${HIGHRES_SIZE}`;
        const response = await fetch(url);
        if (!response.ok || cancelled) return;

        const arrayBuffer = await response.arrayBuffer();
        const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
        const image = Skia.Image.MakeImageFromEncoded(data);

        if (image && !cancelled) {
          setHighResImage(image);
        }
      } catch (e) {
        console.warn(`Failed to load high-res for photo ${photoInfo.id}:`, e);
      }
    };

    loadHighRes();
    return () => {
      cancelled = true;
    };
  }, [photoInfo.id]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + index * SCREEN_WIDTH }],
  }));

  // Use high-res if available, otherwise fall back to atlas
  const displayImage = highResImage ?? atlas;

  // Calculate source position for atlas fallback
  const srcX = highResImage ? 0 : photoInfo.atlasRect.x;
  const srcY = highResImage ? 0 : photoInfo.atlasRect.y;
  const srcSize = highResImage ? HIGHRES_SIZE : photoInfo.atlasRect.width;
  const scale = PHOTO_SIZE / srcSize;
  const imgX = -srcX * scale;
  const imgY = -srcY * scale;
  const imgW = displayImage.width() * scale;
  const imgH = displayImage.height() * scale;

  return (
    <Animated.View
      style={[
        styles.slide,
        animatedStyle,
        {
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      <Canvas style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}>
        <Group clip={rrect(skRect(0, 0, PHOTO_SIZE, PHOTO_SIZE), 16, 16)}>
          <Image
            image={displayImage}
            x={imgX}
            y={imgY}
            width={imgW}
            height={imgH}
            fit="fill"
          />
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export const PhotoCarousel = ({
  atlas,
  photoInfoMap,
  photoIds,
  initialIndex,
  progress,
  onClose,
}: PhotoCarouselProps) => {
  const translateX = useSharedValue(-initialIndex * SCREEN_WIDTH);
  const panContext = useSharedValue(0);

  // Track which indices to render (virtualization window)
  const [visibleRange, setVisibleRange] = useState({
    start: Math.max(0, initialIndex - 2),
    end: Math.min(photoIds.length - 1, initialIndex + 2),
  });

  // Update translateX when initialIndex changes
  useEffect(() => {
    translateX.value = -initialIndex * SCREEN_WIDTH;
    setVisibleRange({
      start: Math.max(0, initialIndex - 2),
      end: Math.min(photoIds.length - 1, initialIndex + 2),
    });
  }, [initialIndex, translateX, photoIds.length]);

  // Current index derived from translateX
  const currentIndex = useDerivedValue(() => {
    return Math.round(-translateX.value / SCREEN_WIDTH);
  });

  // Update visible range when scrolling
  useAnimatedReaction(
    () => currentIndex.value,
    (idx) => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(photoIds.length - 1, idx + 2);
      runOnJS(setVisibleRange)({ start, end });
    },
    [photoIds.length],
  );

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      panContext.value = translateX.value;
    })
    .onUpdate(event => {
      translateX.value = panContext.value + event.translationX;
    })
    .onEnd(event => {
      const velocity = event.velocityX;
      const swipeThreshold = SCREEN_WIDTH / 3;
      const current = currentIndex.value;

      let targetIndex = current;

      if (Math.abs(event.translationX) > swipeThreshold || Math.abs(velocity) > 500) {
        if (event.translationX > 0 || velocity > 500) {
          targetIndex = Math.max(0, current - 1);
        } else {
          targetIndex = Math.min(photoIds.length - 1, current + 1);
        }
      }

      translateX.value = withSpring(-targetIndex * SCREEN_WIDTH, {
        ...SPRING_CONFIG,
        velocity: velocity,
      });
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(onClose)();
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // Track if carousel is open for pointer events
  const [isOpen, setIsOpen] = useState(false);

  useAnimatedReaction(
    () => progress.value > 0.5,
    (open) => {
      runOnJS(setIsOpen)(open);
    },
    [],
  );

  // Generate visible slides
  const visibleSlides = [];
  console.log(`[Carousel] Rendering range ${visibleRange.start}-${visibleRange.end}, isOpen=${isOpen}`);
  for (let i = visibleRange.start; i <= visibleRange.end; i++) {
    const photoId = photoIds[i];
    const info = photoInfoMap.get(photoId);
    if (info) {
      visibleSlides.push(
        <PhotoSlide
          key={`${i}-${photoId}`}
          atlas={atlas}
          photoInfo={info}
          index={i}
          translateX={translateX}
        />,
      );
    }
  }
  console.log(`[Carousel] Generated ${visibleSlides.length} slides`);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[styles.container, containerStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        {visibleSlides}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  slide: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  canvas: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
