import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type FC, memo, type ReactNode } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { FLOATING_BUTTON_SIZE } from '../constants';

import type { StyleProp, ViewStyle } from 'react-native';

type ModalProps = {
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  isVisible: SharedValue<boolean>;
};

const ModalContent: FC<ModalProps> = memo(
  ({ children, isVisible, contentContainerStyle }) => {
    const rAnimatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible.value ? 1 : 0, {
          duration: 100,
        }),
      };
    }, [isVisible]);

    const rAnimatedProps = useAnimatedProps(() => {
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
  button: {
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    margin: 10,
  },
  buttonContainer: {
    height: 80,
    width: '100%',
  },

  buttonTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  modalContainerTitle: {
    height: FLOATING_BUTTON_SIZE,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export { ModalContent };
