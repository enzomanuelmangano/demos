import { StyleSheet, useWindowDimensions } from 'react-native';

import { type FC, useCallback, useMemo, useState, ReactNode } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  snapToCorner,
  useInitialPanelPosition,
} from './utils/animation-helpers';
import { DEMO_BUTTON_ROW_HEIGHT } from '../../../../navigation/home/demo-close-button';

import type {
  DerivedValue,
  SharedValue,
  WithSpringConfig,
} from 'react-native-reanimated';

type AnimatedSpringConfig =
  | WithSpringConfig
  | SharedValue<WithSpringConfig>
  | DerivedValue<WithSpringConfig>;

type DraggableControlPanelProps = {
  springConfig: AnimatedSpringConfig;
  collapsedChildren: (toggleCollapse: () => void) => ReactNode;
  expandedChildren: (toggleCollapse: () => void) => ReactNode;
  collapsedWidth?: number;
  collapsedHeight?: number;
  expandedWidth?: number;
  expandedHeight?: number;
};

const isSharedValue = <T,>(
  animatedValue: DerivedValue<T> | SharedValue<T> | T,
): animatedValue is SharedValue<T> | DerivedValue<T> => {
  'worklet';
  return (
    typeof animatedValue === 'object' &&
    animatedValue !== null &&
    'value' in animatedValue
  );
};

const unwrapAnimatedValue = <T,>(
  animatedValue: DerivedValue<T> | SharedValue<T> | T,
): T => {
  'worklet';
  return isSharedValue<T>(animatedValue) ? animatedValue.get() : animatedValue;
};

export const DraggableControlPanel: FC<DraggableControlPanelProps> = ({
  springConfig,
  collapsedChildren,
  expandedChildren,
  collapsedWidth = 64,
  collapsedHeight = 64,
  expandedWidth = 280,
  expandedHeight = 150,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  const topMargin = safeTop + DEMO_BUTTON_ROW_HEIGHT;
  const initialPosition = useInitialPanelPosition(
    expandedWidth,
    expandedHeight,
  );
  const translateX = useSharedValue(initialPosition.x);
  const translateY = useSharedValue(initialPosition.y);
  const isDraggingPanel = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Resizes around the panel's centre: the corner is picked from where the
  // panel is, not from its top-left, which for a small panel at the old
  // top-left is nearer the opposite corner.
  const snapWithDimensions = useCallback(
    (fromWidth: number, fromHeight: number, width: number, height: number) => {
      const snapPosition = snapToCorner(
        translateX.get() + (fromWidth - width) / 2,
        translateY.get() + (fromHeight - height) / 2,
        width,
        height,
        screenWidth,
        screenHeight,
        topMargin,
      );

      translateX.set(
        withSpring(snapPosition.x, unwrapAnimatedValue(springConfig)),
      );
      translateY.set(
        withSpring(snapPosition.y, unwrapAnimatedValue(springConfig)),
      );
    },
    [
      screenWidth,
      screenHeight,
      topMargin,
      translateX,
      translateY,
      springConfig,
    ],
  );

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const newIsCollapsed = !prev;
      const oldWidth = prev ? collapsedWidth : expandedWidth;
      const oldHeight = prev ? collapsedHeight : expandedHeight;
      const newWidth = newIsCollapsed ? collapsedWidth : expandedWidth;
      const newHeight = newIsCollapsed ? collapsedHeight : expandedHeight;
      snapWithDimensions(oldWidth, oldHeight, newWidth, newHeight);

      return newIsCollapsed;
    });
  }, [
    collapsedWidth,
    collapsedHeight,
    expandedWidth,
    expandedHeight,
    snapWithDimensions,
  ]);

  const panelGesture = useMemo(() => {
    return Gesture.Pan()
      .onBegin(() => {
        isDraggingPanel.set(true);
        startX.set(translateX.get());
        startY.set(translateY.get());
      })
      .onChange(event => {
        translateX.set(startX.get() + event.translationX);
        translateY.set(startY.get() + event.translationY);
      })
      .onEnd(event => {
        isDraggingPanel.set(false);

        const currentHeight = isCollapsed ? collapsedHeight : expandedHeight;
        const currentWidth = isCollapsed ? collapsedWidth : expandedWidth;
        const snapPosition = snapToCorner(
          translateX.get(),
          translateY.get(),
          currentWidth,
          currentHeight,
          screenWidth,
          screenHeight,
          topMargin,
          event.velocityX,
          event.velocityY,
        );

        translateX.set(
          withSpring(snapPosition.x, {
            ...unwrapAnimatedValue(springConfig),
            velocity: event.velocityX,
          }),
        );
        translateY.set(
          withSpring(snapPosition.y, {
            ...unwrapAnimatedValue(springConfig),
            velocity: event.velocityY,
          }),
        );
      });
  }, [
    isDraggingPanel,
    startX,
    translateX,
    startY,
    translateY,
    isCollapsed,
    collapsedHeight,
    expandedHeight,
    collapsedWidth,
    expandedWidth,
    screenWidth,
    screenHeight,
    topMargin,
    springConfig,
  ]);

  const panelStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.get() },
        { translateY: translateY.get() },
      ],
    };
  });

  const progress = useDerivedValue(() => {
    return withSpring(isCollapsed ? 0 : 1, {
      dampingRatio: 1,
      duration: 500,
    });
  });

  const rContentPanelStyle = useAnimatedStyle(() => {
    return {
      borderRadius: interpolate(
        progress.get(),
        [0, 1],
        [collapsedWidth / 2, 16],
      ),
    };
  });

  return (
    <GestureDetector gesture={panelGesture}>
      <Animated.View style={[styles.controls, panelStyle]}>
        <Animated.View
          style={[
            styles.controlPanel,
            {
              width: isCollapsed ? collapsedWidth : expandedWidth,
              height: isCollapsed ? collapsedHeight : expandedHeight,
              justifyContent: 'center',
              alignItems: 'center',
            },
            rContentPanelStyle,
          ]}
          layout={LayoutTransition}>
          {isCollapsed ? (
            <Animated.View
              key="collapsed"
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(100)}>
              {collapsedChildren(toggleCollapse)}
            </Animated.View>
          ) : (
            <Animated.View
              key="expanded"
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(100)}>
              {expandedChildren(toggleCollapse)}
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const LayoutTransition = LinearTransition.springify()
  .mass(0.3)
  .damping(20)
  .stiffness(250);

const styles = StyleSheet.create({
  controlPanel: {
    backgroundColor: '#ffffff',
    boxShadow: '0px 0px 24px rgba(0, 0, 0, 0.05)',
    elevation: 24,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute',
  },
});
