export const GAP_MULTIPLIER = 4;

export const calculateOverlap = (gap: number): number => gap * GAP_MULTIPLIER;

export const calculateSectionWidth = (
  itemCount: number,
  itemSize: number,
  overlap: number,
): number => {
  if (itemCount === 0) return 0;
  return itemSize + (itemCount - 1) * (itemSize - overlap);
};

export const calculateGapWidth = (
  itemSize: number,
  overlap: number,
  sectionGap?: number,
): number => {
  const baseGapWidth = itemSize - overlap;
  return sectionGap !== undefined ? sectionGap : baseGapWidth;
};
