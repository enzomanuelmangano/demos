import { StyleSheet, Text, View } from 'react-native';

import { memo, useCallback, useState, type FC } from 'react';

import { Feather } from '@expo/vector-icons';
import { createAnimatedPressable } from 'pressto';
import { interpolate, useDerivedValue } from 'react-native-reanimated';

import { HideableNumber } from './hideable-number';

type CardInfoProps = {
  cardNumber: number;
};

const TouchableFeedback = createAnimatedPressable(progress => {
  'worklet';
  const opacity = interpolate(progress, [0, 1], [0, 0.1]).toFixed(2);
  const scale = interpolate(progress, [0, 1], [1, 0.9]);

  return {
    backgroundColor: `rgba(0,0,0,${opacity})`,
    transform: [{ scale }],
    borderRadius: 20,
  };
});

// Hoisted: Array.from's callback inside a worklet isn't workletized by
// react-native-worklets 0.8 and crashes the UI thread ("Tried to
// synchronously call a non-worklet function `_temp`"). The toggled set is
// static anyway — the first 12 digits.
const HIDDEN_INDEXES = Array.from({ length: 12 }, (_, index) => index);
const NO_HIDDEN_INDEXES: number[] = [];

export const CardInfo: FC<CardInfoProps> = memo(({ cardNumber }) => {
  const splittedNumber = cardNumber.toString().split('');

  const [toggled, setToggled] = useState(false);

  const hiddenIndexes = useDerivedValue(() => {
    return toggled ? HIDDEN_INDEXES : NO_HIDDEN_INDEXES;
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
      <TouchableFeedback
        testID="staggered-card-number-eye"
        onPress={onToggle}
        style={styles.button}>
        <Feather name={toggled ? 'eye' : 'eye-off'} size={24} color="#38a27b" />
      </TouchableFeedback>
    </View>
  );
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    borderCurve: 'continuous',
    borderRadius: 4,
    height: '100%',
    justifyContent: 'center',
  },
  container: {
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 20,
    boxShadow: '0px 2px 20px rgba(0, 0, 0, 0.05)',
    flexDirection: 'row',
    height: 80,
    paddingBottom: 10,
    paddingHorizontal: 25,
    paddingTop: 15,
    width: '90%',
  },
  numbers: {
    flexDirection: 'row',
    marginTop: 5,
  },
  title: {
    color: '#787878',
    fontSize: 17,
    fontWeight: '400',
  },
});
