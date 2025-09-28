import { useEffect } from 'react';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

type UseActiveLetterAnimationParams = {
  letters?: string[];
  colors?: [string, string][];
  timeInterval?: number;
};

const DEFAULT_LETTERS = ['Y', 'O', 'U', 'R', 'L', 'O', 'G', 'O'];
const DEFAULT_COLORS = [
  ['#22AAA1', '#4CE0D2'],
  ['#E55934', '#FA7921'],
  ['#F2C94C', '#F2C94C'],
  ['#3C40C6', '#575FCF'],
  ['#2F80ED', '#56CCF2'],
  ['#F7A072', '#FFD56D'],
  ['#3C40C6', '#575FCF'],
  ['#2F80ED', '#56CCF2'],
] as [string, string][];

export const useActiveLetterAnimation = ({
  letters = DEFAULT_LETTERS,
  colors = DEFAULT_COLORS,
  timeInterval = 650,
}: UseActiveLetterAnimationParams = {}) => {
  const activeLetterIndex = useSharedValue(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Update the active letter index based on the time interval and the length of letters and colors arrays
      activeLetterIndex.value =
        (activeLetterIndex.value + 1) % Math.min(letters.length, colors.length);
    }, timeInterval);

    return () => clearInterval(interval);
  }, [activeLetterIndex, colors.length, letters.length, timeInterval]);

  const activeLetter = useDerivedValue(
    () => letters[activeLetterIndex.value],
    [letters],
  );
  const activeColors = useDerivedValue(
    () => colors[activeLetterIndex.value],
    [colors],
  );

  return { activeLetter, activeColors };
};
