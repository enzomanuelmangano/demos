import { useCallback, useMemo } from 'react';

import { font } from '../../../constants';

export const useBoxWidths = ({
  tabs,
  internalBoxPadding,
}: {
  tabs: readonly string[];
  internalBoxPadding: number;
}) => {
  const textWidths = useMemo(() => {
    return tabs.map(tab => {
      return font.measureText(tab).width;
    });
  }, [tabs]);

  const totalWidth = useMemo(() => {
    return textWidths.reduce(
      (acc, width) => acc + width + internalBoxPadding * 2,
      0,
    );
  }, [internalBoxPadding, textWidths]);

  const getPreviousBoxWidth = useCallback(
    (index: number) => {
      'worklet';
      let width = 0;
      for (let i = 0; i < index; i++) {
        width += textWidths[i] + internalBoxPadding * 2;
      }
      return width;
    },
    [internalBoxPadding, textWidths],
  );

  return { textWidths, getPreviousBoxWidth, totalWidth };
};
