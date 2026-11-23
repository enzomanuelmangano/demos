import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo } from 'react';

import { Dots } from './Dots';

import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

type PinAreaProps = {
  activeDots: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  dotsAmount?: number;
};

const PinArea: FC<PinAreaProps> = memo(({ activeDots, style, dotsAmount }) => {
  return (
    <View style={style}>
      <Text
        style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
        }}>
        Enter PIN Mode
      </Text>
      <Dots
        activeDots={activeDots}
        contentContainerStyle={styles.dotsContainer}
        amount={dotsAmount}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  dotsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 25,
    marginTop: 20,
    width: '100%',
  },
});

export { PinArea };
