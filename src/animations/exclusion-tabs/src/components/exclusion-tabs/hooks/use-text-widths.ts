import { useCallback, useMemo } from 'react';

import { font } from '../../../constants';

export const useBoxWidths = ({
  tabs,
  internalBoxPadding,
}: {
  tabs: readonly string[];
  internalBoxPadding: number;
}) => {
  // Calculate the widths of all tab labels using the defined font.
  const textWidths = useMemo(() => {
    return tabs.map(tab => {
      return font.measureText(tab).width; // Measure the width of each tab's text.
    });
  }, [tabs]);

  const totalWidth = useMemo(() => {
    return textWidths.reduce(
      (acc, width) => acc + width + internalBoxPadding * 2,
      0,
    ); // Calculate the total width of all tabs.
  }, [internalBoxPadding, textWidths]);

  // Calculate the accumulated width of all previous tabs and their padding.
  const getPreviousBoxWidth = useCallback(
    (index: number) => {
      'worklet'; // Indicates that this function will be executed on the UI thread in Reanimated.
      let width = 0;
      for (let i = 0; i < index; i++) {
        width += textWidths[i] + internalBoxPadding * 2; // Add each tab's width and padding.
      }
      return width; // Return the accumulated width.
    },
    [internalBoxPadding, textWidths],
  );

  return { textWidths, getPreviousBoxWidth, totalWidth };
};
