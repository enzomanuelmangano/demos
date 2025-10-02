import { Dimensions, StyleSheet } from 'react-native';

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useImperativeHandle,
} from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Backdrop } from './Backdrop';

import type { StyleProp, ViewStyle } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
type ActionTrayProps = {
  children?: ReactNode;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
  onClose?: () => void;
};

export type ActionTrayRef = {
  open: () => void;
  isActive: () => boolean;
  close: () => void;
};

const ActionTray = forwardRef<ActionTrayRef, ActionTrayProps>(
  ({ children, style, maxHeight = SCREEN_HEIGHT, onClose }, ref) => {
    const translateY = useSharedValue(maxHeight);

    const MAX_TRANSLATE_Y = -maxHeight;

    const active = useSharedValue(false);
    const scrollTo = useCallback(
      (destination: number) => {
        'worklet';
        active.value = destination !== maxHeight;

        translateY.value = withSpring(destination);
      },
      [active, maxHeight, translateY],
    );

    const close = useCallback(() => {
      'worklet';
      return scrollTo(maxHeight);
    }, [maxHeight, scrollTo]);
    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          'worklet';
          scrollTo(0);
        },
        close,
        isActive: () => {
          return active.value;
        },
      }),
      [close, scrollTo, active.value],
    );

    const context = useSharedValue({ y: 0 });

    const gesture = Gesture.Pan()
      .onStart(() => {
        context.value = { y: translateY.value };
      })
      .onUpdate(event => {
        if (event.translationY > -50) {
          translateY.value = event.translationY + context.value.y;
        }
      })
      .onEnd(event => {
        if (event.translationY > 100) {
          if (onClose) {
            scheduleOnRN(onClose);
          } else close();
        } else {
          scrollTo(context.value.y);
        }
      });

    const rActionTrayStyle = useAnimatedStyle(() => {
      const borderRadius = interpolate(
        translateY.value,
        [MAX_TRANSLATE_Y + 50, MAX_TRANSLATE_Y],
        [25, 5],
        Extrapolation.CLAMP,
      );

      return {
        borderRadius,
        transform: [{ translateY: translateY.value }],
      };
    });

    return (
      <>
        <Backdrop onTap={onClose ?? close} isActive={active} />
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[styles.actionTrayContainer, rActionTrayStyle, style]}>
            <Animated.View
              layout={LinearTransition}
              entering={FadeIn}
              exiting={FadeOut}>
              {children}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </>
    );
  },
);
const styles = StyleSheet.create({
  actionTrayContainer: {
    alignSelf: 'center',
    backgroundColor: '#FFF',
    borderCurve: 'continuous',
    bottom: 30,
    position: 'absolute',
    width: '95%',
  },
  fill: { flex: 1 },
  line: {
    alignSelf: 'center',
    backgroundColor: 'grey',
    borderRadius: 2,
    height: 4,
    marginVertical: 15,
    width: 75,
  },
});

export { ActionTray };
