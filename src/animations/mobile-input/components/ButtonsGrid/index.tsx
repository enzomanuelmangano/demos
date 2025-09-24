import { FontAwesome5 } from '@expo/vector-icons';
import { type FC, memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { InputButton } from './InputButton';

const items = [
  { label: 1 },
  { label: 2 },
  { label: 3 },
  { label: 4 },
  { label: 5 },
  { label: 6 },
  { label: 7 },
  { label: 8 },
  { label: 9 },
  { label: null },
  { label: 0 },
  { label: 'backspace' },
];

type ButtonsGridProps = {
  pin: SharedValue<number[]>;
  onReset?: () => void;
};

const ButtonsGrid: FC<ButtonsGridProps> = memo(({ pin, onReset }) => {
  return (
    <View style={styles.container}>
      {items.map(({ label }, index) => {
        return (
          <InputButton
            key={index}
            style={styles.input}
            onTap={() => {
              if (typeof label === 'number') {
                pin.value = [...pin.value, label];
                return;
              }
              if (label === 'backspace') {
                onReset?.();
              }
            }}>
            {typeof label === 'number' && (
              <Text style={styles.number}>{label}</Text>
            )}
            {label === 'backspace' && (
              <FontAwesome5 name={label} size={24} color="white" />
            )}
          </InputButton>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  input: {
    width: '30%',
    height: '20%',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    marginLeft: 7 / 3 + '%',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    marginBottom: 7 / 3 + '%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    textAlign: 'center',
    fontSize: 30,
    color: 'white',
  },
});

export { ButtonsGrid };
