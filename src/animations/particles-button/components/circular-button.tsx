/**
 * CircularButton Component
 *
 * A customizable circular button component with a blast effect animation and icon transition.
 * The button features a smooth animation between two states with a particle blast effect
 * when pressed.
 *
 * @component
 * @example
 * ```tsx
 * <CircularButton
 *   blastRadius={48}
 *   size={48}
 *   onPress={() => console.log('Pressed!')}
 * />
 * ```
 */

import { StyleSheet, View } from 'react-native';
import { useCallback, useMemo, useRef } from 'react';
import { PressableScale } from 'pressto';
import { AntDesign, FontAwesome6 } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import type { BlastEffectRefType } from './blast-effect';
import { BlastCircleEffect } from './blast-effect';

/**
 * Props for the CircularButton component
 */
type CircularButtonProps = {
  /** Radius of the blast effect animation */
  blastRadius: number;
  /** Size of the circular button */
  size: number;
  /** Optional custom icon for the base state */
  baseIcon?: React.ReactNode;
  /** Optional custom icon for the active state */
  activeIcon?: React.ReactNode;
  /** Whether to automatically reset the button state after animation */
  autoReset?: boolean;
  /** Callback function called when the button is pressed */
  onPress?: () => void;
};

/**
 * Spring animation configuration for the blast effect
 */
const BlastCurveConfig = {
  mass: 1,
  stiffness: 70,
  damping: 16,
};

// Default colors for the button
const lightColor = '#afafaf';
const darkColor = '#1d1d1d';

export const CircularButton: React.FC<CircularButtonProps> = ({
  blastRadius,
  size,
  baseIcon: baseIconProp,
  activeIcon: activeIconProp,
  autoReset = true,
  onPress,
}) => {
  const progress = useSharedValue(0);

  const boxStyle = useMemo(() => {
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: darkColor,
    };
  }, [size]);

  const blastSize = size * 5;

  const blastEffectRef = useRef<BlastEffectRefType>(null);

  const baseIcon = useMemo(() => {
    if (baseIconProp) {
      return baseIconProp;
    }
    return <AntDesign name="pluscircleo" size={size} color={lightColor} />;
  }, [baseIconProp, size]);

  const activeIcon = useMemo(() => {
    if (activeIconProp) {
      return activeIconProp;
    }
    return <FontAwesome6 name="check" size={size / 2} color={lightColor} />;
  }, [activeIconProp, size]);

  const rBaseIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      progress.value,
      [0, 0.5],
      [0, 45],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(progress.value, [0, 0.5], [1, 0]),
      transform: [
        {
          rotate: `${rotate}deg`,
        },
      ],
    };
  }, [progress]);

  const rActiveIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      progress.value,
      [0, 1],
      [-45, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(progress.value, [0, 1], [0, 1]),
      transform: [
        {
          rotate: `${rotate}deg`,
        },
      ],
    };
  }, [progress]);

  const blastCenterStyle = useMemo(() => {
    return {
      transform: [
        { translateX: -blastSize / 2 + size / 2 },
        { translateY: -blastSize / 2 + size / 2 },
      ],
    };
  }, [blastSize, size]);

  /**
   * Handles the button press animation and blast effect
   */
  const onPressHandler = useCallback(() => {
    onPress?.();
    progress.value = withSpring(1, BlastCurveConfig, isFinished => {
      if (autoReset && isFinished) {
        progress.value = withDelay(800, withSpring(0, BlastCurveConfig));
      }
    });
    blastEffectRef.current?.blast(BlastCurveConfig, 500);
  }, [autoReset, blastEffectRef, onPress, progress]);

  return (
    <View style={styles.boxContainer}>
      <View style={[styles.blastContainer, blastCenterStyle]}>
        <BlastCircleEffect
          blastRadius={blastRadius}
          size={blastSize}
          ref={blastEffectRef}
          count={20}
          circleRadius={2}
        />
      </View>
      <PressableScale style={boxStyle} onPress={onPressHandler}>
        <Animated.View style={[styles.iconContainer, rBaseIconStyle]}>
          {baseIcon}
        </Animated.View>
        <Animated.View style={[styles.iconContainer, rActiveIconStyle]}>
          {activeIcon}
        </Animated.View>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  boxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    ...StyleSheet.absoluteFillObject,
  },
  blastContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
