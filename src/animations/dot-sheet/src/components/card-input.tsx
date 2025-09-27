import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export type CardInputRefType = {
  blur: () => void;
  focus: () => void;
};

export const CardInput = forwardRef<
  CardInputRefType,
  {
    //
  }
>((_, ref) => {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const { top: safeTop } = useSafeAreaInsets();
  const animatedTextInput = useRef<TextInput>(null);

  useImperativeHandle(
    ref,
    () => ({
      blur: () => {
        animatedTextInput.current?.blur();
      },
      focus: () => {
        animatedTextInput.current?.focus();
      },
    }),
    [],
  );

  // useHeaderHeight() from react-navigation in a real use case
  const potentialHeaderHeight = 52;

  const inputRange = [0, 1];

  // -- Output Ranges constants --

  const initialCardHeight = height / 2.8;
  const expandedCardHeight = height;

  const initialCardWidth = initialCardHeight * (3 / 4);
  const expandedCardWidth = width - 2;

  const initialRotate = -4;
  const expandedRotate = 0;

  const initialTop = (height - initialCardHeight) / 2 + 35;
  const expandedTop = safeTop + potentialHeaderHeight;

  const initialLeft = (width - initialCardWidth) / 2;
  const expandedLeft = 1;

  const initialBorderRadius = 16;
  const expandedBorderRadius = 32;

  const rCardStyle = useAnimatedStyle(() => {
    // Pure interpolation magic. We map the progress value to the desired values
    // for each property of the card style object
    // I'm going to release a tutorial about the detailed usage of the interpolate function :)
    // However the idea is fairly simple. We map the progress value from 0 to 1 to the desired values
    // for each property of the card style object. The interpolate function will take care of the rest!
    const top = interpolate(progress.value, [0, 1], [initialTop, expandedTop]);

    const left = interpolate(progress.value, inputRange, [
      initialLeft,
      expandedLeft,
    ]);

    const cardHeight = interpolate(progress.value, inputRange, [
      initialCardHeight,
      expandedCardHeight,
    ]);

    const cardWidth = interpolate(progress.value, inputRange, [
      initialCardWidth,
      expandedCardWidth,
    ]);

    const rotate = interpolate(progress.value, inputRange, [
      initialRotate,
      expandedRotate,
    ]);

    const borderRadius = interpolate(progress.value, inputRange, [
      initialBorderRadius,
      expandedBorderRadius,
    ]);

    return {
      top,
      left,
      height: cardHeight,
      width: cardWidth,
      borderRadius,
      transform: [
        {
          rotate: `${rotate}deg`,
        },
      ],
    };
  }, []);

  const rTextInputStyle = useAnimatedStyle(() => {
    const marginTop = interpolate(progress.value, inputRange, [16, 24]);
    const fontSize = interpolate(progress.value, inputRange, [14, 24]);

    return {
      marginTop: marginTop,
      fontSize: fontSize,
    };
  }, []);

  const rBackIconStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
    };
  }, []);

  return (
    <>
      <PressableScale
        onPress={() => {
          // blurring the input will automatically animate the card
          // because of the onBlur callback
          animatedTextInput.current?.blur();
        }}
        style={[
          {
            // There are better ways to handle the top value, but this is just a demo :)
            top: safeTop + (Platform.OS === 'android' ? 8 : 0),
          },
          rBackIconStyle,
          styles.back,
        ]}>
        <Ionicons name="chevron-back-outline" size={24} color="#323232" />
      </PressableScale>
      <Animated.View
        style={[rCardStyle, styles.card]}
        onTouchEnd={() => {
          if (progress.value === 0) {
            animatedTextInput.current?.focus();
          }
        }}>
        <AnimatedTextInput
          ref={animatedTextInput}
          onFocus={() => {
            // Here's the magic, we animate the progress value in a reactive way
            progress.value = withTiming(1, { duration: 600 });
          }}
          onBlur={() => {
            // When the input is unfocused, we animate the progress value back to 0
            progress.value = withTiming(0, { duration: 600 });
          }}
          style={[styles.input, rTextInputStyle]}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="You can find the animation at ..."
          multiline
          placeholderTextColor="#b4b4b4"
        />
      </Animated.View>
    </>
  );
});

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    left: 16,
    height: 32,
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    position: 'absolute',
    borderCurve: 'continuous',
    zIndex: 1,
    backgroundColor: '#fff',
    shadowColor: '#c1c1c1',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  input: {
    marginLeft: 16,
    marginRight: 12,
    marginTop: 24,
    fontFamily: 'AddingtonCF-Light',
    textAlignVertical: 'top',
  },
});
