import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { MaterialIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Palette } from '../../constants/palette';

import type { AnimatedStyle } from 'react-native-reanimated';

type BottomFloatingButtonProps = {
  progress: SharedValue<number>;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
  onSelect?: (option: 'message' | 'default') => void;
};

const BottomFloatingButton: React.FC<BottomFloatingButtonProps> = ({
  progress: floatingProgress,
  style,
  onSelect,
}) => {
  const rFloatingIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      floatingProgress.get(),
      [0, 1],
      [0, 2 * Math.PI],
    );
    const rotateRad = `${rotate}rad`;

    return {
      transform: [
        {
          rotate: rotateRad,
        },
        {
          scale: interpolate(floatingProgress.get(), [0, 0.5, 1], [1, 1.2, 1]),
        },
      ],
    };
  }, []);

  const rMessageIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.get() <= 0.5 ? 0 : 1,
    };
  }, []);

  const rEditIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.get() > 0.5 ? 0 : 1,
    };
  }, []);

  const highlighted = useSharedValue(false);

  const gesture = Gesture.Tap()
    .maxDuration(10000)
    .onBegin(() => {
      highlighted.set(true);
    })
    .onTouchesUp(() => {
      const option = floatingProgress.get() > 0.5 ? 'default' : 'message';
      if (onSelect) scheduleOnRN(onSelect, option);
    })
    .onFinalize(() => {
      highlighted.set(false);
    });

  const rHighlightedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(highlighted.get() ? 0.8 : 1),
        },
      ],
    };
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, rFloatingIconStyle, rHighlightedStyle]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, rEditIconStyle, styles.center]}>
          <MaterialIcons name={'edit'} size={28} color={Palette.text} />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, rMessageIconStyle, styles.center]}>
          <MaterialIcons name={'message'} size={28} color={Palette.text} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { BottomFloatingButton };
