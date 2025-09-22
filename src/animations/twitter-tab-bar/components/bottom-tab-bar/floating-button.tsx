import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '../../constants/palette';

type BottomFloatingButtonProps = {
  progress: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  onSelect?: (option: 'message' | 'default') => void;
};

const BottomFloatingButton: React.FC<BottomFloatingButtonProps> = ({
  progress: floatingProgress,
  style,
  onSelect,
}) => {
  const rFloatingIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      floatingProgress.value,
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
          scale: interpolate(floatingProgress.value, [0, 0.5, 1], [1, 1.2, 1]),
        },
      ],
    };
  }, []);

  const rMessageIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.value <= 0.5 ? 0 : 1,
    };
  }, []);

  const rEditIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.value > 0.5 ? 0 : 1,
    };
  }, []);

  const highlighted = useSharedValue(false);

  const gesture = Gesture.Tap()
    .maxDuration(10000)
    .onBegin(() => {
      highlighted.value = true;
    })
    .onTouchesUp(() => {
      const option = floatingProgress.value > 0.5 ? 'default' : 'message';
      if (onSelect) runOnJS(onSelect)(option);
    })
    .onFinalize(() => {
      highlighted.value = false;
    });

  const rHighlightedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(highlighted.value ? 0.8 : 1),
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { BottomFloatingButton };
