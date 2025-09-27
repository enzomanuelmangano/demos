import { type FC, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { useFocusEffect } from 'expo-router';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useAnimatedShake } from '../../../email-demo/hooks/use-animated-shake';
import { VerificationCode } from '../../components/verification-code';
import type { StatusType } from '../../components/verification-code/animated-code-number';

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

  const resetCode = useCallback(() => {
    setTimeout(() => {
      verificationStatus.value = 'inProgress';
      setCode([]);
      invisibleTextInputRef.current?.clear();
    }, 1000);
  }, [verificationStatus]);

  const onWrongCodeWrapper = useCallback(() => {
    verificationStatus.value = 'wrong';
    shake();
    resetCode();
    onWrongCode?.();
  }, [onWrongCode, resetCode, shake, verificationStatus]);

  const onCorrectCodeWrapper = useCallback(() => {
    verificationStatus.value = 'correct';
    resetCode();
    onCorrectCode?.();
  }, [onCorrectCode, resetCode, verificationStatus]);

  const maxCodeLength = correctCode.toString().length;

  useFocusEffect(
    useCallback(() => {
      invisibleTextInputRef.current?.focus();

      return () => {
        invisibleTextInputRef.current?.blur();
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <Animated.View style={rKeyboardAvoidingViewStyle}>
        <View>
          <Text style={styles.headerText}>Enter Code</Text>
        </View>
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
      </Animated.View>

      {/* Invisible TextInput for handling code input */}
      {/* 
          Not sure if this is smart or dumb 😅
          I'm using an invisible TextInput to handle the code input.
          This will trigger the Keyboard to show up and all the keyboard events
          are going to be handled by this component and then forwarded to the
          VerificationCode component.
       */}
      <TextInput
        keyboardAppearance="default"
        autoFocus
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
        style={styles.invisibleInput}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: 'white',
    fontSize: 30,
    marginBottom: 30,
    marginLeft: 18,
  },
  codeContainer: {
    width: '100%',
  },
  invisibleInput: {
    position: 'absolute',
    bottom: -50,
  },
});
