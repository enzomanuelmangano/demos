import { useContext, useMemo } from 'react'; // Importing useContext and useMemo hooks from React

import { InternalStackedSheetContext, StackedSheetContext } from './context'; // Importing custom context objects

// Custom hook to access the stacked sheet context
export const useStackedSheet = () => {
  return useContext(StackedSheetContext); // Using useContext hook to access StackedSheetContext
};

// Custom hook to access internal stacked sheet information based on a key
export const useInternalStackedSheet = (key: string) => {
  const { stackedSheets } = useContext(InternalStackedSheetContext); // Extracting stackedSheets from InternalStackedSheetContext

  const id = useMemo(() => {
    // Using useMemo to memoize the ID calculation based on changes in key or stackedSheets

    // Finding the ID of the stacked sheet with the provided key
    return stackedSheets.find(item => item.key === key)?.id;
  }, [key, stackedSheets]);

  // This will calculate the "bottom displacement" of the stacked sheet based on its ID
  // The id is retrieved from the previous useMemo call (using the key)
  const bottomHeight = useMemo(() => {
    // Using useMemo to memoize the bottomHeight calculation based on changes in id or stackedSheets

    const offset = 35; // Offset value for calculation

    const biggestItemHeight = stackedSheets.reduce((prev, current) => {
      // Calculating the height of the tallest stacked sheet
      return prev > current.componentHeight ? prev : current.componentHeight;
    }, 0);

    const currentHeight =
      stackedSheets.find(item => item.id === id)?.componentHeight ?? 0; // Finding the height of the stacked sheet with the calculated ID
    return biggestItemHeight - currentHeight + Math.sign(id ?? 0) * offset; // Calculating the bottom height
  }, [id, stackedSheets]);

  return { id: id ?? 0, bottomHeight }; // Returning the calculated ID and bottom height
};
