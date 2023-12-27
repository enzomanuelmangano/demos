import {
  Extrapolate,
  interpolate,
  runTiming,
  useComputedValue,
  useValue,
  useValueEffect,
} from '@shopify/react-native-skia';
import { useCallback } from 'react';

import type { RadarDataType } from './typings';

const useRadarValue = <K extends string>(initialValue: RadarDataType<K>) => {
  const data = useValue(initialValue);
  const nextData = useValue<typeof initialValue | null>(null);

  const progressAnimation = useValue(0);

  useValueEffect(nextData, () => {
    if (nextData.current == null) return;

    progressAnimation.current = 0;
    runTiming(progressAnimation, { to: 1 }, { duration: 200 }, isFinished => {
      if (isFinished && nextData.current != null) {
        data.current = [...nextData.current];
        progressAnimation.current = 0;
        nextData.current = null;
      }
    });
  });

  const computedData = useComputedValue(() => {
    if (nextData.current == null) {
      return data.current;
    }

    const animatedData = data.current.map((dataItem, index) => {
      if (nextData.current == null) return dataItem;
      const nextDataItem = nextData.current[index];
      const computedValues = Object.keys(dataItem.values).reduce(
        (values, key) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const value = (dataItem as any).values[key] as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nextValue = (nextDataItem as any).values[key] as number;

          const computedValue = interpolate(
            progressAnimation.current,
            [0, 1],
            [value, nextValue],
            Extrapolate.CLAMP,
          );

          return { ...values, [key]: computedValue };
        },
        {},
      );

      return {
        ...dataItem,
        values: computedValues,
      };
    });

    return animatedData;
  }, [data, progressAnimation, nextData]);

  const updateData = useCallback((val: RadarDataType<K>) => {
    nextData.current = [...val];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data: computedData,
    updateData: updateData,
  };
};

export { useRadarValue };
