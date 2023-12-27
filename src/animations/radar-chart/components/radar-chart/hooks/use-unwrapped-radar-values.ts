import { useComputedValue } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import type { RadarChartProps } from '../typings';
import { unwrapRef } from '../utils/unwrap-ref';

const useUnwrappedValues = <K extends string>({
  data,
}: Pick<RadarChartProps<K>, 'data'>) => {
  const allValues = useComputedValue(
    () =>
      unwrapRef(data).current.map(
        item => Object.values(item.values) as number[],
      ),
    [data],
  );

  const valuesLength = useMemo(() => {
    return allValues.current.reduce((acc, item) => {
      return Math.max(acc, item.length);
    }, 0);
  }, [allValues]);

  return {
    allValues,
    valuesLength,
  };
};

export { useUnwrappedValues };
