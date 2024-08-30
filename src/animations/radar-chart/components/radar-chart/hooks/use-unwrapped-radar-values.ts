import { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';

import type { RadarChartProps } from '../typings';
import { unwrapRef } from '../utils/unwrap-ref';

const useUnwrappedValues = <K extends string>({
  data,
}: Pick<RadarChartProps<K>, 'data'>) => {
  const allValues = useDerivedValue(
    () =>
      unwrapRef(data).value.map(item => Object.values(item.values) as number[]),
    [data],
  );

  const valuesLength = useMemo(() => {
    return allValues.value.reduce((acc, item) => {
      return Math.max(acc, item.length);
    }, 0);
  }, [allValues]);

  return {
    allValues,
    valuesLength,
  };
};

export { useUnwrappedValues };
