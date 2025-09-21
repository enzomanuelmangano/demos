import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { FLOATING_BUTTON_SIZE } from '../constants';

type ModalProps = {
  children?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  isVisible: SharedValue<boolean>;
};

const ModalContent: React.FC<ModalProps> = React.memo(
  ({ children, isVisible, contentContainerStyle }) => {
    const rAnimatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible.value ? 1 : 0, {
          duration: 100,
        }),
      };
    }, [isVisible]);

    const rAnimatedProps = useAnimatedProps(() => {
      // Check the AnimatedBackdrop component for more details :)
      return {
        pointerEvents: isVisible.value ? 'auto' : 'none',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }, [isVisible]);

    return (
      <Animated.View
        animatedProps={rAnimatedProps}
        style={[
          {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
          },
          rAnimatedStyle,
        ]}>
        <View style={styles.modalContainerTitle}>
          <Text style={styles.modalTitle}>New</Text>
        </View>

        <View style={[{ flex: 1 }, contentContainerStyle]}>{children}</View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonTitle}>Done</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  modalContainerTitle: {
    height: FLOATING_BUTTON_SIZE,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },

  buttonContainer: {
    height: 80,
    width: '100%',
  },
  button: {
    flex: 1,
    backgroundColor: '#111',
    margin: 10,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
});

export { ModalContent };
