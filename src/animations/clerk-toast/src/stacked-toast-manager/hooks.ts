import { useContext, useMemo } from 'react'; // Importing useContext and useMemo hooks from React

import { InternalStackedToastContext, StackedToastContext } from './context'; // Importing custom context objects
import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from './constants';

// Custom hook to access the stacked toast context
export const useStackedToast = () => {
  return useContext(StackedToastContext); // Using useContext hook to access StackedToastContext
};

// Custom hook to access internal stacked toast information based on a key
export const useInternalStackedToast = (key: string) => {
  const { stackedToasts } = useContext(InternalStackedToastContext); // Extracting stackedToasts from InternalStackedToastContext

  const id = useMemo(() => {
    // Using useMemo to memoize the ID calculation based on changes in key or stackedToasts

    // Finding the ID of the stacked toast with the provided key
    return stackedToasts.find(item => item.key === key)?.id;
  }, [key, stackedToasts]);

  // This will calculate the "bottom displacement" of the stacked toast based on its ID
  // The id is retrieved from the previous useMemo call (using the key)
  const bottomHeight = useMemo(() => {
    const offset = 15; // Offset value for calculation

    return Math.min(id ?? 0, MAX_VISIBLE_TOASTS - 1) * (TOAST_HEIGHT + offset);
  }, [id]);

  return { id: id ?? 0, bottomHeight }; // Returning the calculated ID and bottom height
};
