/**
 * A flippable ticket component that supports pan and tap gestures for rotation.
 * The ticket has two sides (front and back) and uses a holographic effect.
 */

import React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { HolographicCard } from '../holographic-card';

/**
 * Props for the Ticket component
 * @typedef {Object} TicketProps
 * @property {number} width - The width of the ticket
 * @property {number} height - The height of the ticket
 * @property {React.ReactNode} [frontSide] - Content to display on the front of the ticket
 * @property {React.ReactNode} [backSide] - Content to display on the back of the ticket
 */
type TicketProps = {
  width: number;
  height: number;
  frontSide?: React.ReactNode;
  backSide?: React.ReactNode;
};

export const Ticket: React.FC<TicketProps> = React.memo(
  ({ width, height, frontSide, backSide }) => {
    // Shared values for tracking horizontal translation and gesture context
    const translateX = useSharedValue(0);
    const contextX = useSharedValue(0);

    // Pan gesture handler for continuous rotation
    const panGesture = Gesture.Pan()
      .minDistance(10)
      .onStart(() => {
        contextX.value = translateX.value;
      })
      .onUpdate(event => {
        translateX.value = event.translationX + contextX.value;
      })
      .onEnd(event => {
        // Apply decay animation when gesture ends
        translateX.value = withDecay({
          velocity: event.velocityX,
          deceleration: 0.995,
        });
      });

    // Derived value for Y-axis rotation based on translation
    const rotateY = useDerivedValue(() => {
      return translateX.value % 360;
    });

    // Tap gesture handler for snapping to nearest complete rotation
    const tapGesture = Gesture.Tap()
      .maxDistance(10)
      .onStart(() => {
        cancelAnimation(translateX);
      })
      .onEnd(() => {
        cancelAnimation(translateX);
        // Snap to nearest complete rotation
        const normalizedRotation = Math.round(translateX.value / 360) * 360;
        translateX.value = withTiming(normalizedRotation, {
          duration: 500,
        });
      });

    // Combine gestures with Race - only one gesture can win
    const gesture = Gesture.Race(tapGesture, panGesture);

    // Animated style for the ticket's rotation
    const rTicketStyle = useAnimatedStyle(() => {
      const rotateYValue = `${rotateY.value}deg`;
      return {
        transform: [{ perspective: 1000 }, { rotateY: rotateYValue }],
      };
    });

    // Determine which side is currently visible
    const isFront = useDerivedValue(() => {
      const absRotate = Math.abs(rotateY.value);
      return absRotate < 90 || absRotate > 270;
    });

    // Animated styles for front and back visibility
    const rFrontStyle = useAnimatedStyle(() => {
      return {
        opacity: isFront.value ? 1 : 0,
        zIndex: isFront.value ? 1 : 0,
      };
    });

    const rBackStyle = useAnimatedStyle(() => {
      return {
        opacity: isFront.value ? 0 : 1,
        zIndex: isFront.value ? 0 : 1,
      };
    });

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              width,
              height,
              overflow: 'hidden',
            },
            rTicketStyle,
          ]}>
          {/* Holographic effect layer */}
          <HolographicCard
            width={width}
            height={height}
            rotateY={rotateY}
            color="#FFF5EEFF"
          />
          {/* Front side content */}
          <Animated.View style={[StyleSheet.absoluteFill, rFrontStyle]}>
            {frontSide}
          </Animated.View>
          {/* Back side content (mirrored with scaleX: -1) */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [{ scaleX: -1 }],
              },
              rBackStyle,
            ]}>
            {backSide}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);
