export const calculateStartAnimationDelay = (
  weekIndex: number,
  dayIndex: number,
  baseDelay: number,
): number => {
  return baseDelay * (weekIndex + (6 - dayIndex));
};

export const calculateResetAnimationDelay = (
  weekIndex: number,
  dayIndex: number,
  totalWeeks: number,
  baseDelay: number,
): number => {
  return baseDelay * (totalWeeks - 1 - weekIndex + dayIndex);
};
