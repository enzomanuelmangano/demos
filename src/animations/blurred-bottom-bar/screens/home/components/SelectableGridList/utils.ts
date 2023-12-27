interface GridItemProps {
  index: number;
  itemsPerRow: number;
  itemWidth: number;
  itemHeight: number;
}

// This utils function is used to calculate the index that is currently selected
// based on the x and y position of the gesture handler
// This is used to determine which item is currently selected
export const calculateGridItemIndex = ({
  x,
  y,
  itemsPerRow,
  itemWidth,
  itemHeight,
}: Omit<GridItemProps, 'index'> & { x: number; y: number }): number => {
  'worklet';

  const col = Math.floor(x / itemWidth);
  const row = Math.floor(y / itemHeight);

  const index = row * itemsPerRow + col;
  return index;
};

// This function will generate numbers in a range from the min between n and m to the max between n and m
// For instance if n = 3 and m = 1, it will generate [1, 2, 3]
// If n = 1 and m = 3, it will generate [1, 2, 3]
export function generateNumbersInRange(n: number, m: number) {
  'worklet';

  const min = Math.min(n, m);
  const max = Math.max(n, m);

  return Array(max - min + 1)
    .fill(0)
    .map((_, i) => i + min);
}

// check if two array contains the same elements
export const sameElements = (arr1: number[], arr2: number[]) => {
  'worklet';
  return (
    [...new Set(arr1)].sort().join(',') === [...new Set(arr2)].sort().join(',')
  );
};
