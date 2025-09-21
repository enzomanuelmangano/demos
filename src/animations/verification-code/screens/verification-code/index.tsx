import React, { useCallback, useRef, useState } from 'react';
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

// Define props for VerificationCodeScreen component
type VerificationCodeScreenProps = {
  correctCode: number;
  onCorrectCode?: () => void;
  onWrongCode?: () => void;
};

// VerificationCodeScreen component definition
export const VerificationCodeScreen: React.FC<VerificationCodeScreenProps> = ({
  correctCode,
  onCorrectCode,
  onWrongCode,
}) => {
  // State to manage the entered verification code
  const [code, setCode] = useState<number[]>([]);

  // Shared value to track the verification status (inProgress, correct, wrong)
  const verificationStatus = useSharedValue<StatusType>('inProgress');

  // Hook to get the animated keyboard height
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  // Animated style for the keyboard avoiding view to adjust its position based on the keyboard height
  const rKeyboardAvoidingViewStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: keyboardHeight.value / 2,
        },
      ],
    };
  }, [keyboardHeight]);

  // Animated shake effect for the code container
  const { shake, rShakeStyle } = useAnimatedShake();

  // Reference to the invisible TextInput for handling code input
  const invisibleTextInputRef = useRef<TextInput>(null);

  // Function to reset the code and verification status after a delay
  const resetCode = useCallback(() => {
    setTimeout(() => {
      verificationStatus.value = 'inProgress';
      setCode([]);
      invisibleTextInputRef.current?.clear();
    }, 1000);
  }, [verificationStatus]);

  // Handler for wrong code entry
  const onWrongCodeWrapper = useCallback(() => {
    verificationStatus.value = 'wrong';
    // Trigger the shake animation
    shake();
    resetCode();
    onWrongCode?.();
  }, [onWrongCode, resetCode, shake, verificationStatus]);

  // Handler for correct code entry
  const onCorrectCodeWrapper = useCallback(() => {
    verificationStatus.value = 'correct';
    resetCode();
    onCorrectCode?.();
  }, [onCorrectCode, resetCode, verificationStatus]);

  // Maximum length of the code input based on the correct code
  const maxCodeLength = correctCode.toString().length;

  useFocusEffect(
    React.useCallback(() => {
      // When screen becomes active → focus
      invisibleTextInputRef.current?.focus();

      return () => {
        // When leaving screen → blur
        invisibleTextInputRef.current?.blur();
      };
    }, []),
  );

  // Render the component
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
          // If the code is longer than the correct code, we don't want to update it
          if (newCode.length > maxCodeLength) {
            return;
          }
          setCode(newCode);

          // If the code is correct, we want to trigger the onCorrectCode callback
          if (newCode.join('') === correctCode.toString()) {
            onCorrectCodeWrapper();
            return;
          }
          // If the code is wrong, we want to trigger the onWrongCode callback
          if (newCode.length === maxCodeLength) {
            onWrongCodeWrapper();
            return;
          }
          // If the code is still in progress, we want to reset the verification status
          verificationStatus.value = 'inProgress';
        }}
        keyboardType="number-pad"
        style={styles.invisibleInput}
      />
    </View>
  );
};

// Styles for the VerificationCodeScreen component
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
