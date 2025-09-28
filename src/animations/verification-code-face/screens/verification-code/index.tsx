import {
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { type FC, useCallback, useRef, useState } from 'react';

import { useFocusEffect } from 'expo-router';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { VerificationCode } from '../../components/verification-code';
import { useAnimatedShake } from '../../components/verification-code/hooks/use-animated-shake';
import { IconSquare } from '../../components/verification-code/icon-square';

import type { StatusType } from '../../components/verification-code/animated-code-number';
import type { InternalIconRef } from '../../components/verification-code/icon-square/icon';

type VerificationCodeScreenProps = {
  correctCode: number;
  onCorrectCode?: () => void;
  onWrongCode?: () => void;
};

export const VerificationCodeScreen: FC<VerificationCodeScreenProps> = ({
  correctCode,
  onCorrectCode,
  onWrongCode,
}) => {
  const [code, setCode] = useState<number[]>([]);
  const verificationStatus = useSharedValue<StatusType>('inProgress');
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const rKeyboardAvoidingViewStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: keyboardHeight.value / 2,
        },
      ],
    };
  }, [keyboardHeight]);

  const { shake, rShakeStyle } = useAnimatedShake();
  const invisibleTextInputRef = useRef<TextInput>(null);
  const iconSquareRef = useRef<InternalIconRef>(null);

  useFocusEffect(
    useCallback(() => {
      invisibleTextInputRef.current?.focus();

      return () => {
        invisibleTextInputRef.current?.blur();
      };
    }, []),
  );

  const resetCode = useCallback(() => {
    setTimeout(() => {
      verificationStatus.value = 'inProgress';
      setCode([]);
      invisibleTextInputRef.current?.clear();
      iconSquareRef.current?.normal();
    }, 1000);
  }, [verificationStatus]);

  const onWrongCodeWrapper = useCallback(() => {
    verificationStatus.value = 'wrong';
    shake();
    resetCode();
    onWrongCode?.();
    iconSquareRef.current?.sad();
  }, [onWrongCode, resetCode, shake, verificationStatus]);

  const onCorrectCodeWrapper = useCallback(() => {
    verificationStatus.value = 'correct';
    resetCode();
    onCorrectCode?.();
    iconSquareRef.current?.happy();
  }, [onCorrectCode, resetCode, verificationStatus]);

  const maxCodeLength = correctCode.toString().length;

  return (
    <View style={styles.container}>
      <Animated.View style={rKeyboardAvoidingViewStyle}>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 80,
          }}>
          <IconSquare
            ref={iconSquareRef}
            currentCodeLength={code.length}
            maxCodeLength={maxCodeLength}
          />
        </View>
        <TouchableWithoutFeedback
          onPress={() => {
            invisibleTextInputRef.current?.focus();
          }}>
          <Animated.View
            style={[styles.codeContainer, rShakeStyle]}
            onTouchEnd={() => {
              invisibleTextInputRef.current?.focus();
            }}>
            <VerificationCode
              status={verificationStatus}
              code={code}
              maxLength={maxCodeLength}
            />
          </Animated.View>
        </TouchableWithoutFeedback>
      </Animated.View>

      <TextInput
        keyboardAppearance="light"
        ref={invisibleTextInputRef}
        onChangeText={text => {
          const newCode = text.split('').map(item => +item);
          if (newCode.length > maxCodeLength) {
            return;
          }
          setCode(newCode);

          if (newCode.join('') === correctCode.toString()) {
            onCorrectCodeWrapper();
            return;
          }
          if (newCode.length === maxCodeLength) {
            onWrongCodeWrapper();
            return;
          }
          verificationStatus.value = 'inProgress';
        }}
        keyboardType="number-pad"
        autoFocus
        style={styles.invisibleInput}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  codeContainer: {
    width: '100%',
  },
  container: {
    alignItems: 'center',
    backgroundColor: 'white',
    flex: 1,
    justifyContent: 'center',
  },
  invisibleInput: {
    bottom: -50,
    position: 'absolute',
  },
});
