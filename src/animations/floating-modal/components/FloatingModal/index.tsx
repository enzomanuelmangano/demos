import { type FC, memo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AddCloseIcon } from './AddCloseIcon';
import { AnimatedBackdrop } from './AnimatedBackdrop';
import { ModalContent } from './Modal';
import { FLOATING_BUTTON_SIZE } from './constants';

const FloatingModal: FC = memo(() => {
  // This shared value is responsible to handle the modal state
  // Basically all the animations are based on this value
  const isOpened = useSharedValue(false);

  // This derived value is responsible to handle the modal progress
  // That's super useful in order to interpolate things nicely
  const progress = useDerivedValue<number>(() => {
    return withTiming(isOpened.value ? 1 : 0);
  }, []);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const maxDistance = Math.sqrt(screenWidth ** 2 + screenHeight ** 2);
  const scale = useDerivedValue(() => {
    const distance = Math.sqrt(translateX.value ** 2 + translateY.value ** 2);
    // The purpose of this is to normalize the distance
    // In order to get a proper scale (0 ~ 1)
    const normalizedDistance = distance / maxDistance; // 0 ~ 1
    return 1 - normalizedDistance;
  }, [maxDistance]);

  // The panGesture is responsible to handle the modal dragging
  // If the modal is dragged down enough, it will animate back (close the modal)
  const panGesture = Gesture.Pan()
    .onUpdate(({ translationX, translationY }) => {
      // Ignore if the modal is closed
      if (!isOpened.value) return;

      translateX.value = translationX;
      translateY.value = translationY;
    })
    .onFinalize(event => {
      // Ignore if the modal is closed
      if (!isOpened.value) return;

      const isDraggingDown = event.translationY > 0;
      const isDraggingDownEnoughToClose = isDraggingDown && scale.value < 0.95;

      if (isDraggingDownEnoughToClose) {
        isOpened.value = false;
      }

      translateX.value = withSpring(0, {
        overshootClamping: true,
      });
      translateY.value = withSpring(0, {
        overshootClamping: true,
      });
    });

  // This style has the responsability to animate the modal
  // Basically it handles the conversion from the:
  // FloatingButton <-> Modal
  // In order to do that, we need to:
  // 1. Animate the size
  // 2. Animate the position
  // 3. Animate the border radius
  // The translations and the scale are handled by the panGesture
  const rOpenedModalStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [FLOATING_BUTTON_SIZE, screenWidth * 0.9],
      Extrapolate.CLAMP,
    );
    const rightDistance = interpolate(
      progress.value,
      [0, 1],
      [FLOATING_BUTTON_SIZE / 2, screenWidth * 0.05],
      Extrapolate.CLAMP,
    );
    const bottomDistance = interpolate(
      progress.value,
      [0, 1],
      [FLOATING_BUTTON_SIZE / 2, screenHeight / 2 - size / 2],
      Extrapolate.CLAMP,
    );

    const borderRadius = interpolate(
      progress.value,
      [0, 1],
      [32, 15],
      Extrapolate.CLAMP,
    );

    return {
      width: size,
      height: size,
      bottom: bottomDistance,
      right: rightDistance,
      borderRadius: borderRadius,
      transform: [
        {
          scale: scale.value,
        },
        {
          translateX: translateX.value,
        },
        {
          translateY: translateY.value,
        },
      ],
    };
  }, [screenWidth, screenHeight]);

  // That's a derived value that is responsible to handle
  // the backdrop and modal interactions/visibility
  const isModalVisible = useDerivedValue(() => {
    return progress.value === 1;
  }, []);

  return (
    <>
      <AnimatedBackdrop
        isVisible={isModalVisible}
        onBackdropPress={() => {
          isOpened.value = !isOpened.value;
        }}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.floatingModal, rOpenedModalStyle]}>
          {/* 
            Here the trick is that the ModalContent is always here
            But it's only visible when the modal is opened. 
            That's great because we can avoid unmounting the modal content. 

            You can probably get the same result by using 
            a JavaScript state + LayoutAnimation. 
          */}
          <ModalContent isVisible={isModalVisible} />
          <AddCloseIcon
            progress={progress}
            onPress={() => {
              isOpened.value = !isOpened.value;
            }}
          />
          <Animated.View />
        </Animated.View>
      </GestureDetector>
    </>
  );
});

const styles = StyleSheet.create({
  floatingModal: {
    backgroundColor: 'white',
    position: 'absolute',
    shadowColor: 'black',
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.2,
    elevation: 4,
  },
});

export { FloatingModal };
