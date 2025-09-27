import { type FC, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

type BottomSheetProps = {
  animationProgress: SharedValue<number>;
};

const BOTTOM_SHEET_OFFSET = 100;
const BOTTOM_SHEET_HEIGHT = 200 + BOTTOM_SHEET_OFFSET;

const BottomSheet: FC<BottomSheetProps> = memo(({ animationProgress }) => {
  const rBottomSheetStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      animationProgress.value,
      [0, 1],
      [BOTTOM_SHEET_HEIGHT, BOTTOM_SHEET_OFFSET],
      Extrapolation.EXTEND,
    );
    return {
      transform: [
        {
          translateY,
        },
      ],
    };
  }, []);

  const rTextStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animationProgress.value,
      [0.2, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
    };
  }, []);

  return (
    <Animated.View style={[styles.container, rBottomSheetStyle]}>
      <View style={{ flex: 1, paddingVertical: 20, paddingHorizontal: '5%' }}>
        <Animated.Text
          style={[{ fontSize: 20, fontWeight: 'bold' }, rTextStyle]}>
          Payment Confirmation
        </Animated.Text>
        <Animated.Text style={[{ marginTop: 10 }, rTextStyle]}>
          Are you sure you want to add this item to your cart?
        </Animated.Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_SHEET_HEIGHT,
    paddingBottom: BOTTOM_SHEET_OFFSET,
    backgroundColor: 'white',
    borderRadius: 20,
  },
});

export { BottomSheet };
