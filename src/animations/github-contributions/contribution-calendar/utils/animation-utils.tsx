export const calculateStartAnimationDelay = (
  weekIndex: number,
  dayIndex: number,
  baseDelay: number,
): number => {
  // Bottom-left to top-right: start from Sunday (dayIndex=6) of first week (weekIndex=0)
  return baseDelay * (weekIndex + (6 - dayIndex));
};

export const calculateResetAnimationDelay = (
  weekIndex: number,
  dayIndex: number,
  totalWeeks: number,
  baseDelay: number,
): number => {
  // Top-right to bottom-left: start from Monday (dayIndex=0) of last week
  return baseDelay * (totalWeeks - 1 - weekIndex + dayIndex);
};
