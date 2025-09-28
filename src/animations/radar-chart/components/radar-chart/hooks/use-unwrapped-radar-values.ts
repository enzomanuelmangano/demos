import { useMemo, useEffect } from 'react';

import { Extrapolate, interpolate } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import type { RadarChartProps, RadarDataType } from '../typings';
import type { SharedValue } from 'react-native-reanimated';

const useUnwrappedValues = <K extends string>({
  data,
}: Pick<RadarChartProps<K>, 'data'>) => {
  // Handle both SharedValue and regular array data
  const isSharedValue = typeof data === 'object' && 'value' in data;
  const dataArray = isSharedValue
    ? (data as Readonly<SharedValue<RadarDataType<K>>>).value
    : (data as RadarDataType<K>);

  const currentData = useSharedValue(dataArray);
  const targetData = useSharedValue(dataArray);
  const progress = useSharedValue(1);

  useEffect(() => {
    const newData = isSharedValue
      ? (data as Readonly<SharedValue<RadarDataType<K>>>).value
      : (data as RadarDataType<K>);

    // Cancel any existing animation before starting a new one
    cancelAnimation(progress);

    // When the animation is interrupted, set current data to the interpolated position
    if (progress.value < 1) {
      // Update current data to the current interpolated state before starting new animation
      const currentInterpolated = currentData.value.map((dataItem, index) => {
        const targetItem = targetData.value[index];
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
              progress.value,
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

      currentData.value = currentInterpolated;
    }

    targetData.value = newData;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 150 });
  }, [data, isSharedValue, targetData, progress, currentData]);

  const allValues = useDerivedValue(() => {
    const current = currentData.value.map(
      (item: RadarDataType<K>[number]) =>
        Object.values(item.values) as number[],
    );
    const target = targetData.value.map(
      (item: RadarDataType<K>[number]) =>
        Object.values(item.values) as number[],
    );

    if (progress.value === 1) {
      currentData.value = targetData.value;
      return target;
    }

    return current.map((currentValues: number[], dataIndex: number) => {
      const targetValues = target[dataIndex] || currentValues;
      return currentValues.map((currentValue: number, valueIndex: number) => {
        const targetValue = targetValues[valueIndex] || currentValue;
        return interpolate(
          progress.value,
          [0, 1],
          [currentValue, targetValue],
          Extrapolate.CLAMP,
        );
      });
    });
  }, [data, progress]);

  const valuesLength = useMemo(() => {
    const currentDataArray = isSharedValue
      ? (data as Readonly<SharedValue<RadarDataType<K>>>).value
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
