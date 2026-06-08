import { useMemo, useEffect } from 'react';

import { Extrapolate, interpolate } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  cancelAnimation,
  withSpring,
} from 'react-native-reanimated';

import type { RadarChartProps, RadarDataType } from '../typings';
import type { SharedValue } from 'react-native-reanimated';

const useUnwrappedValues = <K extends string>({
  data,
}: Pick<RadarChartProps<K>, 'data'>) => {
  // Handle both SharedValue and regular array data
  const isSharedValue = typeof data === 'object' && 'value' in data;
  const dataArray = isSharedValue
    ? (data as Readonly<SharedValue<RadarDataType<K>>>).get()
    : (data as RadarDataType<K>);

  const currentData = useSharedValue(dataArray);
  const targetData = useSharedValue(dataArray);
  const progress = useSharedValue(1);

  useEffect(() => {
    const newData = isSharedValue
      ? (data as Readonly<SharedValue<RadarDataType<K>>>).get()
      : (data as RadarDataType<K>);

    // Cancel any existing animation before starting a new one
    cancelAnimation(progress);

    // When the animation is interrupted, set current data to the interpolated position
    if (progress.get() < 1) {
      // Update current data to the current interpolated state before starting new animation
      const currentInterpolated = currentData.get().map((dataItem, index) => {
        const targetItem = targetData.get()[index];
        if (!targetItem) return dataItem;

        const interpolatedValues = Object.keys(dataItem.values).reduce(
          (acc, key) => {
            const currentValue = (dataItem.values as Record<string, number>)[
              key
            ];
            const targetValue = (targetItem.values as Record<string, number>)[
              key
            ];
            const interpolatedValue = interpolate(
              progress.get(),
              [0, 1],
              [currentValue, targetValue],
              Extrapolate.CLAMP,
            );
            return { ...acc, [key]: interpolatedValue };
          },
          {} as RadarDataType<K>[number]['values'],
        );

        return { ...dataItem, values: interpolatedValues };
      });

      currentData.set(currentInterpolated);
    }

    targetData.set(newData);
    progress.set(0);
    progress.set(withSpring(1, { duration: 500, dampingRatio: 1 }));
  }, [data, isSharedValue, targetData, progress, currentData]);

  const allValues = useDerivedValue(() => {
    // Explicit 'worklet' directives on the nested callbacks: the React
    // Compiler hoists them out of the surrounding worklet (as `_temp`), and
    // without the directive the hoisted function isn't workletized — the UI
    // thread then throws "Tried to synchronously call a non-worklet function".
    const current = currentData.get().map((item: RadarDataType<K>[number]) => {
      'worklet';
      return Object.values(item.values) as number[];
    });
    const target = targetData.get().map((item: RadarDataType<K>[number]) => {
      'worklet';
      return Object.values(item.values) as number[];
    });

    if (progress.get() === 1) {
      currentData.set(targetData.get());
      return target;
    }

    return current.map((currentValues: number[], dataIndex: number) => {
      'worklet';
      const targetValues = target[dataIndex] || currentValues;
      return currentValues.map((currentValue: number, valueIndex: number) => {
        'worklet';
        const targetValue = targetValues[valueIndex] || currentValue;
        return interpolate(
          progress.get(),
          [0, 1],
          [currentValue, targetValue],
          Extrapolate.CLAMP,
        );
      });
    });
  }, [data, progress]);

  const valuesLength = useMemo(() => {
    const currentDataArray = isSharedValue
      ? (data as Readonly<SharedValue<RadarDataType<K>>>).get()
      : (data as RadarDataType<K>);
    return currentDataArray.reduce(
      (acc: number, item: RadarDataType<K>[number]) => {
        return Math.max(acc, Object.keys(item.values).length);
      },
      0,
    );
  }, [data, isSharedValue]);

  return {
    allValues,
    valuesLength,
  };
};

export { useUnwrappedValues };
