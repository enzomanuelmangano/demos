import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useMemo } from 'react';

import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlurredPopupProvider, TouchablePopupHandler } from './BlurredPopup';
import { DEMO_BUTTON_ROW_HEIGHT } from '../../navigation/home/demo-close-button';

const capitalize = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const size = 64;

const uri =
  'https://images.unsplash.com/photo-1508138221679-760a23a2285b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3348&q=80';

const angles = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

type Angle = (typeof angles)[number];

const PopupHandler = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // The top corners sit below the demo's close and info buttons.
  const topY = useSafeAreaInsets().top + DEMO_BUTTON_ROW_HEIGHT;

  const internalPadding = size / 2;
  const width = windowWidth - internalPadding * 2;
  const height = windowHeight - internalPadding * 2;

  const selectedAngle = useSharedValue<Angle>('top-left');

  const translateX = useSharedValue(size / 2);
  const translateY = useSharedValue(topY);

  const context = useSharedValue({
    x: 0,
    y: 0,
  });

  const gesture = Gesture.Pan()
    .onBegin(() => {
      context.set({
        x: translateX.get(),
        y: translateY.get(),
      });
    })
    .onUpdate(event => {
      translateX.set(event.translationX + context.get().x);
      translateY.set(event.translationY + context.get().y);
    });

  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: translateX.get(),
        },
        {
          translateY: translateY.get(),
        },
      ],
    };
  });

  const getRotationByAngle = (angle: Angle) => {
    switch (angle) {
      case 'top-right':
        return '0deg';
      case 'bottom-right':
        return '90deg';
      case 'top-left':
        return '270deg';
      case 'bottom-left':
        return '180deg';
    }
  };

  const options = useMemo(() => {
    return angles.map(angle => ({
      label: angle.split('-').map(capitalize).join(' '),
      trailing: (
        <>
          <FontAwesome
            name="location-arrow"
            size={14}
            color="gray"
            style={{
              transform: [
                {
                  rotate: getRotationByAngle(angle),
                },
              ],
            }}
          />
        </>
      ),
      onPress: () => {
        setTimeout(() => {
          selectedAngle.set(angle);
        }, 800);
      },
    }));
  }, [selectedAngle]);

  useAnimatedReaction(
    () => {
      return selectedAngle.get();
    },
    angle => {
      if (angle == null) {
        return;
      }
      const x = angle.includes('right')
        ? width - internalPadding
        : internalPadding;
      const y = angle.includes('bottom') ? height - size : topY;
      translateX.set(withSpring(x));
      translateY.set(withSpring(y));
    },
  );

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: '#111',
        },
      ]}>
      <Image
        source={{
          uri,
        }}
        style={{
          ...StyleSheet.absoluteFill,
        }}
      />
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              height: size,
              aspectRatio: 1,
            },
            rStyle,
          ]}>
          <TouchablePopupHandler
            style={{
              flex: 1,
            }}
            options={options}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'white',
                borderRadius: size / 2,
                borderCurve: 'continuous',
              }}
            />
          </TouchablePopupHandler>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const PopupHandlerContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BlurredPopupProvider maxBlur={10}>
        <PopupHandler />
      </BlurredPopupProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export { PopupHandlerContainer as PopupHandler };
