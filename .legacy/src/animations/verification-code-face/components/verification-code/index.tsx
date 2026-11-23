import { StyleSheet, View } from 'react-native';

import { AnimatedCodeNumber } from './animated-code-number';

import type { AnimatedCodeNumberProps } from './animated-code-number';
import type { FC } from 'react';

type VerificationCodeProps = {
  code: number[];
  maxLength?: number;
} & Pick<AnimatedCodeNumberProps, 'status'>;

export const VerificationCode: FC<VerificationCodeProps> = ({
  code,
  maxLength = 5,
  status,
}) => {
  return (
    <View style={styles.container}>
      {new Array(maxLength).fill(0).map((_, index) => (
        <View key={index} style={styles.codeContainer}>
          <AnimatedCodeNumber
            code={code[index]}
            status={status}
            highlighted={index === code.length}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  codeContainer: {
    alignItems: 'center',
    aspectRatio: 0.95,
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    width: '100%',
  },
});
