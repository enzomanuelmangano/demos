import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type PressableScaleProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  style,
}) => {
  const isActive = useSharedValue(false);

  const gesture = Gesture.Tap()
    .onTouchesDown(() => {
      isActive.value = true;
    })
    .onTouchesUp(() => {
      if (onPress) {
        runOnJS(onPress)();
      }
      isActive.value = false;
    })
    .onFinalize(() => {
      isActive.value = false;
    })
    .maxDuration(10000);

  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isActive.value ? 0.95 : 1),
        },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, rStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
};

export { PressableScale };
