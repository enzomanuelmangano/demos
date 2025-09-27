import { createRef, useMemo } from 'react';
import type { LayoutRectangle } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import type { MeasureableAnimatedViewRef } from '../components/MeasureableAnimatedView';
import type { HeaderListItem, ListItem } from '../constants';
import { isHeader } from '../constants';

import { useMounted } from './useMounted';

type UseHeaderLayoutParams = {
  headers: HeaderListItem[];
  itemHeight: number;
  headerHeight: number;
  data: (ListItem | HeaderListItem)[];
};

const useHeaderLayout = ({
  headers,
  data,
  itemHeight,
  headerHeight,
}: UseHeaderLayoutParams) => {
  const mounted = useMounted();

  const headersLayoutXRefs = useMemo(
    () =>
      // use refs to get the layout of the headers
      headers.map(() => createRef<MeasureableAnimatedViewRef>()),
    [headers],
  );

  const headersLayoutX = useDerivedValue<
    Record<string, LayoutRectangle>
  >(() => {
    'worklet';
    // The trick is that we wait few milliseconds before getting the layout of the headers.
    // Otherwise the layout isn't correct.
    // The interesting thing is that we're doing even that on the Main thread. (since mounted is a SharedValue).
    if (!mounted.value) {
      return {};
    }

    return headers.reduce((acc, { header }, i) => {
      const ref = headersLayoutXRefs[i];

      if (
        ref.current &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((acc as any)?.[header] == null || (acc as any)?.[header]?.width === 0)
      ) {
        const layout = ref.current?.reanimatedMeasure();
        if (layout) {
          return {
            ...acc,
            [header]: layout,
          };
        }
      }
      return acc;
    }, {});
  }, []);

  const headersLayoutXData = useDerivedValue<
    {
      header: string;
      value: LayoutRectangle;
    }[]
  >(() => {
    'worklet';

    const parsedHeaderData = Object.keys(headersLayoutX.value)
      .map(key => ({
        header: key,
        value: headersLayoutX.value[key],
      }))
      .filter(({ value }) => value != null)

      .sort((a, b) => a.value!.x - b.value!.x);

    if (parsedHeaderData.length !== headers.length) {
      return headers
        .map(({ header }, i) => ({
          header: header,
          value: {
            x: i,
            width: 0,
            y: 0,
            height: 0,
          },
        }))
        .sort((a, b) => a.value.x - b.value.x);
    }
    return parsedHeaderData;
  }, []);

  const headersLayoutY = useMemo(() => {
    const map = data.reduce(
      (acc, item: ListItem | HeaderListItem) => {
        if (isHeader(item)) {
          const headerItem = item as HeaderListItem;
          return {
            ...acc,
            count: acc.count + headerHeight,
            [headerItem.header]: acc.count,
          };
        }
        return {
          ...acc,
          count: acc.count + itemHeight,
        };
      },
      {
        count: 0,
      },
    ) as {
      [key: string]: number;
    };
    delete map.count;
    return Object.keys(map)
      .map((key: string) => ({
        header: key,
        value: map[key] as number,
      }))
      .sort((a, b) => a.value - b.value);
  }, [data, headerHeight, itemHeight]);

  return {
    headerRefs: headersLayoutXRefs,
    headersLayoutX: headersLayoutXData,
    headersLayoutY,
  };
};

export { useHeaderLayout };
