import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { type FC, memo, useState } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AddCloseIcon } from './AddCloseIcon';
import { AnimatedBackdrop } from './AnimatedBackdrop';
import { FLOATING_BUTTON_SIZE } from './constants';
import { ModalContent } from './Modal';

const FloatingModal: FC = memo(() => {
  // This shared value is responsible to handle the modal state
  // Basically all the animations are based on this value
  const isOpened = useSharedValue(false);

  // This derived value is responsible to handle the modal progress
  // That's super useful in order to interpolate things nicely
  const progress = useDerivedValue<number>(() => {
    return withTiming(isOpened.get() ? 1 : 0);
  }, []);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const maxDistance = Math.sqrt(screenWidth ** 2 + screenHeight ** 2);
  const scale = useDerivedValue(() => {
    const distance = Math.sqrt(translateX.get() ** 2 + translateY.get() ** 2);
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
      if (!isOpened.get()) return;

      translateX.set(translationX);
      translateY.set(translationY);
    })
    .onFinalize(event => {
      // Ignore if the modal is closed
      if (!isOpened.get()) return;

      const isDraggingDown = event.translationY > 0;
      const isDraggingDownEnoughToClose = isDraggingDown && scale.get() < 0.95;

      if (isDraggingDownEnoughToClose) {
        isOpened.set(false);
      }

      translateX.set(
        withSpring(0, {
          overshootClamping: true,
        }),
      );
      translateY.set(
        withSpring(0, {
          overshootClamping: true,
        }),
      );
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
      progress.get(),
      [0, 1],
      [FLOATING_BUTTON_SIZE, screenWidth * 0.9],
      Extrapolation.CLAMP,
    );
    const rightDistance = interpolate(
      progress.get(),
      [0, 1],
      [FLOATING_BUTTON_SIZE / 2, screenWidth * 0.05],
      Extrapolation.CLAMP,
    );
    const bottomDistance = interpolate(
      progress.get(),
      [0, 1],
      [FLOATING_BUTTON_SIZE / 2, screenHeight / 2 - size / 2],
      Extrapolation.CLAMP,
    );

    const borderRadius = interpolate(
      progress.get(),
      [0, 1],
      [32, 15],
      Extrapolation.CLAMP,
    );

    return {
      width: size,
      height: size,
      bottom: bottomDistance,
      right: rightDistance,
      borderRadius: borderRadius,
      transform: [
        {
          scale: scale.get(),
        },
        {
          translateX: translateX.get(),
        },
        {
          translateY: translateY.get(),
        },
      ],
    };
  }, [screenWidth, screenHeight]);

  // That's a derived value that is responsible to handle
  // the backdrop and modal interactions/visibility
  const isModalVisible = useDerivedValue(() => {
    return progress.get() === 1;
  }, []);

  // e2e outcome probe: bridges the worklet-driven open state to a JS string so
  // a test can assert the modal actually morphed open. Visually negligible.
  const [status, setStatus] = useState<'hidden' | 'shown'>('hidden');
  useAnimatedReaction(
    () => isModalVisible.get(),
    visible => {
      scheduleOnRN(setStatus, visible ? 'shown' : 'hidden');
    },
    [],
  );

  return (
    <>
      <Text testID="floating-modal-status" style={styles.statusProbe}>
        {status}
      </Text>
      <AnimatedBackdrop
        isVisible={isModalVisible}
        onBackdropPress={() => {
          isOpened.set(!isOpened.get());
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
              isOpened.set(!isOpened.get());
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
    boxShadow: '0px 12px 12px rgba(0, 0, 0, 0.2)',
    position: 'absolute',
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
});

export { FloatingModal };
