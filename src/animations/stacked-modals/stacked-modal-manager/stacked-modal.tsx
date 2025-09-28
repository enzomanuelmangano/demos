import { StyleSheet, useWindowDimensions } from 'react-native';

import { useEffect, useMemo } from 'react';

import Animated, {
  FadeOutDown,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MAX_VISIBLE_MODALS, MODAL_HEIGHT } from './constants';
import { useInternalStackedModal } from './hooks';

import type { StackedModalType } from './context';

type StackedModalProps = {
  index: number;
  stackedSheet: StackedModalType;
};

const withCustomSpring = (value: number) => {
  'worklet';
  return withSpring(value, {
    mass: 2.5,
    damping: 100,
    stiffness: 740,
    overshootClamping: false,
  });
};

// Define the StackedModal component
const StackedModal: React.FC<StackedModalProps> = ({ stackedSheet, index }) => {
  // Get the width of the window using useWindowDimensions hook
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { id: stackedModalId, bottomHeight } =
    useInternalStackedModal(stackedSheet.key) ?? 0;

  // Shared values for animation
  // That's the "initial" position of the StackedModal
  // After that, the StackedModal will be animated to the bottom
  const bottomOffset = 110;
  const CenteredOffset = (windowHeight - MODAL_HEIGHT) / 2;
  const initialBottomPosition = CenteredOffset - bottomOffset;

  const bottom = useSharedValue(initialBottomPosition);

  // Update the bottom position when the StackedModal id changes
  // After the "mount" animation, the StackedModal will be animated to the
  // right bottom value.
  // To be honest that's not an easy solution, but it seems to work fine
  useEffect(() => {
    bottom.value = withCustomSpring(
      initialBottomPosition + bottomOffset + bottomHeight,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomHeight]);

  const baseOpacity = useSharedValue(0);

  useEffect(() => {
    baseOpacity.value = withCustomSpring(1);
  }, [baseOpacity]);

  const rStackedModalStyle = useAnimatedStyle(() => {
    return {
      bottom: bottom.value,
      zIndex: 100 - stackedModalId,
      shadowRadius: withCustomSpring(Math.max(10 - stackedModalId * 1, 2)),
      shadowOpacity: withCustomSpring(
        stackedModalId > 3 ? 0.1 - stackedModalId * 0.01 : 0.08,
      ),
    };
  }, [stackedSheet, stackedModalId]);

  const derivedOpacity = useDerivedValue(() => {
    return withCustomSpring(stackedModalId < MAX_VISIBLE_MODALS ? 1 : 0);
  }, [stackedModalId]);
  // Animated styles for the visible container (opacity)
  const rVisibleContainerStyle = useAnimatedStyle(() => {
    return {
      // The content of the first two StackedModals is visible
      // The content of the other StackedModals is hidden
      opacity: baseOpacity.value * derivedOpacity.value,

      transform: [
        {
          translateY: withCustomSpring(-stackedModalId * 5),
        },
        {
          scale: withCustomSpring(1 - stackedModalId * 0.05),
        },
      ],
    };
  }, [stackedModalId]);

  const isActiveStackedModalProgress = useDerivedValue(() => {
    return withCustomSpring(stackedModalId === 0 ? 1 : 0);
  }, [stackedModalId]);

  const rContentStyle = useAnimatedStyle(() => {
    return {
      opacity: isActiveStackedModalProgress.value ** 1.5,
    };
  }, [stackedModalId]);

  const memoizedChildren = useMemo(() => {
    if (!stackedSheet.children) return null;
    return stackedSheet.children();
  }, [stackedSheet]);

  return (
    <Animated.View
      key={index}
      style={[
        {
          width: windowWidth * 0.8,
          left: windowWidth * 0.1,
          zIndex: -1,
        },
        styles.container,
        rStackedModalStyle,
      ]}
      exiting={FadeOutDown.delay(60 * stackedModalId)}>
      {memoizedChildren && (
        <Animated.View
          style={[
            rVisibleContainerStyle,
            {
              width: windowWidth * 0.8,
              borderRadius: 10,
              borderCurve: 'continuous',
              overflow: 'hidden',
              height: MODAL_HEIGHT,
              // it would be better to avoid this backgroundColor
              backgroundColor: 'white',
            },
          ]}>
          <Animated.View style={[rContentStyle, { flex: 1 }]}>
            {stackedModalId <= MAX_VISIBLE_MODALS * 1.5 && memoizedChildren}
          </Animated.View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 35,
    elevation: 2,
    position: 'absolute',
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },
});

export { StackedModal };
