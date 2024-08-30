import { Extrapolate, interpolate } from '@shopify/react-native-skia';
import { useCallback } from 'react';
import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { RadarDataType } from './typings';

const useRadarValue = <K extends string>(initialValue: RadarDataType<K>) => {
  const data = useSharedValue(initialValue);
  const nextData = useSharedValue<typeof initialValue | null>(null);

  const progressAnimation = useSharedValue(0);

  useAnimatedReaction(
    () => {
      return nextData.value;
    },
    current => {
      if (current == null) return;

      cancelAnimation(progressAnimation);
      progressAnimation.value = 0;
      progressAnimation.value = withTiming(1, { duration: 200 }, isFinished => {
        if (isFinished) {
          data.value = [...current];
          nextData.value = null;
        }
      });
    },
  );

  // useValueEffect(nextData, () => {
  //   if (nextData.current == null) return;

  //   progressAnimation.current = 0;
  //   runTiming(progressAnimation, { to: 1 }, { duration: 200 }, isFinished => {
  //     if (isFinished && nextData.current != null) {
  //       data.current = [...nextData.current];
  //       progressAnimation.current = 0;
  //       nextData.current = null;
  //     }
  //   });
  // });

  const computedData = useDerivedValue(() => {
    if (nextData.value == null) {
      return data.value;
    }

    const animatedData = data.value.map((dataItem, index) => {
      if (nextData.value == null) return dataItem;
      const nextDataItem = nextData.value[index];
      const computedValues = Object.keys(dataItem.values).reduce(
        (values, key) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const value = (dataItem as any).values[key] as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nextValue = (nextDataItem as any).values[key] as number;

          const computedValue = interpolate(
            progressAnimation.value,
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
    nextData.value = [...val];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data: computedData,
    updateData: updateData,
  };
};

export { useRadarValue };
