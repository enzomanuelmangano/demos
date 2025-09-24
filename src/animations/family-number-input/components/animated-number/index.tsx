import { type FC, useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { getCommasArray } from '../../utils/get-commas-array';

import { AnimatedSingleNumber } from './individual-number';

type AnimatedNumberProps = {
  value: number;
};

export const AnimatedNumber: FC<AnimatedNumberProps> = ({ value }) => {
  const splittedValue = useMemo(() => {
    return value.toString().split('');
  }, [value]);

  const commas = useMemo(() => {
    return getCommasArray(value);
  }, [value]);

  const ITEM_WIDTH = 55;
  const ITEM_HEIGHT = 100;
  const SCALE = 1 - splittedValue.length * 0.05;
  const SCALE_WIDTH_OFFSET = 0.08;
  const SCALED_WIDTH = ITEM_WIDTH * (SCALE + SCALE_WIDTH_OFFSET);
  const COMMA_SPACE = 10 * (1 - splittedValue.length * 0.025);

  const buildIndividualNumber = useCallback(
    (params: {
      index: number;
      item: string;
      containerStyle?: StyleProp<ViewStyle>;
    }) => {
      return (
        <AnimatedSingleNumber
          index={params.index}
          value={params.item}
          scale={SCALE}
          scaleWidthOffset={SCALE_WIDTH_OFFSET}
          key={params.index + params.item.toString()}
          rightSpace={
            commas.slice(0, params.index).filter(v => v === ',').length *
            COMMA_SPACE
          }
          totalNumbersLength={splittedValue.length}
          itemWidth={ITEM_WIDTH}
          itemHeight={ITEM_HEIGHT}
          containerStyle={[styles.itemContainer, params.containerStyle ?? {}]}
          style={styles.item}
        />
      );
    },
    [COMMA_SPACE, SCALE, commas, splittedValue.length],
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        right: commas.filter(v => v === ',').length * COMMA_SPACE,
        top: 10,
        backgroundColor: 'transparent',
      }}>
      {splittedValue.map((item, index) => {
        return buildIndividualNumber({ index, item });
      })}
      {commas.map((item, index) => {
        if (item === '') return null;

        return buildIndividualNumber({
          index,
          item,
          containerStyle: {
            marginLeft: SCALED_WIDTH / 2 + COMMA_SPACE / 2,
          },
        });
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  item: {
    fontSize: 90,
    color: 'white',
    fontWeight: 'bold',
    width: 60,
    textAlign: 'center',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  itemContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
