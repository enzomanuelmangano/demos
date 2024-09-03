import { useEffect } from 'react';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

// Define the type for the parameters of the custom hook
type UseActiveLetterAnimationParams = {
  letters?: string[]; // Array of letters to animate
  colors?: [string, string][]; // Array of color pairs for each letter
  timeInterval?: number; // Time interval for transitioning between letters
};

// Default letters and colors in case they are not provided
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
] as [string, string][]; // Array of default color pairs

// Custom hook to handle active letter animation
export const useActiveLetterAnimation = ({
  letters = DEFAULT_LETTERS,
  colors = DEFAULT_COLORS,
  timeInterval = 650,
}: UseActiveLetterAnimationParams = {}) => {
  // Define a shared value to keep track of the index of the active letter
  const activeLetterIndex = useSharedValue(0);

  useEffect(() => {
    // Start an interval to update the active letter index
    const interval = setInterval(() => {
      // Update the active letter index based on the time interval and the length of letters and colors arrays
      activeLetterIndex.value =
        (activeLetterIndex.value + 1) % Math.min(letters.length, colors.length);
    }, timeInterval);

    // Clean up the interval when the component unmounts or the dependencies change
    return () => clearInterval(interval);
  }, [activeLetterIndex, colors.length, letters.length, timeInterval]);

  // Derive the active letter and colors based on the active letter index
  const activeLetter = useDerivedValue(
    () => letters[activeLetterIndex.value],
    [letters],
  );
  const activeColors = useDerivedValue(
    () => colors[activeLetterIndex.value],
    [colors],
  );

  // Return the active letter and colors for consumption by the component
  return { activeLetter, activeColors };
};
