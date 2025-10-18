import { Dimensions, StyleSheet, View } from 'react-native';

import { type FC, type ReactNode } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Backdrop } from './Backdrop';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

type BottomSheetProps = {
  children?: ReactNode;
  active: SharedValue<boolean>;
  translateY: SharedValue<number>;
  scrollTo: (destination: number) => void;
};

const BottomSheet: FC<BottomSheetProps> = ({
  children,
  translateY,
  active,
  scrollTo,
}) => {
  const context = useSharedValue({ y: 0 });

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate(event => {
      if (event.translationY > 0) {
        translateY.value = event.translationY + context.value.y;
        translateY.value = Math.max(translateY.value, MAX_TRANSLATE_Y);
      }
    })
    .onEnd(event => {
      if (event.translationY > 100) {
        scrollTo(0);
      } else {
        scrollTo(context.value.y);
      }
    });

  const rBottomSheetStyle = useAnimatedStyle(() => {
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

  const rSpacerViewStyle = useAnimatedStyle(() => {
    return {
      height: Math.max(SCREEN_HEIGHT + translateY.value, 0),
    };
  }, []);

  const rChildrenStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(active.value ? 1 : 0, { duration: 150 }),
    };
  }, []);

  return (
    <>
      <Backdrop
        onTap={() => {
          scrollTo(0);
        }}
        isActive={active}
      />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.bottomSheetContainer, rBottomSheetStyle]}>
          <View style={styles.line} />
          <Animated.View style={[styles.fill, rChildrenStyle]}>
            {children}
          </Animated.View>
          <Animated.View style={rSpacerViewStyle} />
        </Animated.View>
      </GestureDetector>
    </>
  );
};

const styles = StyleSheet.create({
  bottomSheetContainer: {
    backgroundColor: '#171717',
    borderCurve: 'continuous',
    borderRadius: 25,
    height: SCREEN_HEIGHT,
    position: 'absolute',
    top: SCREEN_HEIGHT,
    width: '100%',
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

export { BottomSheet };
