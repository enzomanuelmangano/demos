import { Dimensions, StyleSheet, View } from 'react-native';

import React, { useCallback, useImperativeHandle, use } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  Keyframe,
  LinearTransition,
  useAnimatedRef,
  measure,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { RetrayContext } from '../context';
import { useKeyboardOffset } from '../hooks/use-keyboard-aware';
import { RetrayComponentsContext } from '../providers/components';
import { useRetrayTheme, type RetrayTheme } from '../providers/theme';

import type { StyleProp, ViewStyle } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Animation constants - keep these consistent
const SPRING_DAMPING = 25;
const SPRING_STIFFNESS = 300;
const SPRING_MASS = 0.6;
const KEYFRAME_DURATION = 120;

// Create consistent keyframes and transitions
const TimingKeyframeEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }, { translateY: 5 }] },
  50: { opacity: 0.2, transform: [{ scale: 0.98 }, { translateY: 5 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
}).duration(KEYFRAME_DURATION);

const TimingKeyframeExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
  50: { opacity: 0.2, transform: [{ scale: 0.98 }, { translateY: -5 }] },
  100: { opacity: 0, transform: [{ scale: 0.92 }, { translateY: -5 }] },
}).duration(KEYFRAME_DURATION);

const LayoutSpring = LinearTransition.springify()
  .damping(SPRING_DAMPING)
  .stiffness(SPRING_STIFFNESS)
  .mass(SPRING_MASS);

// Define the props for the ActionTray component
type ActionTrayProps = {
  children?: React.ReactNode;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
};

const ActionTray = React.forwardRef<any, ActionTrayProps>(
  ({ children, style, maxHeight = SCREEN_HEIGHT }, _ref) => {
    const { state, actions, meta } = use(RetrayContext);
    const theme = useRetrayTheme();
    const components = use(RetrayComponentsContext);
    const translateY = useSharedValue(maxHeight);
    const animatedTrayRef = useAnimatedRef();
    const { translateY: keyboardTranslateY } = useKeyboardOffset();

    const scrollTo = useCallback(
      (destination: number) => {
        'worklet';
        translateY.set(
          withSpring(destination, {
            mass: SPRING_MASS,
            damping: SPRING_DAMPING,
            stiffness: SPRING_STIFFNESS,
          }),
        );
      },
      [translateY],
    );

    const closeAction = useCallback(() => {
      'worklet';
      state.isActive.set(false);
      const animatedTrayMeasurements = measure(animatedTrayRef);
      const projectedHeight = animatedTrayMeasurements?.height
        ? animatedTrayMeasurements.height + theme.spacing.xxl
        : maxHeight;
      return scrollTo(projectedHeight);
    }, [
      scrollTo,
      state.isActive,
      animatedTrayRef,
      maxHeight,
      theme.spacing.xxl,
    ]);

    const close = useCallback(() => {
      'worklet';
      return scheduleOnUI(closeAction);
    }, [closeAction]);

    useImperativeHandle(
      meta.trayRef,
      () => ({
        open: () => {
          'worklet';
          state.isActive.set(true);
          scrollTo(0);
        },
        close,
        isActive: () => {
          return state.isActive.get();
        },
      }),
      [close, scrollTo, state.isActive],
    );

    const context = useSharedValue({ y: 0 });
    const gesture = Gesture.Pan()
      .onBegin(() => {
        context.set({ y: translateY.get() });
      })
      .onUpdate(event => {
        if (event.translationY > -50) {
          translateY.set(event.translationY + context.get().y);
        }
      })
      .onEnd(event => {
        if (event.translationY > 100) {
          scheduleOnRN(actions.dismiss);
        } else {
          scrollTo(context.get().y);
        }
      });

    const rTranslateStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { translateY: translateY.get() + keyboardTranslateY.get() },
        ],
      };
    }, []);

    const { Header, Backdrop } = components;

    return (
      <>
        <Backdrop />
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              createStyles(theme).actionTrayContainer,
              createStyles(theme).content,
              createStyles(theme).innerContainerRounded,
              rTranslateStyle,
              style,
            ]}
            layout={LayoutSpring}
            ref={animatedTrayRef}>
            <Header />
            <Animated.View
              entering={TimingKeyframeEntering}
              exiting={TimingKeyframeExiting}
              key={
                state.currentScreen
                  ? `${String(state.currentScreen)}-visible`
                  : 'default-visible'
              }
              style={createStyles(theme).contentContainer}>
              {children}
            </Animated.View>

            <View style={[createStyles(theme).footerSpacing]} />
          </Animated.View>
        </GestureDetector>
      </>
    );
  },
);

// Create theme-based styles
const createStyles = (theme: RetrayTheme) =>
  StyleSheet.create({
    actionTrayContainer: {
      alignSelf: 'center',
      borderCurve: 'continuous',
      bottom: theme.spacing.xl,
      justifyContent: 'flex-end',
      paddingHorizontal: theme.spacing.md,
      position: 'absolute',
      width: '94%',
    },
    content: {
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    contentContainer: {
      paddingBottom: theme.spacing.lg,
      paddingTop: theme.spacing.md,
    },
    footerSpacing: {
      bottom: -148,
      height: 150,
      left: 0,
      position: 'absolute',
      right: 0,
    },
    innerContainerRounded: {
      borderCurve: 'continuous',
      borderRadius: theme.borderRadius.lg,
    },
    measurementContainer: {
      left: 0,
      opacity: 0,
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: -1,
    },
  });

export { ActionTray };
