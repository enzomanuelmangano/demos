import { Dimensions } from 'react-native';

/** Grid layout constants */
export const SPACING = 8;
export const NUM_COLUMNS = 4;

const { width: WindowWidth } = Dimensions.get('window');

export const LayoutConfig = (() => {
  const horizontalPadding = SPACING * 2;
  const availableWidth = WindowWidth - horizontalPadding;

  // Calculate item size based on available width and fixed number of columns
  const totalSpacing = SPACING * (NUM_COLUMNS - 1);
  const itemSize = Math.floor((availableWidth - totalSpacing) / NUM_COLUMNS);

  return {
    itemSize,
    spacing: SPACING,
    containerPadding: horizontalPadding / 2,
  };
})();
