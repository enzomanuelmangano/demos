export type ContributionData = Record<string, number>;

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type CalendarAnimationControls = {
  startAnimation: () => void;
  resetAnimation: () => void;
  toggleAnimation: () => void;
};
