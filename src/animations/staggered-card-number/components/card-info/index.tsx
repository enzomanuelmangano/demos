import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useState, type FC } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { TouchableFeedback } from '../touchables/touchable-feedback';

import { HideableNumber } from './hideable-number';

type CardInfoProps = {
  cardNumber: number;
};

export const CardInfo: FC<CardInfoProps> = memo(({ cardNumber }) => {
  const splittedNumber = cardNumber.toString().split('');

  const [toggled, setToggled] = useState(false);

  const hiddenIndexes = useDerivedValue(() => {
    if (toggled) {
      return Array.from({ length: 12 }, (_, index) => index);
    }
    return [];
  }, [toggled]);

  const onToggle = useCallback(() => {
    setToggled(prev => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>Number</Text>
        <View style={styles.numbers}>
          {splittedNumber.map((number, index) => {
            return (
              <View
                key={index}
                style={{
                  marginRight: index !== 0 && (index + 1) % 4 === 0 ? 8 : 0,
                }}>
                <HideableNumber
                  number={number}
                  hiddenIndexes={hiddenIndexes}
                  index={index}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <TouchableFeedback onTap={onToggle} style={styles.button}>
        <Feather name={toggled ? 'eye' : 'eye-off'} size={24} color="#38a27b" />
      </TouchableFeedback>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 80,
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 20,
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    flexDirection: 'row',
  },
  title: {
    fontSize: 17,
    color: '#787878',
    fontWeight: '400',
  },
  button: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numbers: {
    flexDirection: 'row',
    marginTop: 5,
  },
});
