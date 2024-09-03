import { StyleSheet, View } from 'react-native';

import type { AnimatedCodeNumberProps } from './animated-code-number';
import { AnimatedCodeNumber } from './animated-code-number';

type VerificationCodeProps = {
  code: number[];
  maxLength?: number;
} & Pick<AnimatedCodeNumberProps, 'status'>;

export const VerificationCode: React.FC<VerificationCodeProps> = ({
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
  container: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  codeContainer: {
    aspectRatio: 0.95,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
