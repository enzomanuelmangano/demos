import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

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
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 20,
    bottom: 0,
    height: BOTTOM_SHEET_HEIGHT,
    left: 0,
    paddingBottom: BOTTOM_SHEET_OFFSET,
    position: 'absolute',
    right: 0,
  },
});

export { BottomSheet };
